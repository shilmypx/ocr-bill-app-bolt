'use client'
import type { OCRResult } from '@/types'

// Singleton Tesseract worker
let tesseractWorker: unknown = null
let workerReady = false
let workerInitializing = false

export async function initTesseractWorker() {
  if (workerReady || workerInitializing) return
  workerInitializing = true
  try {
    const { createWorker } = await import('tesseract.js')
    tesseractWorker = await createWorker('eng', 1, {
      logger: () => {},
    })
    workerReady = true
  } catch (err) {
    console.error('Tesseract init failed:', err)
  } finally {
    workerInitializing = false
  }
}

// Pre-process image in canvas for better OCR
export function preprocessImage(imageData: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX_SIZE = 1200
      let w = img.width
      let h = img.height
      if (w > MAX_SIZE || h > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      // Grayscale + contrast
      const imgData = ctx.getImageData(0, 0, w, h)
      const data = imgData.data
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]
        // Contrast enhancement
        const contrast = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128))
        data[i] = data[i+1] = data[i+2] = contrast
      }
      ctx.putImageData(imgData, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = imageData
  })
}

// Extract phone numbers from text
function extractPhoneNumber(text: string): string {
  const patterns = [
    /(?:(?:\+|00)966|0)?(?:5\d{8})/g, // Saudi
    /(?:\+\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/g, // Generic
    /\b\d{10,12}\b/g, // Long numbers
  ]
  for (const pattern of patterns) {
    const matches = text.match(pattern)
    if (matches && matches.length > 0) {
      return matches[0].replace(/[\s\-\(\)]/g, '')
    }
  }
  return ''
}

// Extract customer name from text
function extractCustomerName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2)
  const namePatterns = [
    /(?:customer|name|client|recipient|deliver to|deliver|to)\s*[:\-]?\s*([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s]{2,40})/i,
    /(?:اسم|العميل|المستلم)\s*[:\-]?\s*([\u0600-\u06FF][^\n]{2,30})/,
  ]
  for (const pattern of namePatterns) {
    for (const line of lines) {
      const match = line.match(pattern)
      if (match) return match[1].trim()
    }
  }
  return ''
}

// Extract bill number
function extractBillNumber(text: string): string {
  const patterns = [
    /(?:order|bill|receipt|invoice|ref|#|no\.?)\s*[:\-#]?\s*([A-Z0-9\-]{4,20})/i,
    /\b([A-Z]{2,4}[-\s]?\d{4,10})\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return ''
}

// Extract bill date
function extractBillDate(text: string): string {
  const patterns = [
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
    /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/,
    /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  return ''
}

// Extract delivery partner
function extractDeliveryPartner(text: string): string {
  const partners = ['Talabat', 'HungerStation', 'Jahez', 'Careem', 'Noon Food', 'Marsool', 'Zomato', 'Uber Eats']
  const lower = text.toLowerCase()
  for (const p of partners) {
    if (lower.includes(p.toLowerCase())) return p
  }
  return ''
}

// Extract restaurant name
function extractRestaurant(text: string): string {
  const patterns = [
    /(?:restaurant|from|outlet|branch)\s*[:\-]?\s*([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s&]{2,40})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return ''
}

// Extract address
function extractAddress(text: string): string {
  const pattern = /(?:address|delivery address|addr|location)\s*[:\-]?\s*([^\n]{10,100})/i
  const match = text.match(pattern)
  return match ? match[1].trim() : ''
}

// Main OCR function
export async function performOCR(imageData: string, mode: 'fast' | 'ai' = 'fast'): Promise<OCRResult> {
  const startTime = Date.now()

  // Check if it's already a digital PDF/text (skip OCR)
  if (imageData.startsWith('data:application/pdf')) {
    return {
      customerName: '',
      contactNumber: '',
      billNumber: '',
      billDate: '',
      restaurant: '',
      address: '',
      deliveryPartner: '',
      rawText: 'PDF detected - use PDF extraction',
      confidence: 0,
    }
  }

  // Preprocess image
  const processed = await preprocessImage(imageData)

  if (!workerReady) {
    await initTesseractWorker()
  }

  let rawText = ''
  let confidence = 0

  try {
    if (tesseractWorker && workerReady) {
      const worker = tesseractWorker as { recognize: (img: string) => Promise<{ data: { text: string; confidence: number } }> }
      const result = await worker.recognize(processed)
      rawText = result.data.text
      confidence = result.data.confidence
    }
  } catch (err) {
    console.error('OCR failed:', err)
    throw new Error('OCR processing failed')
  }

  const elapsed = Date.now() - startTime
  console.log(`OCR completed in ${elapsed}ms, confidence: ${confidence}%`)

  return {
    customerName: extractCustomerName(rawText),
    contactNumber: extractPhoneNumber(rawText),
    billNumber: extractBillNumber(rawText),
    billDate: extractBillDate(rawText),
    restaurant: extractRestaurant(rawText),
    address: extractAddress(rawText),
    deliveryPartner: extractDeliveryPartner(rawText),
    rawText,
    confidence,
  }
}

// Compress image before processing
export function compressImage(file: File, maxSizeKB = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const MAX_DIM = 1600
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        let quality = 0.85
        const tryCompress = () => {
          const result = canvas.toDataURL('image/jpeg', quality)
          const sizeKB = (result.length * 3) / 4 / 1024
          if (sizeKB > maxSizeKB && quality > 0.3) {
            quality -= 0.1
            tryCompress()
          } else {
            resolve(result)
          }
        }
        tryCompress()
      }
      img.onerror = reject
      img.src = e.target!.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function validateContactNumber(num: string): boolean {
  const clean = num.replace(/[\s\-\(\)\+]/g, '')
  return /^\d{9,15}$/.test(clean)
}
