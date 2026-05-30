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
  } catch (e) {
    console.warn('Tesseract init failed:', e)
  }
}

export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const MAX = 1400
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Contact number extraction ──────────────────────────────────
// Format: +[country_code][8 digit local]
// Examples from bills:
//   +97470409023  → code +974, local 70409023
//   +94741234567  → code +94,  local 741234567  (9 digits local for Sri Lanka)
//   +966501234567 → code +966, local 501234567
//
// Strategy: find the last 8 digits before end = local number
//           everything before that (after +) = country code

function parseContactNumber(raw: string): { code: string; local: string; full: string } | null {
  // Strip whitespace and common separators
  const cleaned = raw.replace(/[\s\-().]/g, '')

  // Must start with + or 00
  let digits = ''
  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1).replace(/\D/g, '')
  } else if (cleaned.startsWith('00')) {
    digits = cleaned.slice(2).replace(/\D/g, '')
  } else {
    digits = cleaned.replace(/\D/g, '')
  }

  if (digits.length < 9 || digits.length > 15) return null

  // Last 8 digits = local number, rest = country code
  const local = digits.slice(-8)
  const codeDigits = digits.slice(0, digits.length - 8)

  // Country code must be 1-4 digits
  if (codeDigits.length < 1 || codeDigits.length > 4) {
    // Try last 9 digits as local (some countries use 9-digit locals)
    const local9 = digits.slice(-9)
    const code9 = digits.slice(0, digits.length - 9)
    if (code9.length >= 1 && code9.length <= 4) {
      const fullNum = '+' + code9 + local9
      return { code: '+' + code9, local: local9, full: fullNum }
    }
    return null
  }

  const fullNum = '+' + codeDigits + local
  return { code: '+' + codeDigits, local, full: fullNum }
}

function extractContact(text: string): { code: string; local: string; full: string } | null {
  const lines = text.split('\n')

  // Priority 1: look for labelled phone lines (Customer Phone, Mobile, Tel, etc.)
  const phoneLabels = /customer\s*phone|phone|mobile|mob|tel|contact|هاتف|جوال/i
  for (const line of lines) {
    if (phoneLabels.test(line)) {
      // Extract number from same line
      const numMatch = line.match(/(\+?\d[\d\s\-().]{7,16})/)
      if (numMatch) {
        const parsed = parseContactNumber(numMatch[1])
        if (parsed) return parsed
      }
      // Check next line too
      const idx = lines.indexOf(line)
      if (idx + 1 < lines.length) {
        const nextMatch = lines[idx + 1].match(/(\+?\d[\d\s\-().]{7,16})/)
        if (nextMatch) {
          const parsed = parseContactNumber(nextMatch[1])
          if (parsed) return parsed
        }
      }
    }
  }

  // Priority 2: any number starting with + followed by 9-14 digits
  const plusPattern = /\+\d{9,14}/g
  const allText = text.replace(/\s+/g, ' ')
  const plusMatches = allText.match(plusPattern) || []
  for (const m of plusMatches) {
    const parsed = parseContactNumber(m)
    if (parsed) return parsed
  }

  // Priority 3: long digit sequences (10+ digits)
  const digitPattern = /\b\d{10,14}\b/g
  const digitMatches = allText.match(digitPattern) || []
  for (const m of digitMatches) {
    const parsed = parseContactNumber(m)
    if (parsed) return parsed
  }

  return null
}

function extractName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  // Look for Customer: or Customer Name: label
  for (const line of lines) {
    if (/^customer\s*:/i.test(line) || /^customer\s*name\s*:/i.test(line) || /^العميل/i.test(line)) {
      const val = line.replace(/^.*?:\s*/i, '').trim()
      if (val.length > 1 && val.length < 60 && !/^\d/.test(val)) return val
    }
  }
  // Look for name after "Customer" on next line
  for (let i = 0; i < lines.length; i++) {
    if (/^customer$/i.test(lines[i]) && lines[i + 1]) {
      const val = lines[i + 1].trim()
      if (val.length > 1 && val.length < 60 && !/^\d/.test(val) && !/^[+]/.test(val)) return val
    }
  }
  return ''
}

function extractOrderNumber(text: string): string {
  // "Order Number" followed by digits on next line
  const lines = text.split('\n').map(l => l.trim())
  for (let i = 0; i < lines.length; i++) {
    if (/order\s*(number|#|no)/i.test(lines[i]) || /رقم الطلب/i.test(lines[i])) {
      // Check next 1-2 lines for digits
      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        const m = lines[j].match(/^(\d{5,20})$/)
        if (m) return m[1]
      }
    }
  }
  // Fallback: patterns like "#81472016" or "Order: 81472016"
  const m = text.match(/(?:order|#|ref|receipt|bill|invoice)\s*[:#]?\s*([A-Z0-9\-]{5,20})/i)
  return m ? m[1] : ''
}

function extractDeliveryPartner(text: string): string {
  const known = ['Snoonu', 'Talabat', 'HungerStation', 'Jahez', 'Careem', 'Noon Food', 'Marsool', 'Zomato', 'Deliveroo']
  const upper = text.toLowerCase()
  for (const p of known) {
    if (upper.includes(p.toLowerCase())) return p
  }
  return ''
}

function extractDate(text: string): string {
  const m = text.match(/(\d{4}-\d{2}-\d{2})|(\d{2}[\/\-]\d{2}[\/\-]\d{4})/)
  return m ? m[0] : ''
}

// ── Main OCR function ──────────────────────────────────────────
export async function performOCR(imageData: string, mode: 'fast' | 'ai' = 'fast'): Promise<OCRResult> {
  if (!workerReady || !worker) {
    await initTesseractWorker()
  }
  try {
    const { data } = await worker.recognize(imageData)
    const raw = data?.text || ''
    const confidence = data?.confidence || 0

    const contactParsed = extractContact(raw)

    return {
      customerName: extractName(raw),
      contactNumber: contactParsed?.full || '',
      billNumber: extractOrderNumber(raw),
      billDate: extractDate(raw),
      restaurant: '',
      address: '',
      deliveryPartner: extractDeliveryPartner(raw),
      rawText: raw,
      confidence,
    }
  } catch (e) {
    console.error('OCR error:', e)
    return {
      customerName: '', contactNumber: '', billNumber: '',
      billDate: '', restaurant: '', address: '', deliveryPartner: '',
      rawText: '', confidence: 0,
    }
  }
}

// ── Exported helpers for CaptureWidget ────────────────────────
export function validateContactNumber(full: string): boolean {
  if (!full) return false
  return /^\+\d{9,15}$/.test(full.replace(/\s/g, ''))
}

// Split a full number like "+97470409023" into { code: "+974", local: "70409023" }
export function splitContactNumber(full: string): { code: string; local: string } {
  const parsed = parseContactNumber(full)
  if (parsed) return { code: parsed.code, local: parsed.local }
  // Fallback
  if (full.startsWith('+')) {
    const digits = full.slice(1)
    if (digits.length >= 9) {
      return { code: '+' + digits.slice(0, digits.length - 8), local: digits.slice(-8) }
    }
  }
  return { code: '+94', local: '' }
}
