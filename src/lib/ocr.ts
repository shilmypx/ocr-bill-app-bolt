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
      // 1200px is optimal for receipt OCR — large enough for text, small enough to be fast
      const MAX = 900   // 900px is optimal — faster Tesseract, same receipt quality
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')!
      // GPU-accelerated contrast boost — much faster than pixel loop
      ctx.filter = 'contrast(1.4) grayscale(1) brightness(1.05)'
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Phone normalisation ───────────────────────────────────────────────────────
//
// All real-bill phone formats observed:
//   +97451118518          → +974 + 51118518   (Snoonu standard)
//   +97477075570          → +974 + 77075570
//   +97466583593          → +974 + 66583593
//   55014445              → 8 digits only → +974 + 55014445  (Snoonu no-prefix)
//   +33942224             → +33 + 8-digit OCR-quirk → treat 8 digits → +974 + 33942224
//   (+ 97466186274 split) → reassembled → +974 + 66186274  (Hurrier multi-line)
//   (+974) 55575759       → +974 + 55575759   (Rafeeq parens)
//   (+974) 50306006       → +974 + 50306006
//   (+974) 55606693       → +974 + 55606693
//   +97450367877          → +974 + 50367877   (Hurrier single-line)
//   +97455985888          → +974 + 55985888
//   +97430000999          → +974 + 30000999   (Izghawa direct)

function normalisePhone(raw: string): { code: string; local: string; full: string } | null {
  // Strip parens, spaces, dashes — keep leading +
  const stripped = raw.replace(/[()[\]\s\-]/g, '')

  let digits = ''
  if (stripped.startsWith('+')) {
    digits = stripped.slice(1).replace(/\D/g, '')
  } else if (stripped.startsWith('00')) {
    digits = stripped.slice(2).replace(/\D/g, '')
  } else {
    digits = stripped.replace(/\D/g, '')
  }

  if (!digits) return null

  // ── Rule 1: exactly 8 digits → Qatar local ────────────────────────────────
  // Covers: "55014445", "+33942224" (OCR misread), "+66915444"
  if (digits.length === 8) {
    return { code: '+974', local: digits, full: '+974' + digits }
  }

  // ── Rule 2: 11 digits, fix OCR misread of '+' sign ────────────────────────
  // "+97451118518" misread as "07451118518" or "87451118518":
  // digits[1:3] == '74' but digits[0] != '9' → restore '9'
  if (digits.length === 11) {
    if (!digits.startsWith('9') && digits.slice(1, 3) === '74') {
      digits = '9' + digits.slice(1)
    }
    if (digits.startsWith('974')) {
      return { code: '+974', local: digits.slice(3), full: '+' + digits }
    }
    // Other 11-digit international: last 8 = local
    return { code: '+' + digits.slice(0, 3), local: digits.slice(3), full: '+' + digits }
  }

  // ── Rule 3: 12 digits starting with 974 ──────────────────────────────────
  if (digits.startsWith('974') && digits.length === 12) {
    return { code: '+974', local: digits.slice(3), full: '+' + digits }
  }

  // ── Rule 4: 9 digits → Qatar (some Qatar numbers have 9-digit locals) ─────
  if (digits.length === 9) {
    return { code: '+974', local: digits, full: '+974' + digits }
  }

  // ── Rule 5: generic international (last 8 = local, rest = code) ───────────
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

  // Phone label patterns across all bill formats:
  // Snoonu:  "Customer Phone:"
  // Rafeeq:  "Mobile number:", "Phone Number:"
  // Hurrier: "TEL:"
  // Arabic:  "هاتف", "الهاتف", "رقم الهاتف"
  const PHONE_LABEL = /customer\s*phone|mobile\s*number|mobile\s*no|phone\s*number|phone\s*no|^tel[\s:]+|contact\s*phone|هاتف|الهاتف|رقم الهاتف/i
  const PHONE_TOKEN = /(\(?\+?[\d][().\d\s\-]{6,17})/g

  for (let i = 0; i < lines.length; i++) {
    if (!PHONE_LABEL.test(lines[i])) continue

    // ── Special handling for Hurrier "TEL: +" split across multiple lines ──
    // Image 1 example: line="TEL: +" / "97466" / "18627" / "4"
    if (/^tel[\s:]/i.test(lines[i])) {
      // Collect the full phone by joining this line + subsequent digit-only lines
      let combined = lines[i]
      for (let j = i + 1; j <= i + 6 && j < lines.length; j++) {
        const t = lines[j].trim()
        // Append if purely digits (or + sign) — these are continuation fragments
        if (/^[\d+]+$/.test(t)) {
          combined += t
        } else {
          break
        }
      }
      // Now search for phone in the combined string
      for (const m of (combined.match(PHONE_TOKEN) || [])) {
        const p = normalisePhone(m); if (p) return p
      }
    }

    // Try number on same line
    for (const m of (lines[i].match(PHONE_TOKEN) || [])) {
      const p = normalisePhone(m); if (p) return p
    }

    // Try next 1-2 lines
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      for (const m of (lines[j].match(PHONE_TOKEN) || [])) {
        const p = normalisePhone(m); if (p) return p
      }
    }
  }

  // ── Fallback 1: (+974) XXXXXXXX pattern ───────────────────────────────────
  const fullText = lines.join(' ')
  for (const m of (fullText.match(/\(\+\d{1,4}\)\s*\d{6,10}/g) || [])) {
    const p = normalisePhone(m); if (p) return p
  }

  // ── Fallback 2: +XXXXXXXXXX pattern ───────────────────────────────────────
  for (const m of (fullText.match(/\+\d{8,14}/g) || [])) {
    const p = normalisePhone(m); if (p) return p
  }

  // ── Fallback 3: standalone 8-digit number on its own line ─────────────────
  for (const line of lines) {
    if (/^\d{8}$/.test(line)) {
      return { code: '+974', local: line, full: '+974' + line }
    }
  }

  // ── Fallback 4: Izghawa direct — phone right after Customer: block ────────
  for (let i = 0; i < lines.length; i++) {
    if (/^customer[\s(:]/i.test(lines[i])) {
      // Check next 1-3 lines for a phone number
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        const t = lines[j].trim()
        if (/^\+?\d{8,14}$/.test(t.replace(/[\s\-()]/g, ''))) {
          const p = normalisePhone(t)
          if (p) return p
        }
      }
    }
  }

  return null
}

