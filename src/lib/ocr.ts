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
      ctx.filter = 'contrast(1.3) brightness(1.05)'
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Phone normalisation ───────────────────────────────────────────────────────
function normalisePhone(raw: string): { code: string; local: string; full: string } | null {
  const stripped = raw.replace(/[()[\]\s\-]/g, '')
  let digits = stripped.startsWith('+') ? stripped.slice(1).replace(/\D/g, '')
    : stripped.startsWith('00') ? stripped.slice(2).replace(/\D/g, '')
    : stripped.replace(/\D/g, '')

  if (!digits) return null

  // 8 digits → Qatar local
  if (digits.length === 8) return { code: '+974', local: digits, full: '+974' + digits }

  // 11 digits: fix OCR misread of '+' → '0','8','6' etc.
  // e.g. "+97450100084" read as "07450100084" — first digit should be '9'
  if (digits.length === 11) {
    if (!digits.startsWith('9') && digits.slice(1, 3) === '74') {
      digits = '9' + digits.slice(1)
    }
    if (digits.startsWith('974')) return { code: '+974', local: digits.slice(3), full: '+' + digits }
    return { code: '+' + digits.slice(0, 3), local: digits.slice(3), full: '+' + digits }
  }

  // 12 digits starting with 974
  if (digits.startsWith('974') && digits.length === 12) {
    return { code: '+974', local: digits.slice(3), full: '+' + digits }
  }

  // 9 digits → Qatar
  if (digits.length === 9) return { code: '+974', local: digits, full: '+974' + digits }

  // Generic international
  if (digits.length >= 9 && digits.length <= 15) {
    const local = digits.slice(-8)
    const codeD = digits.slice(0, digits.length - 8)
    if (codeD.length >= 1 && codeD.length <= 4) {
      return { code: '+' + codeD, local, full: '+' + codeD + local }
    }
  }
  return null
}

// ── Phone finder ──────────────────────────────────────────────────────────────
function findPhone(text: string): { code: string; local: string; full: string } | null {
  const lines = text.split('\n').map(l => l.trim())
  const PHONE_LABEL = /customer\s*phone|mobile\s*number|mobile\s*no|phone\s*number|phone\s*no|^tel[\s:]+|contact\s*phone|هاتف|الهاتف|رقم الهاتف/i
  const PHONE_TOKEN = /(\(?\+?[\d][().\d\s\-]{6,17})/g

  for (let i = 0; i < lines.length; i++) {
    if (!PHONE_LABEL.test(lines[i])) continue
    for (const m of (lines[i].match(PHONE_TOKEN) || [])) {
      const p = normalisePhone(m); if (p) return p
    }
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      for (const m of (lines[j].match(PHONE_TOKEN) || [])) {
        const p = normalisePhone(m); if (p) return p
      }
    }
  }
  const fullText = lines.join(' ')
  for (const m of (fullText.match(/\(\+\d{1,4}\)\s*\d{6,10}/g) || [])) {
    const p = normalisePhone(m); if (p) return p
  }
  for (const m of (fullText.match(/\+\d{8,14}/g) || [])) {
    const p = normalisePhone(m); if (p) return p
  }
  for (const line of lines) {
    if (/^\d{8}$/.test(line)) { const p = normalisePhone(line); if (p) return p }
  }
  return null
}

// ── Order number finder ───────────────────────────────────────────────────────
// IMPORTANT: must NOT pick up dates (YYYY-MM-DD) as order numbers
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/

function isDate(s: string): boolean {
  return DATE_PATTERN.test(s.trim())
}

