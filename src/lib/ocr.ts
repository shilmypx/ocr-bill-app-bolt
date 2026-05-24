'use client'

import type { OCRResult } from '@/types'

let worker: any = null
let workerReady = false

export async function initTesseractWorker() {
  if (typeof window === 'undefined' || workerReady) return
  try {
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('eng', 1, {
      logger: () => {},
      errorHandler: () => {},
    })
    workerReady = true
  } catch (e) {
    console.warn('Tesseract init failed:', e)
  }
}

export async function compressImage(file: File, maxKB = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const MAX = 1200
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.filter = 'grayscale(30%) contrast(1.2)'
      ctx.drawImage(img, 0, 0, width, height)
      let quality = 0.85
      let result = canvas.toDataURL('image/jpeg', quality)
      while (result.length > maxKB * 1024 * 1.37 && quality > 0.4) {
        quality -= 0.1
        result = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(result)
    }
    img.onerror = reject
    img.src = url
  })
}

function extractContactNumber(text: string): string {
  const lines = text.split('\n')
  const patterns = [
    /(\+94\d{8,9})/,
    /(\+\d{1,3}[\s-]?\d{7,12})/,
    /(00\d{10,13})/,
    /(\b\d{10,13}\b)/,
  ]
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.includes('phone') || lower.includes('mobile') || lower.includes('tel') ||
        lower.includes('contact') || lower.includes('call') || lower.includes('mob')) {
      for (const p of patterns) {
        const m = line.match(p)
        if (m) return formatContactNumber(m[1])
      }
    }
  }
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return formatContactNumber(m[1])
  }
  return ''
}

export function formatContactNumber(raw: string): string {
  if (!raw) return ''
  let digits = raw.replace(/\D/g, '')
  // Remove leading zeros (e.g. 0094 → 94)
  digits = digits.replace(/^00/, '')
  // If starts with 94 and is long enough, prefix +
  if (digits.startsWith('94') && digits.length >= 10) {
    return '+' + digits
  }
  // If starts with 0, strip leading 0 and add +94
  if (digits.startsWith('0') && digits.length === 9) {
    return '+94' + digits.slice(1)
  }
  // If 8 digits, assume local number, add +94
  if (digits.length === 8) {
    return '+94' + digits
  }
  // If already has +, return as-is if long enough
  if (raw.startsWith('+') && digits.length >= 10) {
    return '+' + digits
  }
  return raw.replace(/\s+/g, '')
}

export function validateContactNumber(num: string): boolean {
  if (!num || num.trim() === '') return false
  const cleaned = num.replace(/\s+/g, '')
  // Accept +94 followed by 8-9 digits
  if (/^\+94\d{8,9}$/.test(cleaned)) return true
  // Accept +[country][8-12 digits]
  if (/^\+\d{10,14}$/.test(cleaned)) return true
  // Accept plain 10-14 digits
  if (/^\d{10,14}$/.test(cleaned)) return true
  return false
}

function extractName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.startsWith('name') || lower.startsWith('customer') || lower.startsWith('client')) {
      const val = line.replace(/^[^:]+:\s*/i, '').trim()
      if (val.length > 1 && val.length < 60) return val
    }
  }
  // First line that looks like a name (2+ words, no numbers)
  for (const line of lines.slice(0, 5)) {
    if (/^[A-Za-z][A-Za-z\s]{3,40}$/.test(line)) return line
  }
  return ''
}

function extractBillNumber(text: string): string {
  const patterns = [
    /(?:bill|invoice|receipt|order|ref|no)[.:\s#]+([A-Z0-9-]{3,20})/i,
    /#\s*([A-Z0-9-]{3,20})/i,
    /\b([A-Z]{2,4}[-]\d{4,10})\b/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1].trim()
  }
  return ''
}

export async function performOCR(imageData: string, mode: 'fast' | 'ai' = 'fast'): Promise<OCRResult> {
  if (!workerReady || !worker) {
    await initTesseractWorker()
  }

  try {
    const { data } = await worker.recognize(imageData)
    const raw = data.text || ''
    const confidence = data.confidence || 0

    let contactNumber = extractContactNumber(raw)
    if (contactNumber) contactNumber = formatContactNumber(contactNumber)

    return {
      customerName: extractName(raw),
      contactNumber,
      billNumber: extractBillNumber(raw),
      billDate: '',
      restaurant: '',
      address: '',
      deliveryPartner: '',
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