// ── Name finder ───────────────────────────────────────────────────────────────

// A name is valid if it contains ONLY basic Latin letters, spaces, hyphens, apostrophes, dots
// Rejects: Arabic, OCR garbage, known label words and receipt badge words
function isLatinName(s: string): boolean {
  if (!s || s.length < 2 || s.length > 80) return false
  if (/^\d/.test(s) || /^\+/.test(s)) return false
  if (!/^[a-zA-Z][a-zA-Z\s\-''.]*$/.test(s)) return false
  // Reject known label / badge / receipt / address / food words
  if (/^(customer|mobile|phone|tel|order|delivery|vendor|pickup|collection|hurrier|snoonu|rafeeq|no cutlery|subtotal|total|prepaid|not paid|pro|item|qty|qar|qr|price|note|address|street|building|floor|zone|apartment|payment|online|cash|thanks|thank|village|compound|district|road|avenue|block|sector|area|gate|paradise|skimmed|labnah|matcha|frappe|smoothie|raspberry|chocolate|crunchy|croissant|sandwich|cake|latte|cappuccino|espresso|coffee|juice|toast|honey|cream|milk|fat|waffle|pancake|platinum|member)/i.test(s)) return false
  return true
}

// Helper for Hurrier smart-join: decides whether to concat or add space between name fragments
const HURRIER_VOWELS = 'aeiouAEIOU'
function hurrierNeedsConcat(accumulated: string, frag: string): boolean {
  // Rule 1: single char (e.g. "y") always concatenate
  if (frag.length === 1) return true
  const words = accumulated.split(' ')
  const lastWord = words[words.length - 1]
  const lastChar = lastWord[lastWord.length - 1]
  // Rule 2: last word is a single uppercase letter (initial like "F" in "Sara F")
  if (lastWord.length === 1 && lastChar >= 'A' && lastChar <= 'Z') return true
  // Rule 3: current frag starts lowercase AND last word is short AND ends consonant
  const fragStartsLower = frag.charAt(0) === frag.charAt(0).toLowerCase() &&
                          frag.charAt(0) !== frag.charAt(0).toUpperCase()
  if (fragStartsLower && lastWord.length <= 5 && !HURRIER_VOWELS.includes(lastChar)) return true
  return false
}

function isValidName(s: string): boolean { return isLatinName(s) }

