'use client'
import type { OCRResult } from '@/types'

let worker: any = null
let workerReady = false

export async function initTesseractWorker() {
  if (typeof window === 'undefined' || workerReady) return
  try {
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('eng', 1, { logger: () => {}, errorHandler: () => {} })
    workerReady = true
  } catch (e) { console.warn('Tesseract init failed:', e) }
}

export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const MAX = 1600
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.filter = 'contrast(1.4) brightness(1.05) grayscale(1)'
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = url
  })
}

// ─── Phone normalisation ──────────────────────────────────────────────────────
// Rules (in priority order):
//  1. Full intl number with +: keep as-is after cleaning
//  2. Starts with 00: strip 00, add +
//  3. 10+ digit string starting with country code digits: add +
//  4. Exactly 8 digits (local only): add default country code +974
//  5. Anything else with 8-14 digits: treat as local, add +974

const DEFAULT_COUNTRY_CODE = '+974'

function normalisePhone(raw: string): string | null {
  // Remove parens, spaces, dashes but keep leading +
  const s = raw.replace(/[()]/g, '').replace(/[\s\-]/g, '').trim()
  if (!s) return null

  let digits = s.replace(/\D/g, '')
  const hasPlus = s.startsWith('+')

  // Rule 1: has + prefix
  if (hasPlus) {
    if (digits.length >= 9 && digits.length <= 15) return '+' + digits
    return null
  }

  // Rule 2: starts with 00 (intl prefix)
  if (s.startsWith('00') && digits.length >= 11) return '+' + digits.slice(2)

  // Rule 3: 11-15 digits starting with a known country prefix (974, 966, 971, etc.)
  if (digits.length >= 11 && digits.length <= 15) return '+' + digits

  // Rule 4: exactly 8 digits — local number, prepend default country code
  if (digits.length === 8) return DEFAULT_COUNTRY_CODE + digits

  // Rule 5: 9-10 digits — could be local with extra digit, prepend country code
  if (digits.length >= 9 && digits.length <= 10) return DEFAULT_COUNTRY_CODE + digits

  return null
}

// Split a normalised full number (+CCCLLLLLLLL) into code and local parts
function splitFull(full: string): { code: string; local: string } {
  if (!full.startsWith('+')) return { code: DEFAULT_COUNTRY_CODE, local: full }
  const digits = full.slice(1)
  // Last 8 digits = local, rest = country code
  if (digits.length > 8) {
    return { code: '+' + digits.slice(0, digits.length - 8), local: digits.slice(-8) }
  }
  return { code: DEFAULT_COUNTRY_CODE, local: digits }
}

// ─── Extract phone from OCR text ─────────────────────────────────────────────
// Handles all bill formats observed:
//   Snoonu:  "Customer Phone: +97451118518" or "+66915444" or "66915444"
//   Rafeeq:  "Mobile number (الهاتف) :\n(+974) 55575759"
//             "Phone Number : (+974) 50306006"
//   Hurrier: "TEL: +97455985888"
//   Izghawa: phone on line after customer name (no label)

function extractPhone(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim())

  // Phone field labels — all formats seen
  const PHONE_LABEL = /customer\s*phone|mobile\s*number|mobile\s*no|phone\s*number|phone\s*no|\btel\b|telephone|contact\s*phone|هاتف|جوال|الهاتف|رقم الهاتف/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!PHONE_LABEL.test(line)) continue

    // Try extracting number from SAME line (after label / colon)
    // e.g. "Customer Phone: +97451118518" or "Customer Phone: 66915444"
    const afterColon = line.replace(/^[^:]+:\s*/, '').trim()
    if (afterColon) {
      const n = normalisePhone(afterColon)
      if (n) return n
    }

    // Try next line (Rafeeq format — label on one line, number on next)
    if (i + 1 < lines.length) {
      const n = normalisePhone(lines[i + 1])
      if (n) return n
    }

    // Try extracting any number-like token from the label line itself
    const tokens = line.split(/\s+/)
    for (const tok of tokens) {
      if (/[\d+]/.test(tok)) {
        const n = normalisePhone(tok)
        if (n) return n
      }
    }
  }

  // Fallback: scan all lines for a standalone phone number
  // Prioritise lines with + prefix or that look like intl numbers
  for (const line of lines) {
    // Skip lines that are clearly order numbers (7-8 digit sequences without + not matching phone pattern)
    if (/^order|^رقم الطلب/i.test(line)) continue

    // Look for (+974) XXXXXXXX format (Rafeeq)
    const parenMatch = line.match(/\(\+(\d{1,4})\)\s*(\d{6,10})/)
    if (parenMatch) {
      const n = normalisePhone(`+${parenMatch[1]}${parenMatch[2]}`)
      if (n) return n
    }

    // +XXXXXXXXXXX (any intl number)
    const plusMatch = line.match(/\+\d{8,14}/)
    if (plusMatch) {
      const n = normalisePhone(plusMatch[0])
      if (n) return n
    }

    // Standalone 8-digit local number on its own line
    if (/^\d{8}$/.test(line)) {
      const n = normalisePhone(line)
      if (n) return n
    }
  }

  // Last resort: any 8+ digit sequence
  const numMatch = text.match(/\b(\d{8,14})\b/)
  if (numMatch) return normalisePhone(numMatch[1])

  return null
}

