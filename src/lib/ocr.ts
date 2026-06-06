'use client'
import type { OCRResult } from '@/types'

// ── Partner type ──────────────────────────────────────────────────────────────
export type BillPartner = 'standard' | 'snoonu' | 'rafeeq' | 'hurrier' | 'direct'

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

// cropFraction: top portion to keep (Hurrier: top 45% = 3x faster, name always in top section)
export async function compressImage(file: File, cropFraction = 1.0): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = cropFraction < 1 ? 800 : 900
      const srcW = img.naturalWidth, srcH = img.naturalHeight
      const cropH = Math.round(srcH * cropFraction)
      let dstW = srcW, dstH = cropH
      if (dstW > MAX || dstH > MAX) {
        if (dstW > dstH) { dstH = Math.round(dstH * MAX / dstW); dstW = MAX }
        else { dstW = Math.round(dstW * MAX / dstH); dstH = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = dstW; canvas.height = dstH
      const ctx = canvas.getContext('2d')!
      ctx.filter = 'contrast(1.4) grayscale(1) brightness(1.05)'
      ctx.drawImage(img, 0, 0, srcW, cropH, 0, 0, dstW, dstH)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Phone normalisation ───────────────────────────────────────────────────────
const PHONE_TOKEN = /(\(?\+?[\d][().\d\s\-]{6,17})/g
const VOWELS = 'aeiouAEIOU'

function normalisePhone(raw: string): { code: string; local: string; full: string } | null {
  const stripped = raw.replace(/[()[\]\s\-]/g, '')
  let digits = ''
  if (stripped.startsWith('+')) digits = stripped.slice(1).replace(/\D/g, '')
  else if (stripped.startsWith('00')) digits = stripped.slice(2).replace(/\D/g, '')
  else digits = stripped.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 8) return { code: '+974', local: digits, full: '+974' + digits }
  if (digits.length === 11) {
    if (!digits.startsWith('9') && digits.slice(1,3) === '74') digits = '9' + digits.slice(1)
    if (digits.startsWith('974')) return { code: '+974', local: digits.slice(3), full: '+' + digits }
    return { code: '+' + digits.slice(0,3), local: digits.slice(3), full: '+' + digits }
  }
  if (digits.startsWith('974') && digits.length === 12) return { code: '+974', local: digits.slice(3), full: '+' + digits }
  if (digits.length === 9) return { code: '+974', local: digits, full: '+974' + digits }
  if (digits.length >= 9 && digits.length <= 15) {
    const local = digits.slice(-8)
    const codeD = digits.slice(0, digits.length - 8)
    if (codeD.length >= 1 && codeD.length <= 4) return { code: '+' + codeD, local, full: '+' + codeD + local }
  }
  return null
}

// ── Name validation ───────────────────────────────────────────────────────────
function isLatinName(s: string): boolean {
  if (!s || s.length < 2 || s.length > 80) return false
  if (/^\d/.test(s) || /^\+/.test(s)) return false
  if (!/^[a-zA-Z][a-zA-Z\s\-''.]*$/.test(s)) return false
  if (/^(customer|mobile|phone|tel|order|delivery|vendor|pickup|collection|hurrier|snoonu|rafeeq|no cutlery|subtotal|total|prepaid|not paid|pro|item|qty|qar|qr|price|note|address|street|building|floor|zone|apartment|payment|online|cash|thanks|thank|village|compound|district|road|avenue|block|sector|area|gate|paradise|skimmed|labnah|matcha|frappe|smoothie|raspberry|chocolate|crunchy|croissant|sandwich|cake|latte|cappuccino|espresso|coffee|juice|toast|honey|cream|milk|fat|waffle|pancake|platinum|member|brunch|falafel|egg|taco|tacos|bun|mushroom|in\b|of\b|the\b|at\b|by\b|on\b|to\b|for\b|from\b|and\b|with\b|between\b|front\b|your\b|is\b|no\b)/i.test(s)) return false
  return true
}

// ── Hurrier smart-join helper ─────────────────────────────────────────────────
function hurrierNeedsConcat(accumulated: string, frag: string): boolean {
  if (frag.length === 1) return true
  const words = accumulated.split(' ')
  const lastWord = words[words.length - 1]
  const lastChar = lastWord[lastWord.length - 1]
  if (lastWord.length === 1 && lastChar >= 'A' && lastChar <= 'Z') return true
  const fragStartsLower = frag.charAt(0) === frag.charAt(0).toLowerCase() &&
                          frag.charAt(0) !== frag.charAt(0).toUpperCase()
  if (fragStartsLower && lastWord.length <= 5 && !VOWELS.includes(lastChar)) return true
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER-SPECIFIC EXTRACTORS
// ─────────────────────────────────────────────────────────────────────────────

// ── Snoonu ────────────────────────────────────────────────────────────────────
// Name: "Customer: [NAME]"  (العميل always on next line — do NOT use next line as Arabic signal)
// Phone: "Customer Phone: [PHONE]" — formats: +974XXXXXXXX, 8 digits, +XXXXXXXX (8 digit)
function snoonuExtract(lines: string[], billHasArabic: boolean): { name: string; phone: string } {
  let name = ''
  let phone = ''

  // Name: check only if afterColon itself is Arabic/garbage
  for (const line of lines) {
    if (!/^customer[\s(:]/i.test(line)) continue
    const after = line.replace(/^.*?:\s*/i, '').trim()
    if (!after) continue
    if (/[\u0600-\u06FF]/.test(after) || /[^\x20-\x7E]/.test(after)) break // Arabic → clear
    if (billHasArabic && after.length <= 3) break // short OCR garbage
    if (isLatinName(after)) { name = after; break }
  }

  // Phone: "Customer Phone:" label only
  for (let i = 0; i < lines.length; i++) {
    if (!/customer\s*phone/i.test(lines[i])) continue
    const candidates = [...(lines[i].match(PHONE_TOKEN) || [])]
    for (let j = i+1; j <= i+2 && j < lines.length; j++) {
      candidates.push(...(lines[j].match(PHONE_TOKEN) || []))
    }
    for (const m of candidates) { const p = normalisePhone(m); if (p) { phone = p.full; break } }
    if (phone) break
  }

  return { name, phone }
}

// ── Rafeeq ────────────────────────────────────────────────────────────────────
// Name: "Customer: [NAME]" or "Customer (العميل): [NAME]"
// Phone: "Mobile number: (+974) XXXXXXXX" or "Phone Number: (+974) XXXXXXXX"
function rafeeqExtract(lines: string[]): { name: string; phone: string } {
  let name = ''
  let phone = ''

  // Name
  for (const line of lines) {
    if (!/^customer[\s(:]/i.test(line)) continue
    const after = line.replace(/^.*?:\s*/i, '').trim()
    if (!after) continue
    if (/[\u0600-\u06FF]/.test(after) || /[^\x20-\x7E]/.test(after)) break
    if (isLatinName(after)) { name = after; break }
  }

  // Phone: Mobile number: or Phone Number:
  for (let i = 0; i < lines.length; i++) {
    if (!/mobile\s*number|phone\s*number/i.test(lines[i])) continue
    const candidates = [...(lines[i].match(PHONE_TOKEN) || [])]
    for (let j = i+1; j <= i+2 && j < lines.length; j++) {
      candidates.push(...(lines[j].match(PHONE_TOKEN) || []))
    }
    for (const m of candidates) { const p = normalisePhone(m); if (p) { phone = p.full; break } }
    if (phone) break
  }

  // Fallback: (+974) XXXXXXXX anywhere
  if (!phone) {
    const m = lines.join(' ').match(/\(\+974\)\s*\d{6,10}/)
    if (m) { const p = normalisePhone(m[0]); if (p) phone = p.full }
  }

  return { name, phone }
}

// ── Hurrier ───────────────────────────────────────────────────────────────────
// Name: fragments between #XXXX and TEL: — smart-join handles mid-word wrapping
// Phone: TEL: + multi-line digit reassembly
function hurrierExtract(lines: string[]): { name: string; phone: string } {
  let name = ''
  let phone = ''

  for (let i = 1; i < lines.length; i++) {
    if (!/^tel[\s:]/i.test(lines[i])) continue

    // ── Phone: reassemble split digits ────────────────────────────────────────
    let combined = lines[i]
    for (let j = i+1; j <= i+6 && j < lines.length; j++) {
      if (/^[\d+]+$/.test(lines[j].trim())) combined += lines[j].trim()
      else break
    }
    for (const m of (combined.match(PHONE_TOKEN) || [])) {
      const p = normalisePhone(m); if (p) { phone = p.full; break }
    }

    // ── Name: scan backwards from TEL: ───────────────────────────────────────
    let orderIdx = -1
    for (let j = i-1; j >= Math.max(0, i-15); j--) {
      if (/^#?\d{4,}/.test(lines[j])) { orderIdx = j; break }
      if (/^hurrier/i.test(lines[j])) break
    }
    const frags: string[] = []
    const scanFrom = orderIdx >= 0 ? orderIdx : Math.max(0, i-12)
    for (let j = scanFrom; j < i; j++) {
      const l = lines[j].trim()
      if (!l) continue
      if (/^#?\d{4,}/.test(l)) {
        const after = l.replace(/^#?\d+\s*/, '').trim()
        if (after && !/^(hurrier|collection|prepaid|not paid|pickup|am\b|pm\b)/i.test(after)) frags.push(after)
        continue
      }
      if (/^(hurrier|snoonu|rafeeq|collection|prepaid|not paid|pickup|at\b|am\b|pm\b|no cutlery|subtotal|total|delivery|order nr|pro\b)/i.test(l)) continue
      if (/^(in\b|of\b|the\b|at\b|by\b|on\b|to\b|for\b|from\b|and\b|with\b|between\b|front\b|gate\b|your\b|is\b|no\b)/i.test(l)) continue
      if (/^[\d:]+$/.test(l)) continue
      if (/[\u0600-\u06FF]/.test(l)) continue
      frags.push(l)
    }
    if (frags.length > 0) {
      let n = frags[0]
      for (let k = 1; k < frags.length; k++) {
        n = hurrierNeedsConcat(n, frags[k]) ? n + frags[k] : n + ' ' + frags[k]
      }
      name = n.trim()
      if (!/^[a-zA-Z]/.test(name) || /^(no cutlery|subtotal|total|delivery|pickup|collection|prepaid)/i.test(name)) name = ''
    }

    // ── Forward scan fallback (OCR column reordering) ─────────────────────────
    if (!name) {
      for (let j = i+1; j <= Math.min(i+3, lines.length-1); j++) {
        const l = lines[j].trim()
        if (/^(\d|qr|subtotal|total|delivery|no cutlery|may|order)/i.test(l)) break
        if (isLatinName(l)) { name = l; break }
      }
    }
    break
  }
  return { name, phone }
}

// ── Direct (Izghawa / O2 direct) ──────────────────────────────────────────────
// Name: "Customer:\nTee" OR "Customer: Tee" — name on next line for Izghawa
// Phone: unlabelled number right after name, OR "Customer Phone:" label
function directExtract(lines: string[]): { name: string; phone: string } {
  let name = ''
  let phone = ''

  for (let i = 0; i < lines.length; i++) {
    if (!/^customer[\s(:]/i.test(lines[i])) continue

    // Same line after colon
    const after = lines[i].replace(/^.*?:\s*/i, '').trim()
    if (after && !/[\u0600-\u06FF]/.test(after) && !/[^\x20-\x7E]/.test(after) && isLatinName(after)) {
      name = after
    }

    // Next line might be name (Izghawa: "Customer:\nTee")
    if (!name && i+1 < lines.length) {
      const next = lines[i+1].trim()
      if (next && !/[\u0600-\u06FF]/.test(next) && isLatinName(next)) name = next
    }

    // Look for phone in next 3 lines (unlabelled)
    for (let j = i+1; j <= i+4 && j < lines.length; j++) {
      const t = lines[j].trim().replace(/[\s\-()]/g, '')
      if (/^\+?\d{8,14}$/.test(t)) {
        const p = normalisePhone(lines[j].trim()); if (p) { phone = p.full; break }
      }
    }
    break
  }

  // Labelled phone fallback
  if (!phone) {
    for (let i = 0; i < lines.length; i++) {
      if (!/customer\s*phone/i.test(lines[i])) continue
      const candidates = [...(lines[i].match(PHONE_TOKEN) || [])]
      for (let j = i+1; j <= i+2 && j < lines.length; j++) candidates.push(...(lines[j].match(PHONE_TOKEN) || []))
      for (const m of candidates) { const p = normalisePhone(m); if (p) { phone = p.full; break } }
      if (phone) break
    }
  }

  return { name, phone }
}

// ── Standard: try all partners ────────────────────────────────────────────────
function standardExtract(lines: string[], rawText: string): { name: string; phone: string } {
  const billHasArabic = /[\u0600-\u06FF]/.test(rawText)
  const partner = detectPartner(rawText)

  // Auto-detect and use specific extractor for speed
  if (partner === 'hurrier') return hurrierExtract(lines)
  if (partner === 'rafeeq')  return rafeeqExtract(lines)

  // Snoonu / Direct share "Customer:" pattern — try both
  const snoonu = snoonuExtract(lines, billHasArabic)
  if (snoonu.name || snoonu.phone) return snoonu

  const direct = directExtract(lines)
  if (direct.name || direct.phone) return direct

  // Last fallback: any phone in raw text
  let phone = ''
  const fullText = lines.join(' ')
  for (const m of (fullText.match(/\(\+\d{1,4}\)\s*\d{6,10}/g) || [])) {
    const p = normalisePhone(m); if (p) { phone = p.full; break }
  }
  if (!phone) for (const m of (fullText.match(/\+\d{8,14}/g) || [])) {
    const p = normalisePhone(m); if (p) { phone = p.full; break }
  }
  for (const line of lines) {
    if (/^\d{8}$/.test(line)) { phone = '+974' + line; break }
  }

  return { name: '', phone }
}

// Auto-detect partner from raw OCR text
function detectPartner(rawText: string): BillPartner {
  if (/\bhurrier\b/i.test(rawText)) return 'hurrier'
  if (/\brafeeq\b/i.test(rawText)) return 'rafeeq'
  if (/\bsnoonu\b/i.test(rawText)) return 'snoonu'
  if (/\bizghawa\b/i.test(rawText)) return 'direct'
  return 'standard'
}

// ── Supporting finders (used for order number, date, restaurant) ──────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
function isDateStr(s: string): boolean { return DATE_RE.test(s.trim()) }

function findOrderNumber(text: string): string {
  const lines = text.split('\n').map(l => l.trim())
  for (let i = 0; i < lines.length; i++) {
    if (/order\s*(number|no\.?|nr\.?|#)/i.test(lines[i]) || /رقم الطلب/i.test(lines[i])) {
      for (let j = i+1; j <= i+4 && j < lines.length; j++) {
        const c = lines[j].trim()
        if (/^\d{5,15}$/.test(c) && !isDateStr(c)) return c
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (/^order\s*no[\s.]/i.test(lines[i])) {
      for (let j = i+1; j <= i+5 && j < lines.length; j++) {
        const c = lines[j].trim()
        if (/^\d{5,15}$/.test(c) && !isDateStr(c)) return c
      }
    }
  }
  for (const line of lines) {
    const m = line.match(/^#(\d{4,10})/)
    if (m) return m[1]
  }
  for (const line of lines) {
    const m = line.match(/order\s*nr\.?\s*:?\s*(\d{5,15})/i)
    if (m && !isDateStr(m[1])) return m[1]
  }
  const inlineMatch = text.match(/order\s*#\s*(\d{4,15})/i)
  if (inlineMatch && !isDateStr(inlineMatch[1])) return inlineMatch[1]
  for (const line of lines) {
    const m = line.match(/^(\d{7,10})$/)
    if (m && !isDateStr(line)) return m[1]
  }
  return ''
}

function findRestaurant(text: string): string {
  const lines = text.split('\n').map(l => l.trim())
  for (const line of lines) {
    if (/vendor\s*(name)?\s*:/i.test(line) || /اسم البائع/i.test(line)) {
      const val = line.replace(/^.*?:\s*/i, '').trim()
      if (val.length > 1 && val.length < 80) return val
    }
  }
  for (const line of lines) {
    if (/O2\s*Caf[eé]/i.test(line)) return line.replace(/delivery order|takeaway|pickup order/gi, '').trim()
  }
  if (/\bizghawa\b/i.test(text)) return 'O2 Cafe - Izghawa'
  return ''
}

function findDate(text: string): string {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}:\d{2})?\b/)
  if (iso) return iso[1]
  const us = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)
  if (us) return us[1]
  const verbal = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-]+\d{1,2}[\s,\-]+\d{4}/i)
  if (verbal) return verbal[0]
  return ''
}

function findPartner(text: string): string {
  const partners = [
    { name: 'Snoonu',        re: /snoonu/i },
    { name: 'Rafeeq',        re: /rafeeq|رفيق/i },
    { name: 'Hurrier',       re: /hurrier/i },
    { name: 'Talabat',       re: /talabat/i },
    { name: 'HungerStation', re: /hungerstation/i },
    { name: 'Careem',        re: /careem/i },
  ]
  for (const { name, re } of partners) { if (re.test(text)) return name }
  return ''
}

// ── Public phone helpers ──────────────────────────────────────────────────────
export function validateContactNumber(full: string): boolean {
  if (!full) return false
  return /^\+\d{9,15}$/.test(full.replace(/[() \-]/g, ''))
}

export function splitContactNumber(full: string): { code: string; local: string } {
  const p = normalisePhone(full)
  return p ? { code: p.code, local: p.local } : { code: '+974', local: '' }
}

export function parseOCRPhone(raw: string): { code: string; local: string; full: string } {
  const p = normalisePhone(raw)
  return p || { code: '+974', local: '', full: '' }
}

// ── Main OCR entry point ──────────────────────────────────────────────────────
export async function performOCR(
  imageData: string,
  _mode: 'fast' | 'ai' = 'fast',
  partner: BillPartner = 'standard'
): Promise<OCRResult> {
  if (!workerReady || !worker) await initTesseractWorker()
  try {
    const { data } = await worker.recognize(imageData)
    const raw: string = data?.text || ''
    const confidence: number = data?.confidence || 0
    const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const billHasArabic = /[\u0600-\u06FF]/.test(raw)

    let extracted: { name: string; phone: string }

    switch (partner) {
      case 'snoonu':  extracted = snoonuExtract(lines, billHasArabic); break
      case 'rafeeq':  extracted = rafeeqExtract(lines); break
      case 'hurrier': extracted = hurrierExtract(lines); break
      case 'direct':  extracted = directExtract(lines); break
      default:        extracted = standardExtract(lines, raw); break
    }

    return {
      customerName:    extracted.name,
      contactNumber:   extracted.phone,
      orderNumber:     findOrderNumber(raw),
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
