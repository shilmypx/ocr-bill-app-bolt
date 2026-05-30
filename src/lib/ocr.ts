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
      ctx.filter = 'grayscale(20%) contrast(1.15)'
      ctx.drawImage(img, 0, 0, width, height)
      let quality = 0.85
      let result = canvas.toDataURL('image/jpeg', quality)
      while (result.length > maxKB * 1024 * 1.37 && quality > 0.4) { quality -= 0.1; result = canvas.toDataURL('image/jpeg', quality) }
      resolve(result)
    }
    img.onerror = reject; img.src = url
  })
}

function extractContact(text: string): string {
  const lines = text.split('\n')
  const pats = [/(\+\d{2,3}\d{6,10})/,/(\d{10,13})/,/(00\d{10,13})/]
  for (const line of lines) {
    const low = line.toLowerCase()
    if (low.includes('phone')||low.includes('mobile')||low.includes('tel')||low.includes('contact')||low.includes('mob')) {
      for (const p of pats) { const m = line.match(p); if (m) return m[1] }
    }
  }
  for (const p of pats) { const m = text.match(p); if (m) return m[1] }
  return ''
}

// Validates: +XX or +XXX followed by 6-10 digits
export function validateContactNumber(num: string): boolean {
  if (!num) return false
  const n = num.replace(/\s/g, '')
  if (/^\+\d{2,3}\d{6,10}$/.test(n)) return true  // +94XXXXXXXX format
  if (/^\d{8,13}$/.test(n)) return true             // plain digits
  return false
}

export async function performOCR(imageData: string, mode: 'fast' | 'ai' = 'fast'): Promise<OCRResult> {
  if (!workerReady || !worker) await initTesseractWorker()
  try {
    const { data } = await worker.recognize(imageData)
    const raw = data.text || ''
    const confidence = data.confidence || 0
    const rawContact = extractContact(raw)
    return {
      customerName: extractName(raw),
      contactNumber: rawContact,
      billNumber: extractBillNum(raw),
      billDate: '', restaurant: '', address: '', deliveryPartner: '',
      rawText: raw, confidence,
    }
  } catch (e) {
    console.error('OCR error:', e)
    return { customerName:'', contactNumber:'', billNumber:'', billDate:'', restaurant:'', address:'', deliveryPartner:'', rawText:'', confidence: 0 }
  }
}

function extractName(text: string): string {
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const low = line.toLowerCase()
    if (low.startsWith('name')||low.startsWith('customer')||low.startsWith('client')) {
      const val = line.replace(/^[^:]+:\s*/i,'').trim()
      if (val.length > 1 && val.length < 60) return val
    }
  }
  for (const line of text.split('\n').slice(0,5)) {
    if (/^[A-Za-z][A-Za-z\s]{3,40}$/.test(line.trim())) return line.trim()
  }
  return ''
}

function extractBillNum(text: string): string {
  const m = text.match(/(?:bill|invoice|receipt|order|no)[.:\s#]+([A-Z0-9-]{3,20})/i)
    || text.match(/#\s*([A-Z0-9-]{3,20})/i)
    || text.match(/\b([A-Z]{2,4}[-]\d{4,10})\b/)
  return m ? m[1].trim() : ''
}