function findOrderNumber(text: string): string {
  const lines = text.split('\n').map(l => l.trim())

  // Snoonu/Rafeeq: "Order Number" heading → next lines
  for (let i = 0; i < lines.length; i++) {
    if (/order\s*(number|no\.?|#)/i.test(lines[i]) || /رقم الطلب/i.test(lines[i])) {
      for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
        const candidate = lines[j].trim()
        // Pure digit string, 5-15 digits, NOT a date
        if (/^\d{5,15}$/.test(candidate) && !isDate(candidate)) return candidate
      }
    }
  }

  // Inline: "Order #697514" or "Order No. 67542059"
  const inlineMatch = text.match(/order\s*(?:#|no\.?)\s*([A-Z0-9\-]{4,15})/i)
  if (inlineMatch && !isDate(inlineMatch[1])) return inlineMatch[1]

  // Hurrier: "#6970" on its own line
  const hashMatch = text.match(/^#(\d{4,10})$/m)
  if (hashMatch) return hashMatch[1]

  // Large standalone number on its own line (7-10 digits), not a date
  for (const line of lines) {
    const m = line.match(/^(\d{7,10})$/)
    if (m && !isDate(line)) return m[1]
  }

  return ''
}

// ── Customer name finder ──────────────────────────────────────────────────────
function findName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    if (!/^customer[\s(:]/i.test(lines[i])) continue
    const afterColon = lines[i].replace(/^.*?:\s*/i, '').trim()
    if (isValidName(afterColon)) return afterColon
    if (i + 1 < lines.length && isValidName(lines[i + 1])) return lines[i + 1]
  }
  // Hurrier: name before TEL:
  for (let i = 1; i < lines.length; i++) {
    if (/^tel[\s:]/i.test(lines[i]) && isValidName(lines[i - 1])) return lines[i - 1]
  }
  return ''
}

function isValidName(s: string): boolean {
  if (!s || s.length < 2 || s.length > 80) return false
  if (/^\d/.test(s) || /^\+/.test(s)) return false
  if (/^(customer|mobile|phone|tel|order|delivery|vendor|العميل|هاتف|pickup|collection)/i.test(s)) return false
  return true
}

// ── Delivery partner finder ───────────────────────────────────────────────────
function findPartner(text: string): string {
  const known = [
    { name: 'Snoonu',       re: /snoonu/i },
    { name: 'Rafeeq',       re: /rafeeq|رفيق/i },
    { name: 'Hurrier',      re: /hurrier/i },
    { name: 'Talabat',      re: /talabat/i },
    { name: 'HungerStation',re: /hungerstation/i },
    { name: 'Jahez',        re: /jahez/i },
    { name: 'Careem',       re: /careem/i },
    { name: 'Noon Food',    re: /noon\s*food/i },
    { name: 'Marsool',      re: /marsool/i },
    { name: 'Zomato',       re: /zomato/i },
  ]
  for (const { name, re } of known) { if (re.test(text)) return name }
  return ''
}

// ── Restaurant / vendor finder ────────────────────────────────────────────────
// From real bills: "O2 Cafe - Izghawa", "O2 Cafe - Al-Khisah", "Vendor: O2 Cafe"
function findRestaurant(text: string): string {
  const lines = text.split('\n').map(l => l.trim())

  // Explicit vendor label (Rafeeq format)
  for (const line of lines) {
    if (/vendor\s*(name)?\s*:/i.test(line) || /اسم البائع/i.test(line)) {
      const val = line.replace(/^.*?:\s*/i, '').trim()
      if (val.length > 1 && val.length < 80) return val
    }
  }

  // O2 Cafe pattern: line contains "O2 Cafe" or "O2 Coffee" etc.
  for (const line of lines) {
    if (/O2\s*Caf[eé]/i.test(line)) return line.replace(/delivery order|takeaway|pickup order/i, '').trim()
  }

  // After partner name, restaurant is often on the next line
  const PARTNER_RE = /snoonu|rafeeq|hurrier|talabat/i
  for (let i = 0; i < lines.length; i++) {
    if (PARTNER_RE.test(lines[i]) && i + 1 < lines.length) {
      const next = lines[i + 1].trim()
      if (next.length > 2 && next.length < 80
          && !/^(delivery|order|pickup|الطلب|رقم)/i.test(next)
          && /[A-Za-z]/.test(next)) {
        return next
      }
    }
  }

  // "Izghawa" as standalone restaurant
  if (/\bizghawa\b/i.test(text)) return 'O2 Cafe - Izghawa'

  return ''
}

// ── Date finder ───────────────────────────────────────────────────────────────
function findDate(text: string): string {
  // ISO: 2026-05-15 (with optional time)
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}:\d{2})?\b/)
  if (iso) return iso[1]
  // US slash: 5/14/2026
  const us = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)
  if (us) return us[1]
  // Verbal: May-13-2026 or May 13, 2026
  const verbal = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-]+\d{1,2}[\s,\-]+\d{4}/i)
  if (verbal) return verbal[0]
  return ''
}

// ── Main OCR ──────────────────────────────────────────────────────────────────
export async function performOCR(imageData: string, _mode: 'fast' | 'ai' = 'fast'): Promise<OCRResult> {
  if (!workerReady || !worker) await initTesseractWorker()
  try {
    const { data } = await worker.recognize(imageData)
    const raw: string = data?.text || ''
    const confidence: number = data?.confidence || 0
    const phone = findPhone(raw)
    return {
      customerName:    findName(raw),
      contactNumber:   phone?.full || '',
      orderNumber:      findOrderNumber(raw),   // stored as order_number in DB
      billDate:        findDate(raw),
      restaurant:      findRestaurant(raw),
      address:         '',
      deliveryPartner: findPartner(raw),
      rawText:         raw,
      confidence,
    }
  } catch (e) {
    console.error('OCR error:', e)
    return { customerName:'', contactNumber:'', orderNumber:'', billDate:'', restaurant:'', address:'', deliveryPartner:'', rawText:'', confidence:0 }
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export function validateContactNumber(full: string): boolean {
  if (!full) return false
  return /^\+\d{9,15}$/.test(full.replace(/[() \-]/g, ''))
}

export function splitContactNumber(full: string): { code: string; local: string } {
  const p = normalisePhone(full)
  return p ? { code: p.code, local: p.local } : { code: '+974', local: '' }
}