// ─── Delivery partner detection ───────────────────────────────────────────────
function extractPartner(text: string): string {
  const map = [
    [/snoonu/i, 'Snoonu'],
    [/rafeeq|رفيق/i, 'Rafeeq'],
    [/hurrier/i, 'Hurrier'],
    [/talabat/i, 'Talabat'],
    [/hungerstation/i, 'HungerStation'],
    [/jahez/i, 'Jahez'],
    [/careem/i, 'Careem'],
    [/noon\s*food/i, 'Noon Food'],
    [/marsool/i, 'Marsool'],
    [/zomato/i, 'Zomato'],
    [/deliveroo/i, 'Deliveroo'],
  ] as [RegExp, string][]
  for (const [re, name] of map) if (re.test(text)) return name
  return ''
}

// ─── Order number detection ───────────────────────────────────────────────────
function extractOrderNumber(text: string): string {
  const lines = text.split('\n').map(l => l.trim())

  // "Order Number" heading → next pure-digit line
  for (let i = 0; i < lines.length; i++) {
    if (/order\s*(number|no\.?|#)/i.test(lines[i]) || /رقم الطلب/i.test(lines[i])) {
      for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
        if (/^\d{5,15}$/.test(lines[j])) return lines[j]
      }
    }
  }
  // "#6970" or "Order #697514"
  const h = text.match(/order\s*#\s*(\d{4,15})|#\s*(\d{4,10})\b/i)
  if (h) return h[1] || h[2]
  // Order No. → number
  const no = text.match(/order\s*no\.?\s*\n[\s\S]{0,40}?\n\s*(\d{5,15})/i)
  if (no) return no[1]
  return ''
}

function extractDate(text: string): string {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  const slash = text.match(/\b(\d{1,2}[\/]\d{1,2}[\/]\d{4})\b/)
  if (slash) return slash[1]
  const verbal = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z\-]*[\s\-]+\d{1,2}[\s,\-]+\d{4}\b/i)
  if (verbal) return verbal[0]
  return ''
}

// ─── Main OCR entry point ─────────────────────────────────────────────────────
export async function performOCR(imageData: string, mode: 'fast' | 'ai' = 'fast'): Promise<OCRResult> {
  if (!workerReady || !worker) await initTesseractWorker()
  try {
    const { data } = await worker.recognize(imageData)
    const raw: string = data?.text || ''
    const confidence: number = data?.confidence || 0
    const fullPhone = extractPhone(raw) || ''

    return {
      customerName:    '',          // intentionally empty — user fills manually
      contactNumber:   fullPhone,
      billNumber:      extractOrderNumber(raw),
      billDate:        extractDate(raw),
      restaurant:      '',
      address:         '',
      deliveryPartner: extractPartner(raw),
      rawText:         raw,
      confidence,
    }
  } catch (e) {
    console.error('OCR error:', e)
    return { customerName: '', contactNumber: '', billNumber: '', billDate: '', restaurant: '', address: '', deliveryPartner: '', rawText: '', confidence: 0 }
  }
}

// ─── Exported helpers ─────────────────────────────────────────────────────────
export function validateContactNumber(full: string): boolean {
  if (!full) return false
  const s = full.replace(/[()]/g, '').replace(/[\s\-]/g, '')
  return /^\+\d{9,15}$/.test(s)
}

export function splitContactNumber(full: string): { code: string; local: string } {
  const norm = normalisePhone(full)
  if (norm) return splitFull(norm)
  return { code: DEFAULT_COUNTRY_CODE, local: full.replace(/\D/g, '').slice(-8) }
}
