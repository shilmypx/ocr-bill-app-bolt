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
    // Keep default PSM 3 (auto-detect layout) — handles bilingual Rafeeq bills
    // and mixed-font Hurrier/Snoonu bills correctly. PSM 6 breaks Arabic+English.
    workerReady = true
  } catch (e) { console.warn('Tesseract init failed:', e) }
}

// cropFraction: top portion to keep (Hurrier: top 45% = 3x faster, name always in top section)
// hStartFraction: 0=full width, 0.4=crop left 40% (right 60% only — used for Hurrier)
export async function compressImage(file: File, cropFraction = 1.0, hStartFraction = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = (cropFraction < 1 || hStartFraction > 0) ? 800 : 900  // 900px for full quality, 800px when cropped
      const srcW = img.naturalWidth, srcH = img.naturalHeight
      const srcX = Math.round(srcW * hStartFraction)   // horizontal crop start
      const srcCropW = srcW - srcX                      // width of cropped region
      const cropH = Math.round(srcH * cropFraction)
      let dstW = srcCropW, dstH = cropH
      if (dstW > MAX || dstH > MAX) {
        if (dstW > dstH) { dstH = Math.round(dstH * MAX / dstW); dstW = MAX }
        else { dstW = Math.round(dstW * MAX / dstH); dstH = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = dstW; canvas.height = dstH
      const ctx = canvas.getContext('2d')!
      ctx.filter = 'contrast(1.5) grayscale(1) brightness(1.05)'
      ctx.drawImage(img, srcX, 0, srcCropW, cropH, 0, 0, dstW, dstH)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = url
  })
}

// Crop a base64 imageData to the right portion — used for Hurrier camera captures
// Removes the large left-column order number so Tesseract only sees the right column text
export async function cropRightColumn(imageData: string, hStart = 0.40, vEnd = 0.60): Promise<string> {
  if (typeof window === 'undefined') return imageData
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const srcX = Math.round(img.width * hStart)
      const srcW = img.width - srcX
      const srcH = Math.round(img.height * vEnd)
      const canvas = document.createElement('canvas')
      canvas.width = srcW; canvas.height = srcH
      const ctx = canvas.getContext('2d')!
      ctx.filter = 'contrast(1.5) grayscale(1) brightness(1.05)'
      ctx.drawImage(img, srcX, 0, srcW, srcH, 0, 0, srcW, srcH)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => resolve(imageData)  // fallback to original on error
    img.src = imageData
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
  if (/^(customer|mobile|phone|tel|order|delivery|vendor|pickup|collection|hurrier|snoonu|rafeeq|no cutlery|subtotal|total|prepaid|not paid|pro|item|qty|qar|qr|price|note|address|street|building|floor|zone|apartment|payment|online|cash|thanks|thank|village|compound|district|road|avenue|block|sector|area|gate|paradise|skimmed|labnah|matcha|frappe|smoothie|raspberry|chocolate|crunchy|croissant|sandwich|cake|latte|cappuccino|espresso|coffee|juice|toast|honey|cream|milk|fat|waffle|pancake|platinum|gold|member|silver|bronze|brunch|falafel|egg|taco|tacos|bun|mushroom|in\b|of\b|the\b|at\b|by\b|on\b|to\b|for\b|from\b|and\b|with\b|between\b|front\b|your\b|is\b|no\b)/i.test(s)) return false
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

  // Name: robust — handles all 4 Snoonu name patterns:
  //   N1: "Customer:  Noor"          → name on same line
  //   N2: "Customer:  شيخة المري"    → Arabic name → cleared (can't OCR Arabic)
  //   N3: "Customer:" / "العميل" / "shaikha" → name 2+ lines below (wrapped column)
  //   N4: "Customer  Noor Almarafi"  → name same line, no colon
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Must start with "customer" (word boundary — rejects "Customers:", "CustomerID")
    if (!/^customer\b/i.test(line)) continue
    // Extract everything after the first non-letter separator (handles : | , space)
    const after = line.replace(/^customer[^a-zA-Z\u0600-\u06FF]*/i, '').trim()
    if (after) {
      // Arabic name or non-ASCII garbage → clear and stop
      if (/[\u0600-\u06FF]/.test(after) || /[^\x20-\x7E]/.test(after)) { name = ''; break }
      // Very short names on Arabic-context bills are OCR garbage
      if (billHasArabic && after.length <= 3) { name = ''; break }
      if (isLatinName(after)) { name = after; break }
    } else {
      // N3: "Customer:" has empty after — name may be below, past Arabic line(s)
      // e.g.: Customer: → العميل → shaikha
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        const l = lines[j].trim()
        if (!l) continue
        if (/[\u0600-\u06FF]/.test(l)) continue        // skip Arabic lines
        if (/^customer\s*phone/i.test(l)) break           // hit phone section — stop
        if (isLatinName(l)) { name = l; break }
      }
      if (name) break
    }
  }

  // Phone: accumulate digits from phone label + next lines, extract Qatar pattern
  // FIXED: using specific label match to avoid false triggers:
  //   "هاتف" alone is too broad — matches رقم الهاتف (order label) causing order
  //   numbers to be returned as phone. Use "هاتف العميل" (Customer Phone in Arabic).
  // Uses digit accumulation + pattern extraction (not raw PHONE_TOKEN) so OCR
  // spacing artifacts inside the number don't cause mismatches.
  //
  // Supported formats:
  //   Customer Phone: +97455228911        ← standard (phone on same line)
  //   Customer Phone: 55228911            ← bare 8 digits
  //   Customer Phone: +55877118           ← OCR misread +974 prefix
  //   Customer Phone: / هاتف العميل / +97470696934  ← new format (phone 2 lines down)
  for (let i = 0; i < lines.length; i++) {
    if (!/customer\s*phone|هاتف\s*العميل/i.test(lines[i])) continue
    // Accumulate ALL digits from label line + next 4 lines
    let acc = lines[i].replace(/\D/g, '')
    for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
      const l = lines[j]
      if (/^[\u0600-\u06FF]/.test(l)) continue  // skip Arabic lines (هاتف العميل etc.)
      if (/^(\d+\s+[A-Z]|subtotal|total|delivery|qar\b)/i.test(l)) break  // stop at items
      acc += l.replace(/\D/g, '')
      if (acc.length >= 20) break  // enough digits to find any phone
    }
    // Extract Qatar phone from accumulated digits:
    //   Pattern A: 974 + 8 digits → handles +97455228911, (+ 974) 55228911
    //   Pattern B: [3-7] + 7 digits → handles bare 8-digit Qatar mobiles (55228911)
    //              [3-7] prefix EXCLUDES order numbers starting with 8, 9
    const mA = acc.match(/974(\d{8})/)
    if (mA) { const p = normalisePhone('+974' + mA[1]); if (p) { phone = p.full; break } }
    const mB = acc.match(/([3-7]\d{7})/)
    if (mB) { const p = normalisePhone(mB[1]); if (p) { phone = p.full; break } }
  }

  return { name, phone }
}