function findName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // ── Snoonu/Rafeeq: "Customer: NAME" or "Customer (العميل): NAME" ──────────
  // NOTE: ALL Snoonu bills have "العميل" on the next line regardless of whether
  // the customer name is Arabic or English — so we ONLY check the name portion
  // itself for Arabic, NOT the surrounding lines.
  for (let i = 0; i < lines.length; i++) {
    if (!/^customer[\s(:]/i.test(lines[i])) continue

    // Extract name portion after the colon
    const afterColon = lines[i].replace(/^.*?:\s*/i, '').trim()

    // Clear if the name itself contains Arabic Unicode characters
    if (/[\u0600-\u06FF]/.test(afterColon)) return ''

    // Clear if name contains non-ASCII garbage (OCR failed on Arabic)
    if (afterColon && /[^\x20-\x7E]/.test(afterColon)) return ''

    // Clear very short names (≤3 chars) on Arabic-context bills — likely OCR misread
    // e.g. Tesseract reads Arabic "جيو" as "Jio". Real short English names are ≥4 chars.
    const billHasArabic = /[\u0600-\u06FF]/.test(text)
    if (afterColon && afterColon.length <= 3 && billHasArabic) return ''

    if (isLatinName(afterColon)) return afterColon

    // Name on next line (Izghawa direct: "Customer:\nTee")
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : ''
    // Only use next line if it's purely Latin (not Arabic label "العميل")
    if (nextLine && !/[\u0600-\u06FF]/.test(nextLine) && isLatinName(nextLine)) return nextLine
  }

  // ── Hurrier: collect ALL fragments between #XXXX and TEL: ─────────────────
  // Hurrier prints name in a NARROW right column — Tesseract splits names across
  // many lines and even mid-word:
  //   "#7086 asma Obeidat / [pro] / TEL:"         → "asma Obeidat"
  //   "#6113 Reem / MKH / Al / Thani / TEL:"      → "Reem MKH Al Thani"
  //   "#6036 sawar / y / Alhajri / TEL:"          → "sawary Alhajri"
  //   "#6111 Sara F / akhroo / TEL:"              → "Sara Fakhroo"
  //   "#6075 Fatma / Mahm / oud / [pro] / TEL:"   → "Fatma Mahmoud"
  //   "#6070 ha / TEL:"                           → "ha"
  //   "#7099 Reem Youssef / TEL: / paradise village" → "Reem Youssef"
  for (let i = 1; i < lines.length; i++) {
    if (!/^tel[\s:]/i.test(lines[i])) continue

    // Find the order number line (#XXXX) scanning backwards
    let orderIdx = -1
    for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
      if (/^#?\d{4,}/.test(lines[j])) { orderIdx = j; break }
      if (/^hurrier/i.test(lines[j])) break
    }

    // Collect every fragment between order number and TEL:
    const frags: string[] = []
    const scanFrom = orderIdx >= 0 ? orderIdx : Math.max(0, i - 12)
    for (let j = scanFrom; j < i; j++) {
      const l = lines[j].trim()
      if (!l) continue
      if (/^#?\d{4,}/.test(l)) {
        // Extract inline name after the order number (e.g. "#7086 asma Obeidat")
        const after = l.replace(/^#?\d+\s*/, '').trim()
        if (after && !/^(hurrier|collection|prepaid|not paid|pickup|am\b|pm\b)/i.test(after))
          frags.push(after)
        continue
      }
      // Skip receipt structure words
      if (/^(hurrier|snoonu|rafeeq|collection|prepaid|not paid|pickup|at\b|am\b|pm\b|no cutlery|subtotal|total|delivery|order nr|pro\b)/i.test(l)) continue
      // Skip address prepositions / articles that appear in delivery notes
      // e.g. "in front of qatar energy", "The entrance of the building"
      if (/^(in\b|of\b|the\b|at\b|by\b|on\b|to\b|for\b|from\b|and\b|with\b|between\b|front\b|gate\b|your\b|is\b|no\b)/i.test(l)) continue
      // Skip pure digit lines (times, partial phone fragments)
      if (/^[\d:]+$/.test(l)) continue
      // Skip Arabic text
      if (/[\u0600-\u06FF]/.test(l)) continue
      // Accept anything else — including short fragments like "y", "MKH", "oud"
      frags.push(l)
    }

    if (frags.length === 0) continue

    // Smart-join rules (handles narrow-column Tesseract line wrapping):
    // 1. Single char ("y") → always concatenate: "sawar"+"y" → "sawary"
    // 2. Last word ends with uppercase ("Sara F") → concatenate: +"akhroo" → "Sara Fakhroo"
    // 3. Last word is short (≤5 chars) + ends consonant ("Mahm") → concatenate: +"oud" → "Mahmoud"
    // 4. Otherwise → add space: "noura"+"noura" → "noura noura" (vowel ending, not truncated)
    let name = frags[0]
    for (let k = 1; k < frags.length; k++) {
      name = hurrierNeedsConcat(name, frags[k]) ? name + frags[k] : name + ' ' + frags[k]
    }

    // Final validation: must start with a letter and not be a known non-name
    name = name.trim()
    if (name.length >= 2 && /^[a-zA-Z]/.test(name) &&
        !/^(no cutlery|subtotal|total|delivery|pickup|collection|prepaid)/i.test(name)) {
      return name
    }
  }

  // ── Forward scan fallback (name placed AFTER TEL: by Tesseract column ordering)
  for (let i = 1; i < lines.length; i++) {
    if (!/^tel[\s:]/i.test(lines[i])) continue
    for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
      const l = lines[j].trim()
      if (/^(\d|qr|subtotal|total|delivery|no cutlery|may|order)/i.test(l)) break
      if (isLatinName(l)) return l
    }
  }

  return ''
}

