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
  } catch (e) { console.warn('Tesseract init:', e) }
}

export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const c = document.createElement('canvas')
      const MAX = 1600
      let { width: w, height: h } = img
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      c.width = w; c.height = h
      const ctx = c.getContext('2d')!
      ctx.filter = 'contrast(1.3) brightness(1.05)'
      ctx.drawImage(img, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = reject
    img.src = url
  })
}

// ─── Phone normalisation ──────────────────────────────────────────────────────
//
// 99% of bills are Qatar (+974). Common OCR errors:
//   "+974..." → OCR reads "+" as "0", "8", "B", "l" etc.
//   "+97450100084" → captured as "097450100084", "897450100084"
//
// Strategy:
//  1. Strip parens/spaces
//  2. Extract all digit characters
//  3. If digits look like "974" + 8 digits (with any 1-char OCR noise in front) → Qatar
//  4. If exactly 8 digits → Qatar default
//  5. Generic international fallback

function normalisePhone(raw: string): { code: string; local: string; full: string } | null {
  // Remove formatting chars but preserve + for detection
  const stripped = raw.replace(/[().\s\-]/g, '')
  const digits = stripped.replace(/\D/g, '')

  if (!digits || digits.length < 8) return null

  // ── Qatar patterns ────────────────────────────────────────────────────────

  // Pattern: exactly 8 digits (no country code) → default +974
  if (digits.length === 8) {
    return { code: '+974', local: digits, full: '+974' + digits }
  }

  // Pattern: "974" + 8 digits = 11 digits → +974XXXXXXXX (clean)
  if (digits.startsWith('974') && digits.length === 11) {
    return { code: '+974', local: digits.slice(3), full: '+' + digits }
  }

  // Pattern: [1 junk char] + "974" + 8 digits = 12 digits
  // Handles OCR misread of "+" as "0", "8", "B→8", "l→1", etc.
  if (digits.length === 12 && digits.slice(1).startsWith('974')) {
    const local = digits.slice(4) // skip junk + "974"
    return { code: '+974', local, full: '+974' + local }
  }

  // Pattern: "+974" + 8 digits (already correct, 12 total with +)
  if (stripped.startsWith('+974') && digits.length === 11) {
    return { code: '+974', local: digits.slice(3), full: '+974' + digits.slice(3) }
  }

  // ── Generic international ─────────────────────────────────────────────────

  // 9-15 digits: last 8 = local, rest = country code
  if (digits.length >= 9 && digits.length <= 15) {
    const local = digits.slice(-8)
    const codeD = digits.slice(0, digits.length - 8)
    if (codeD.length >= 1 && codeD.length <= 4) {
      return { code: '+' + codeD, local, full: '+' + codeD + local }
    }
  }

  return null
}

// ─── Phone finder ─────────────────────────────────────────────────────────────
function findPhone(text: string): { code: string; local: string; full: string } | null {
  const lines = text.split('\n').map(l => l.trim())

  // Label patterns from real bills
  const LABEL = /customer\s*phone|mobile\s*number|mobile\s*no|phone\s*number|phone\s*no|^tel[\s:]+|هاتف|الهاتف|رقم الهاتف/i
  const TOKEN = /(\(?\+?[\d][().\d\s\-]{6,17})/g

  for (let i = 0; i < lines.length; i++) {
    if (!LABEL.test(lines[i])) continue
    // Same line tokens
    for (const m of (lines[i].match(TOKEN) || [])) {
      const p = normalisePhone(m)
      if (p) return p
    }
    // Next 1-2 lines
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      for (const m of (lines[j].match(TOKEN) || [])) {
        const p = normalisePhone(m)
        if (p) return p
      }
    }
  }

  // Fallback: (+974) XXXXXXXX
  const paren = text.replace(/\n/g, ' ').match(/\(\+?\d{1,4}\)\s*\d{6,10}/g) || []
  for (const m of paren) { const p = normalisePhone(m); if (p) return p }

  // Fallback: +XXXXXXXXX anywhere
  const plus = text.match(/\+\d{8,14}/g) || []
  for (const m of plus) { const p = normalisePhone(m); if (p) return p }

  // Fallback: standalone 8-digit line
  for (const line of lines) {
    if (/^\d{8}$/.test(line)) return { code: '+974', local: line, full: '+974' + line }
  }

  return null
}