// ── Rafeeq ────────────────────────────────────────────────────────────────────
// All confirmed Rafeeq bill formats:
//
// FORMAT A (standard new Rafeeq):
//   اسم الزبون
//   Customer : NAME
//   رقم الهاتف
//   Phone Number : (+974) XXXXXXXX
//
// FORMAT B (name on next line when colon is empty):
//   Customer :
//   NAME
//   Phone Number : (+974) XXXXXXXX
//
// FORMAT C (old Rafeeq bilingual):
//   Customer (العميل): NAME
//   Mobile number (رقم الهاتف) :
//   (+974) XXXXXXXX
//
// Arabic names (all formats) → cleared (Tesseract English cannot OCR Arabic)
// English names (all formats) → captured
function rafeeqExtract(lines: string[]): { name: string; phone: string } {
  let name = ''
  let phone = ''

  // ── Name ─────────────────────────────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    if (!/^customer\b/i.test(lines[i])) continue
    // Strip "Customer" + any non-letter separators (handles " : ", " (العميل): " etc.)
    // Stop stripping at first Latin or Arabic letter to avoid consuming the name
    const after = lines[i].replace(/^customer[^a-zA-Z\u0600-\u06FF]*/i, '').trim()
    if (after) {
      // Arabic name → clear (cannot OCR reliably with English Tesseract)
      if (/[\u0600-\u06FF]/.test(after) || /[^\x20-\x7E]/.test(after)) { name = ''; break }
      if (isLatinName(after)) { name = after; break }
    } else {
      // Empty afterColon → name is on the NEXT line (Format B)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim()
        if (nextLine && !/[\u0600-\u06FF]/.test(nextLine) && isLatinName(nextLine)) {
          name = nextLine; break
        }
      }
    }
  }

  // ── Phone — multi-level detection ────────────────────────────────────────────
  // Level 1: accumulate ALL digits from phone label + next 5 lines, then extract the
  // phone PATTERN from within the accumulated string.
  // This handles: OCR-split digits ("5 5226340"), date digits between label and phone,
  // and any whitespace-fragmented phone fragments.
  const RAFEEQ_PHONE_LABELS = /mobile\s*number|phone\s*number|رقم\s*الهاتف|هاتف/i
  for (let i = 0; i < lines.length; i++) {
    if (!RAFEEQ_PHONE_LABELS.test(lines[i])) continue
    // Accumulate ALL digits from this line and next 5 lines (forward only)
    let acc = lines[i].replace(/\D/g, '')
    for (let j = i + 1; j <= i + 5 && j < lines.length; j++) {
      const l = lines[j]
      if (/^(vendor|item|total|subtotal|delivery fee|payment type|thanks)/i.test(l)) break
      acc += l.replace(/\D/g, '')
      if (acc.length >= 24) break  // enough to extract any phone
    }
    // Extract Qatar phone pattern FROM within the accumulated digits:
    //   Pattern A: 974 + 8 digits  → handles "(+974) 55226340" → acc="97455226340"
    //   Pattern B: 8 digits starting with 3-7 → handles bare local number "55226340"
    let extracted = ''
    const mA = acc.match(/974(\d{8})/)
    if (mA) extracted = '+974' + mA[1]
    else {
      const mB = acc.match(/([3-7]\d{7})/)
      if (mB) extracted = mB[1]  // will be normalised to +974XXXXXXXX
    }
    if (extracted) {
      const p = normalisePhone(extracted)
      if (p) { phone = p.full; break }
    }
  }

  // Level 2: compact-text search for (+974)XXXXXXXX or +974XXXXXXXX
  if (!phone) {
    const compact = lines.join(' ').replace(/\s+/g, '')
    const m2 = compact.match(/\(\+?974\)(\d{8,9})|\+974(\d{8,9})/)
    if (m2) {
      const local = m2[1] || m2[2]
      if (local) { const p = normalisePhone('+974' + local); if (p) phone = p.full }
    }
  }

  // Level 3: find 8-digit Qatar mobile (starts 3-7) ONLY in the section AFTER the phone label
  // — never search the full text (order numbers would match before the phone)
  if (!phone) {
    const labelIdx = lines.findIndex(l => RAFEEQ_PHONE_LABELS.test(l))
    const searchFrom = labelIdx >= 0 ? labelIdx : 0
    const afterLabel = lines.slice(searchFrom, searchFrom + 8).join(' ')
    const m3 = afterLabel.match(/\b([3-7]\d{7})\b/)
    if (m3) { const p = normalisePhone(m3[1]); if (p) phone = p.full }
  }

  return { name, phone }
}