// ── Order number finder ───────────────────────────────────────────────────────
// Must NOT match dates (YYYY-MM-DD, DD/MM/YYYY, May-13-2026 etc.)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i

function isDateStr(s: string): boolean {
  return DATE_RE.test(s.trim())
}

function findOrderNumber(text: string): string {
  const lines = text.split('\n').map(l => l.trim())

  // ── Snoonu / Rafeeq / custom: "Order Number", "Order No.", "Order No" heading ──
  for (let i = 0; i < lines.length; i++) {
    if (/order\s*(number|no\.?|nr\.?|#)/i.test(lines[i]) || /رقم الطلب/i.test(lines[i])) {
      // Search next 1-4 lines for a pure digit string (5-15 digits, not a date)
      for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
        const c = lines[j].trim()
        if (/^\d{5,15}$/.test(c) && !isDateStr(c)) return c
      }
    }
  }

  // ── Rafeeq: "Order No.\n\n67569242" (number after blank line) ──────────────
  for (let i = 0; i < lines.length; i++) {
    if (/^order\s*no[\s.]/i.test(lines[i])) {
      for (let j = i + 1; j <= i + 5 && j < lines.length; j++) {
        const c = lines[j].trim()
        if (/^\d{5,15}$/.test(c) && !isDateStr(c)) return c
      }
    }
  }

  // ── Hurrier: "#6207" or "#7115" on its own ─────────────────────────────────
  for (const line of lines) {
    const m = line.match(/^#(\d{4,10})/)
    if (m) return m[1]
  }

  // ── Hurrier: "ORDER NR: 3623632460" or "ORDER NR.: 3632273376" ─────────────
  for (const line of lines) {
    const m = line.match(/order\s*nr\.?\s*:?\s*(\d{5,15})/i)
    if (m && !isDateStr(m[1])) return m[1]
  }

  // ── Izghawa: "Order #697514" inline ────────────────────────────────────────
  const inlineMatch = text.match(/order\s*#\s*(\d{4,15})/i)
  if (inlineMatch && !isDateStr(inlineMatch[1])) return inlineMatch[1]

  // ── Standalone large number (7-10 digits, own line, not a date) ────────────
  for (const line of lines) {
    const m = line.match(/^(\d{7,10})$/)
    if (m && !isDateStr(line)) return m[1]
  }

  return ''
}

// ── Delivery partner finder ───────────────────────────────────────────────────
function findPartner(text: string): string {
  const partners = [
    { name: 'Snoonu',        re: /snoonu/i },
    { name: 'Rafeeq',        re: /rafeeq|رفيق/i },
    { name: 'Hurrier',       re: /hurrier/i },
    { name: 'Talabat',       re: /talabat/i },
    { name: 'HungerStation', re: /hungerstation/i },
    { name: 'Jahez',         re: /jahez/i },
    { name: 'Careem',        re: /careem/i },
    { name: 'Noon Food',     re: /noon\s*food/i },
    { name: 'Marsool',       re: /marsool/i },
    { name: 'Zomato',        re: /zomato/i },
  ]
  for (const { name, re } of partners) { if (re.test(text)) return name }
  return ''
}

// ── Restaurant / vendor finder ────────────────────────────────────────────────
function findRestaurant(text: string): string {
  const lines = text.split('\n').map(l => l.trim())

  // Rafeeq: "Vendor Name : O2 Cafe"
  for (const line of lines) {
    if (/vendor\s*(name)?\s*:/i.test(line) || /اسم البائع/i.test(line)) {
      const val = line.replace(/^.*?:\s*/i, '').trim()
      if (val.length > 1 && val.length < 80) return val
    }
  }

  // Snoonu/direct: line containing "O2 Cafe"
  for (const line of lines) {
    if (/O2\s*Caf[eé]/i.test(line)) {
      return line.replace(/delivery order|takeaway|pickup order/gi, '').trim()
    }
  }

  if (/\bizghawa\b/i.test(text)) return 'O2 Cafe - Izghawa'

  return ''
}

// ── Date finder ───────────────────────────────────────────────────────────────
function findDate(text: string): string {
  // ISO: 2026-05-16 (with optional time)
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}:\d{2})?\b/)
  if (iso) return iso[1]
  // US slash: 5/14/2026
  const us = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)
  if (us) return us[1]
  // Verbal: May-14-2026 or May 12, 2026
  const verbal = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-]+\d{1,2}[\s,\-]+\d{4}/i)
  if (verbal) return verbal[0]
  return ''
}