// ─── Name finder ──────────────────────────────────────────────────────────────
function findName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    if (!/^customer[\s(:]/i.test(lines[i])) continue
    const after = lines[i].replace(/^.*?:\s*/i, '').trim()
    if (isName(after)) return after
    if (i + 1 < lines.length && isName(lines[i + 1])) return lines[i + 1]
  }
  // Hurrier: name line before TEL:
  for (let i = 1; i < lines.length; i++) {
    if (/^tel[\s:]/i.test(lines[i]) && isName(lines[i - 1])) return lines[i - 1]
  }
  return ''
}

function isName(s: string): boolean {
  return !!(s && s.length >= 2 && s.length < 80 && !/^\d/.test(s) && !/^\+/.test(s) &&
    !/^(customer|mobile|phone|tel|order|delivery|العميل|هاتف|pickup)/i.test(s))
}

function findOrderNumber(text: string): string {
  const lines = text.split('\n').map(l => l.trim())
  for (let i = 0; i < lines.length; i++) {
    if (/order\s*(number|no\.?|#)/i.test(lines[i]) || /رقم الطلب/i.test(lines[i])) {
      for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
        if (/^\d{5,15}$/.test(lines[j])) return lines[j]
      }
    }
  }
  const inline = text.match(/order\s*#\s*(\d{4,15})/i)
  if (inline) return inline[1]
  return ''
}

function findPartner(text: string): string {
  const map = [
    { n: 'Snoonu', r: /snoonu/i },
    { n: 'Rafeeq', r: /rafeeq/i },
    { n: 'Hurrier', r: /hurrier/i },
    { n: 'Talabat', r: /talabat/i },
    { n: 'HungerStation', r: /hungerstation/i },
    { n: 'Jahez', r: /jahez/i },
    { n: 'Careem', r: /careem/i },
    { n: 'Noon Food', r: /noon\s*food/i },
    { n: 'Marsool', r: /marsool/i },
  ]
  for (const { n, r } of map) { if (r.test(text)) return n }
  return ''
}

function findDate(text: string): string {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  const us = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/)
  if (us) return us[1]
  return ''
}

export async function performOCR(imageData: string, _mode = 'fast'): Promise<OCRResult> {
  if (!workerReady || !worker) await initTesseractWorker()
  try {
    const { data } = await worker.recognize(imageData)
    const raw: string = data?.text || ''
    const p = findPhone(raw)
    return {
      customerName: findName(raw),
      contactNumber: p?.full || '',
      billNumber: findOrderNumber(raw),
      billDate: findDate(raw),
      restaurant: '',
      address: '',
      deliveryPartner: findPartner(raw),
      rawText: raw,
      confidence: data?.confidence || 0,
    }
  } catch (e) {
    console.error('OCR:', e)
    return { customerName:'', contactNumber:'', billNumber:'', billDate:'', restaurant:'', address:'', deliveryPartner:'', rawText:'', confidence: 0 }
  }
}

export function validateContactNumber(full: string): boolean {
  // Rule: +974 (4 chars) + min 8 digits = total min 12 chars
  // Code is + followed by 2-4 digits; local is min 8 digits
  const cleaned = full.replace(/[() \-]/g, '')
  if (!cleaned.startsWith('+')) return false
  const digits = cleaned.slice(1)
  if (digits.length < 10) return false  // min: 2 code + 8 local
  return /^\d+$/.test(digits)
}

export function splitContactNumber(full: string): { code: string; local: string } {
  const p = normalisePhone(full)
  if (p) return { code: p.code, local: p.local }
  return { code: '+974', local: '' }
}