// ── Hurrier ───────────────────────────────────────────────────────────────────
// All confirmed bill layouts — single line, multi-line split, name+TEL same line:
//   #7086: "asma Obeidat" / "pro" / "TEL: +97433935721"
//   #6070: "ha" / "TEL: +" / "97466" / "98622" / "7"   ← split across 4 lines
//   #6113: "Reem"/"MKH"/"Al"/"Thani" / "TEL: +" / "97450"/"75355"/"5"
//   #696:  "Nour A TEL: +97477994494"                   ← name+TEL same line
//   #6775: "pro TEL: +97430087745"                      ← no name, pro+TEL same line
//
// PHONE FIX: Previous code broke on the FIRST non-digit line between split fragments.
// Tesseract inserts garbage/blank lines between "97466" "98622" "7" so the loop
// broke after the first fragment, leaving an incomplete number.
// New approach: ACCUMULATE DIGITS from all nearby lines (skip non-digit lines
// rather than breaking), stopping only at known section boundaries.
function hurrierExtract(lines: string[]): { name: string; phone: string } {
  let name = ''
  let phone = ''

  for (let i = 0; i < lines.length; i++) {
    // TEL: can appear ANYWHERE in the line — no ^ anchor required
    const telMatch = /tel\s*[:\|;]/i.exec(lines[i])
    if (!telMatch) continue

    const telPos = telMatch.index

    // ── Phone: accumulate all digits from TEL: onwards ────────────────────────
    // Skip non-digit lines rather than breaking — Tesseract may insert garbage
    // lines between digit fragments (e.g. "97466" / "[noise]" / "98622" / "7")
    let rawDigits = lines[i].slice(telPos).replace(/\D/g, '')
    for (let j = i + 1; j <= Math.min(i + 8, lines.length - 1); j++) {
      const l = lines[j].trim()
      // Hard stop at known section boundaries
      if (/^(no cutlery|subtotal|total|delivery fee|qr\b|\d\s+[A-Z]|vendor|customer|pickup|hurrier|may\b|order nr|thanks|black\b|white\b|villa\b|floor\b|zone\b|street\b|apartment\b)/i.test(l)) break
      if (/^[\u0600-\u06FF]/.test(l)) break  // Arabic section separator (بدون أدوات المائدة etc.)
      // Include line if it's primarily digits (≥50% digit chars) — phone fragment
      const ld = l.replace(/\D/g, '')
      if (ld.length > 0 && ld.length / Math.max(l.length, 1) >= 0.5) {
        rawDigits += ld
        if (rawDigits.length >= 11) break  // full Qatar number assembled
      }
    }
    if (rawDigits.length >= 8) {
      const p = normalisePhone(rawDigits.startsWith('974') ? '+' + rawDigits : rawDigits)
      if (p) phone = p.full
    }

    // ── Name: fragments from BEFORE TEL: ─────────────────────────────────────
    // Part A: same line as TEL: — text before TEL: (strip order number if present)
    const beforeTel = lines[i].slice(0, telPos)
      .replace(/^#?\d+\s*/, '')  // strip leading #XXXX
      .replace(/\bpro\b/gi, '')   // strip "pro" badge
      .trim()

    // Part B: previous lines between order number and TEL: line
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
        // Extract name after order number on same line (e.g. "#7099 Reem Youssef")
        const after = l.replace(/^#?\d+\s*/, '').replace(/\bpro\b/gi, '').trim()
        if (after && !/^(hurrier|collection|prepaid|not paid|pickup|at\b|am\b|pm\b)/i.test(after)) frags.push(after)
        continue
      }
      // Skip receipt structure, badges, address words, digits
      if (/^(hurrier|snoonu|rafeeq|collection|prepaid|not paid|pickup|at\b|am\b|pm\b|no cutlery|subtotal|total|delivery|order nr|pro\b)/i.test(l)) continue
      if (/^(in\b|of\b|the\b|at\b|by\b|on\b|to\b|for\b|from\b|and\b|with\b|between\b|front\b|gate\b|your\b|is\b|no\b|entrance\b|building\b|black\b|white\b|door\b|main\b|road\b|villa\b|maia\b|caffe\b|porche\b|number\b|compound\b|district\b|zone\b|floor\b|apartment\b|street\b)/i.test(l)) continue
      if (/^[\d:]+$/.test(l)) continue
      if (/[\u0600-\u06FF]/.test(l)) continue
      frags.push(l)
    }
    // Add the name part from the TEL: line itself (comes last in reading order)
    if (beforeTel && !/^(hurrier|collection|prepaid|not paid|pickup|pro\b)/i.test(beforeTel)) {
      frags.push(beforeTel)
    }

    // Smart-join all name fragments
    if (frags.length > 0) {
      let n = frags[0]
      for (let k = 1; k < frags.length; k++) {
        n = hurrierNeedsConcat(n, frags[k]) ? n + frags[k] : n + ' ' + frags[k]
      }
      name = n.trim()
      if (!/^[a-zA-Z]/.test(name) ||
          /^(no cutlery|subtotal|total|delivery|pickup|collection|prepaid|entrance|building|maia|caffe|porche)/i.test(name)) {
        name = ''
      }
    }

    // Forward scan fallback — OCR put name AFTER TEL: due to column reordering
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

  // Crop strategy per partner (applied ONCE here — camera/file do NOT pre-crop for Rafeeq):
  //   Hurrier: pre-cropped by camera/file handler — pass as-is (avoid double-crop)
  //   Rafeeq:  crop to top 70% full width — removes items list at bottom; 70% (not 55%)
  //            gives enough margin for bills with longer headers before the phone line
  //   Others:  no crop
  let ocrImage = imageData
  if      (partner === 'rafeeq')   ocrImage = await cropRightColumn(imageData, 0, 0.70)
  else if (partner === 'snoonu')   ocrImage = await cropRightColumn(imageData, 0, 0.60)
  else if (partner === 'direct' || partner === 'standard')
                                   ocrImage = await cropRightColumn(imageData, 0, 0.65)
  // partner === 'hurrier': already pre-cropped by camera/file handler

  try {
    const { data } = await worker.recognize(ocrImage)
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

    // Universal phone fallback: if partner-specific extractor missed the phone,
    // scan the compact raw text for any (+974)XXXXXXXX or +974XXXXXXXX pattern.
    // Uses the (+974) prefix to avoid false positives from order numbers.
    if (!extracted.phone) {
      const compact = raw.replace(/\s+/g, '')
      const mFb = compact.match(/\(\+?974\)(\d{8,9})/) || compact.match(/\+974(\d{8,9})/)
      if (mFb) {
        const p = normalisePhone('+974' + mFb[1])
        if (p) extracted.phone = p.full
      }
    }

    return {
      customerName:    extracted.name,
      contactNumber:   extracted.phone,
      orderNumber:     findOrderNumber(raw),
      billDate:        findDate(raw),
      restaurant:      findRestaurant(raw),
      address:         '',
      deliveryPartner: partner === 'hurrier' ? 'hurrier' : findPartner(raw),
      rawText:         raw,
      confidence,
    }
  } catch (e) {
    console.error('OCR error:', e)
    return { customerName:'', contactNumber:'', orderNumber:'', billDate:'', restaurant:'', address:'', deliveryPartner:'', rawText:'', confidence:0 }
  }
}