// ── Claude Vision OCR (AI Enhanced mode) ─────────────────────────────────────
// Uses Claude's multimodal API for accurate digit/text extraction
async function performOCRWithClaude(imageData: string): Promise<OCRResult> {
  try {
    const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
            },
            {
              type: 'text',
              text: `Extract from this delivery bill receipt. Return ONLY valid JSON, no other text:
{
  "name": "customer name in English only, empty string if Arabic or not found",
  "phone": "full phone number with country code e.g. +97455322995, empty if not found",
  "orderNumber": "order/bill number digits only, empty if not found",
  "partner": "delivery company name e.g. Snoonu, Rafeeq, Hurrier, or empty",
  "date": "date in YYYY-MM-DD format or empty"
}`
            }
          ]
        }]
      })
    })

    if (!response.ok) throw new Error('Claude API error: ' + response.status)

    const data = await response.json()
    const text = data?.content?.[0]?.text || ''
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Claude response')
    
    const parsed = JSON.parse(jsonMatch[0])
    
    // Normalise the phone number
    const rawPhone = (parsed.phone || '').trim()
    const normPhone = rawPhone ? normalisePhone(rawPhone) : null

    return {
      customerName:    parsed.name || '',
      contactNumber:   normPhone?.full || rawPhone || '',
      orderNumber:     parsed.orderNumber || '',
      billDate:        parsed.date || '',
      restaurant:      '',
      address:         '',
      deliveryPartner: parsed.partner || '',
      rawText:         text,
      confidence:      95, // Claude is highly accurate
    }
  } catch (e) {
    console.error('Claude Vision error:', e)
    // Fall back to Tesseract
    return performOCRWithTesseract(imageData)
  }
}

// ── Tesseract OCR (Fast mode) ─────────────────────────────────────────────────
async function performOCRWithTesseract(imageData: string): Promise<OCRResult> {
  if (!workerReady || !worker) await initTesseractWorker()
  try {
    const { data } = await worker.recognize(imageData)
    const raw: string = data?.text || ''
    const confidence: number = data?.confidence || 0
    const phone = findPhone(raw)
    return {
      customerName:    findName(raw),
      contactNumber:   phone?.full || '',
      orderNumber:     findOrderNumber(raw),
      billDate:        findDate(raw),
      restaurant:      findRestaurant(raw),
      address:         '',
      deliveryPartner: findPartner(raw),
      rawText:         raw,
      confidence,
    }
  } catch (e) {
    console.error('Tesseract error:', e)
    return { customerName:'', contactNumber:'', orderNumber:'', billDate:'', restaurant:'', address:'', deliveryPartner:'', rawText:'', confidence:0 }
  }
}

// ── Main OCR dispatcher ────────────────────────────────────────────────────────
export async function performOCR(imageData: string, mode: 'fast' | 'ai' = 'fast'): Promise<OCRResult> {
  if (mode === 'ai') {
    return performOCRWithClaude(imageData)
  }
  return performOCRWithTesseract(imageData)
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
