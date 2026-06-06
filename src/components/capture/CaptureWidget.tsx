'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Edit3, Zap, Brain, RotateCcw, CheckCircle, AlertCircle, Loader2, Maximize2, Minimize2, FlipHorizontal, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { toast } from '@/components/ui/Toast'
import { performOCR, compressImage, cropRightColumn, initTesseractWorker, type BillPartner } from '@/lib/ocr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { OCRResult } from '@/types'
import { BatchCapture } from '@/components/capture/BatchCapture'

type CaptureMode = 'camera' | 'upload' | 'manual' | 'batch'
type OCRMode = 'fast' | 'ai'
type Phase = 'idle' | 'processing' | 'review' | 'success' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────
const join = (code: string, num: string) => code.trim() + num.replace(/\D/g, '')

// Validation: country code = + then 2-4 digits, local = min 8 digits, total ≥ 12
// +974 exactly + exactly 8 digits = valid Qatar number
const valid = (code: string, num: string): boolean => {
  return code.trim() === '+974' && num.replace(/\D/g, '').length === 8
}
// For highlighting individual fields
const codeValid = (code: string) => code.trim() === '+974'
const numValid = (num: string) => num.replace(/\D/g, '').length === 8

// Parse a raw OCR phone string into { code, local }
// Handles: +97450100084, 97450100084, 07450100084 (misread +), 66915444 (8 digits)
function parseOCRPhone(raw: string): { code: string; local: string } {
  const stripped = raw.replace(/[()[\]\s\-]/g, '')
  let digits = stripped.replace(/\D/g, '')

  if (!digits) return { code: '+974', local: '' }

  // 8 digits only → Qatar local number
  if (digits.length === 8) return { code: '+974', local: digits }

  // 11 digits: +974XXXXXXXX
  if (digits.length === 11) {
    // Fix OCR misread of '+' sign: +97450100084 read as 07450100084 or 87450100084
    // If first digit is NOT 9 but positions 2-3 are 74, the first char was misread from '9'
    if (!digits.startsWith('9') && digits.slice(1, 3) === '74') {
      digits = '9' + digits.slice(1) // restore the misread '9'
    }
    if (digits.startsWith('974')) {
      return { code: '+974', local: digits.slice(3) }
    }
    // Other 11-digit international: last 8 = local, first 3 = code
    return { code: '+' + digits.slice(0, 3), local: digits.slice(3) }
  }

  // 10 digits starting with 974 (e.g. 9741234567 — unusual but handle)
  if (digits.startsWith('974') && digits.length >= 11) {
    return { code: '+974', local: digits.slice(3) }
  }

  // 9 digits → treat as Qatar local (some numbers have 9 digits)
  if (digits.length === 9) return { code: '+974', local: digits }

  // Generic: last 8 digits = local, rest = code
  if (digits.length >= 9 && digits.length <= 15) {
    const local = digits.slice(-8)
    const codeD = digits.slice(0, digits.length - 8)
    if (codeD.length >= 1 && codeD.length <= 4) {
      return { code: '+' + codeD, local }
    }
  }

  return { code: '+974', local: digits.slice(-8) }
}

// ── Shared UI components ───────────────────────────────────────────────────────

// Read-only name display (no input = no auto-fill conflict)
function NameField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        Customer Name
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Customer name"
          autoComplete="off"
          className={`w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${value ? 'pr-8' : ''}`}
        />
        {value && (
          <button type="button" onClick={() => { onChange(''); setTimeout(() => { (document.getElementById(id || '') as HTMLInputElement)?.focus() }, 0) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 dark:bg-gray-500 hover:bg-red-400 dark:hover:bg-red-500 transition-colors">
            <X className="h-3 w-3 text-white" />
          </button>
        )}
      </div>
    </div>
  )
}

// Editable phone input with per-field red highlighting
// Code box: red if not +974 | Number box: red if not exactly 8 digits
function PhoneInput({ code, num, onCode, onNum, autoFocus, numId }: {
  code: string; num: string
  onCode: (v: string) => void; onNum: (v: string) => void
  autoFocus?: boolean; numId?: string
}) {
  const digits = num.replace(/\D/g, '')
  const codeOk = codeValid(code)
  const nOk = numValid(num)
  const full = join(code, num)
  const showCodeErr = code.trim() !== '' && !codeOk
  const showNumErr = digits.length > 0 && !nOk

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        Contact Number <span className="text-red-500">*</span>
        <span className="text-gray-400 font-normal ml-1">(+974 · 8 digits)</span>
      </label>
      <div className="flex rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600 focus-within:ring-2 focus-within:ring-blue-500">
        {/* Country code box — red ring if not +974 */}
        <input
          value={code}
          onChange={e => onCode(e.target.value)}
          autoComplete="off"
          className={`w-[72px] shrink-0 px-2 py-3 text-center text-sm font-mono font-bold border-r focus:outline-none transition-colors
            ${showCodeErr
              ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-r-red-400'
              : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-r-gray-300 dark:border-r-gray-600'}`}
          placeholder="+974"
        />
        {/* Number box — red text if not 8 digits */}
        <input
          id={numId}
          type="tel"
          value={num}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={e => onNum(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="41105663"
          className={`flex-1 px-3 py-3 text-base font-mono focus:outline-none transition-colors
            ${showNumErr
              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'}`}
        />
      </div>
      {/* Error hints */}
      {showCodeErr && <p className="text-xs text-red-500 mt-1">Country code must be +974</p>}
      {showNumErr && <p className="text-xs text-red-500 mt-1">Must be exactly 8 digits (currently {digits.length})</p>}
      {!showCodeErr && !showNumErr && digits.length === 8 && (
        <p className="text-xs text-gray-400 mt-1">Full: {full}</p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
const empty = { code: '+974', num: '', name: '' }

export function CaptureWidget() {
  const { user } = useAuth()
  const [mode, setMode] = useState<CaptureMode>('camera')
  const [ocrMode, setOcrMode] = useState<OCRMode>('fast')
  const [phase, setPhase] = useState<Phase>('idle')
  const [ocr, setOcr] = useState<OCRResult | null>(null)
  const [errMsg, setErrMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(empty)
  const [camActive, setCamActive] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [fullscreen, setFullscreen] = useState(false)
  const [isDup, setIsDup] = useState(false)
  // Derived: is the current form valid to save? (computed eagerly for effects)
  const canSave = valid(form.code, form.num)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const wasFull = useRef(false)
  // Partner selection — drives specific OCR extractor + crop strategy
  const [partner, setPartner] = useState<BillPartner>('standard')
  // Auto-capture
  const [autoCapture, setAutoCapture] = useState(false)
  const [autoStatus, setAutoStatus] = useState<'waiting'|'scanning'>('waiting')
  const autoLock = useRef(false)
  // Smart focus refs (used via element IDs)
  const saveRefNormal = useRef<HTMLButtonElement>(null)
  const saveRefFull = useRef<HTMLButtonElement>(null)

  useEffect(() => { initTesseractWorker() }, [])

  const startCam = useCallback(async () => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop())
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = s
      if (videoRef.current) { videoRef.current.srcObject = s; setCamActive(true) }
    } catch { toast('error', 'Camera access denied') }
  }, [facing])

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null; setCamActive(false)
  }, [])

  // Pre-warm Tesseract on mount — eliminates 2-3 second cold-start when first bill scanned
  useEffect(() => { initTesseractWorker().catch(() => {}) }, [])

  // Smart focus: when phase becomes 'review', focus the first missing field
  // or the Save button if everything is valid. form is already set by this point.
  useEffect(() => {
    if (phase !== 'review') return
    const t = setTimeout(() => {
      if (!form.name.trim()) {
        (document.getElementById('rv-name') as HTMLInputElement)?.focus()
      } else if (!numValid(form.num)) {
        (document.getElementById('rv-num') as HTMLInputElement)?.focus()
      } else {
        (document.getElementById('rv-save') as HTMLButtonElement)?.focus()
      }
    }, 150)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    if (mode === 'camera' && phase === 'idle' && !fullscreen) startCam()
    else stopCam()
    return () => stopCam()
  }, [mode, phase, fullscreen, startCam, stopCam])

  useEffect(() => {
    if (fullscreen && mode === 'camera' && phase === 'idle') startCam()
  }, [fullscreen, mode, phase, startCam])

  const reset = useCallback((restoreFs = false) => {
    setPhase('idle'); setOcr(null); setErrMsg('')
    setForm(empty); setSaving(false); setIsDup(false)
    if (restoreFs) setTimeout(() => setFullscreen(true), 150)
  }, [])

  const save = useCallback(async (f: typeof empty, result?: OCRResult) => {
    const contact = join(f.code, f.num)
    if (!f.num || !valid(f.code, f.num)) { toast('error', 'Valid contact number required'); return }
    if (!user?.id) { toast('error', 'Not logged in'); return }
    setSaving(true)
    try {
      const { count } = await supabase.from('bill_records')
        .select('id', { count: 'exact', head: true }).eq('contact_number', contact)
      setIsDup((count ?? 0) > 0)

      const { error } = await supabase.from('bill_records').insert({
        user_id: user.id,
        contact_number: contact,
        customer_name: f.name.trim() || null,
        order_number: result?.orderNumber?.trim() || null,
        bill_date: result?.billDate?.trim() || null,
        restaurant: result?.restaurant?.trim() || null,
        raw_text: result?.rawText?.slice(0, 2000) || '',
        ocr_confidence: result?.confidence || 0,
        delivery_partner: result?.deliveryPartner || null,
        source: mode === 'manual' ? 'manual' : mode,
        ocr_mode: mode === 'manual' ? 'manual' : ocrMode,
        status: 'success',
      })
      if (error) throw new Error(error.message || error.code)

      supabase.from('scan_logs').insert({
        user_id: user.id, status: 'success',
        ocr_mode: mode === 'manual' ? 'manual' : ocrMode,
        source: mode, ocr_confidence: result?.confidence || 0,
      })

      setPhase('success')
      const restoreFs = wasFull.current && mode === 'camera'
      setTimeout(() => reset(restoreFs), 2000)
    } catch (e: any) {
      toast('error', `Save failed: ${e?.message || 'Please try again'}`)
      setPhase(mode === 'manual' ? 'idle' : 'review')
    } finally { setSaving(false) }
  }, [user, mode, ocrMode, reset])

  const runOCR = useCallback(async (imageData: string) => {
    setPhase('processing')
    try {
      const result = await performOCR(imageData, ocrMode)
      setOcr(result)
      // Parse phone — handles OCR misreads of + sign
      const { code, local } = parseOCRPhone(result.contactNumber || '')
      // Clear Arabic/garbled names:
      // 1. Name must be Latin-only characters
      // 2. If the raw OCR text near "customer" contains Arabic Unicode → clear
      //    (handles case where name OCRs as garbage but nearby "العميل" preserves Arabic)
      const extractedName = result.customerName || ''
      // Trust findName() in ocr.ts — it already handles Arabic detection correctly.
      // DON'T scan nearby raw text for Arabic: العميل appears after ALL Snoonu names
      // (both Arabic and English), so that check would clear ALL English names too.
      const isLatinOnly = (s: string) => /^[a-zA-Z][a-zA-Z\s\-''.]*$/.test(s.trim())
      const cleanName = isLatinOnly(extractedName) ? extractedName : ''
      const f = { code, num: local, name: cleanName }
      setForm(f)
      if (!local || !valid(code, local)) {
        setErrMsg('Contact number not detected — enter manually or retake.')
        setPhase('error')
      } else {
        setPhase('review')
        // No auto-save — user must press Save
      }
    } catch {
      setErrMsg('OCR failed — retake or enter manually.')
      setPhase('error')
    }
  }, [ocrMode])

  const capture = useCallback(() => {
    if (!videoRef.current || !camActive) return
    wasFull.current = fullscreen
    const vid = videoRef.current
    const srcW = vid.videoWidth, srcH = vid.videoHeight
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    if (partner === 'hurrier') {
      // Hurrier two-column layout: left 40% = big order number, right 60% = name+TEL
      // Crop to RIGHT 60% × TOP 50% — gives Tesseract a clean single-column view
      // Without the large #XXXX order number that confuses Tesseract's layout detection
      const cropX = Math.round(srcW * 0.40)
      const cropW = srcW - cropX
      const cropH = Math.round(srcH * 0.50)
      c.width = cropW; c.height = cropH
      ctx.filter = 'contrast(1.5) grayscale(1) brightness(1.1)'
      ctx.drawImage(vid, cropX, 0, cropW, cropH, 0, 0, cropW, cropH)
    } else {
      c.width = srcW; c.height = srcH
      ctx.drawImage(vid, 0, 0)
    }
    setFullscreen(false); stopCam()
    runOCR(c.toDataURL('image/jpeg', 0.9))
  }, [camActive, fullscreen, partner, stopCam, runOCR])

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    try { await runOCR(await compressImage(file, partner === 'hurrier' ? 0.60 : 1.0, partner === 'hurrier' ? 0.40 : 0)) }
    catch { toast('error', 'Failed to read image') }
    if (fileRef.current) fileRef.current.value = ''
  }, [runOCR, partner])

  // Enter key in name/number inputs → save if valid
  useEffect(() => {
    if (phase !== 'review') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' && canSave) { e.preventDefault(); save(form, ocr || undefined) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, canSave, form, ocr, save])

  // Auto-capture: scan live camera frame every ~3s; auto-trigger when phone detected
  useEffect(() => {
    if (!autoCapture || phase !== 'idle' || !camActive) return
    const interval = setInterval(async () => {
      if (autoLock.current || !videoRef.current || videoRef.current.videoWidth === 0) return
      autoLock.current = true; setAutoStatus('scanning')
      try {
        const vid = videoRef.current
        const canvas = document.createElement('canvas')
        // Use 60% scale for quick scan (smaller = faster OCR)
        canvas.width = Math.round(vid.videoWidth * 0.6)
        canvas.height = Math.round(vid.videoHeight * 0.6)
        const ctx = canvas.getContext('2d')!
        ctx.filter = 'contrast(1.3) grayscale(1)'
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
        const img = canvas.toDataURL('image/jpeg', 0.82)
        const result = await performOCR(img, 'fast', partner)
        const { code, local } = parseOCRPhone(result.contactNumber || '')
        if (codeValid(code) && numValid(local)) {
          // Valid phone found → auto-capture full quality
          clearInterval(interval)
          setAutoStatus('waiting')
          capture()
        }
      } catch { /* ignore scan errors */ }
      finally { autoLock.current = false; setAutoStatus('waiting') }
    }, 3000)
    return () => { clearInterval(interval); setAutoStatus('waiting'); autoLock.current = false }
  }, [autoCapture, phase, camActive, capture, partner])

  const retake = () => {
    // If user was in fullscreen before capture, go straight back to fullscreen
    if (wasFull.current) {
      setPhase('idle'); setOcr(null); setErrMsg('')
      setForm(empty); setSaving(false); setIsDup(false)
      setFullscreen(true)  // Restore fullscreen immediately (no flash)
    } else {
      reset()
      if (mode === 'camera') startCam()
    }
  }

  // ── FULLSCREEN ─────────────────────────────────────────────────────────────
  if (fullscreen && mode === 'camera') return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

      {/* Scan guide */}
      {phase === 'idle' && (
        <div className="absolute inset-x-6 top-[20%] bottom-[20%] border-2 border-white/50 rounded-2xl pointer-events-none">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400 scanner-line" />
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
          className="bg-black/60 p-3 rounded-full text-white"><FlipHorizontal className="h-5 w-5" /></button>
        <button onClick={() => { setFullscreen(false); wasFull.current = false }}
          className="bg-black/60 p-3 rounded-full text-white"><Minimize2 className="h-5 w-5" /></button>
      </div>

      {/* Top-left toggles: Hurrier mode + Auto-capture */}
      {phase === 'idle' && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          {/* Partner quick-select in fullscreen */}
          <div className="flex flex-col gap-1">
            {(['snoonu','rafeeq','hurrier','direct','standard'] as BillPartner[]).map(p => (
              <button key={p} onClick={() => setPartner(p)}
                className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all text-left ${partner===p ? 'bg-white text-gray-900' : 'bg-black/50 text-gray-300'}`}>
                {p==='snoonu'?'🟢':p==='rafeeq'?'🔵':p==='hurrier'?'🚚':p==='direct'?'🏪':'⭐'} {p.charAt(0).toUpperCase()+p.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => setAutoCapture(a => !a)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all ${autoCapture ? 'bg-green-500 text-white' : 'bg-black/60 text-gray-300'}`}>
            <span className={`w-2 h-2 rounded-full ${autoCapture ? 'bg-white animate-pulse' : 'bg-gray-500'}`} />
            {autoCapture ? (autoStatus === 'scanning' ? '🔍 Scanning...' : '⚡ Auto ON') : '⚡ Auto OFF'}
          </button>
        </div>
      )}

      {/* Processing */}
      {phase === 'processing' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-blue-900" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-white font-semibold text-lg">Reading bill...</p>
        </div>
      )}

      {/* Success */}
      {phase === 'success' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 z-10">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-400" />
          </div>
          <p className="text-white font-bold text-2xl">Saved!</p>
          {isDup && <span className="text-xs text-amber-400 bg-amber-900/30 px-3 py-1 rounded-full">⚠️ Duplicate</span>}
          <p className="text-gray-300 font-mono text-sm">{join(form.code, form.num)}</p>
          <p className="text-gray-500 text-xs mt-1">Restarting camera...</p>
        </div>
      )}

      {/* Review / Error — ONLY name display + contact input — NO Order Number */}
      {(phase === 'review' || phase === 'error') && (
        <div className="absolute inset-0 bg-black/90 z-10 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-10">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                {phase === 'error'
                  ? <AlertCircle className="h-5 w-5 text-red-400" />
                  : <CheckCircle className="h-5 w-5 text-green-400" />}
                <span className="text-white font-semibold">
                  {phase === 'error' ? 'Not detected — enter manually' : 'Review & Save'}
                </span>
              </div>
              {phase === 'error' && <p className="text-gray-500 text-xs">{errMsg}</p>}

              {/* Customer Name: editable input */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Customer Name</label>
                <div className="relative">
                  <input
                    id="rv-name"
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Customer name"
                    autoComplete="off"
                    className={`w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${form.name ? 'pr-7' : ''}`}
                  />
                  {form.name && (
                    <button type="button" onClick={() => { setForm(f => ({ ...f, name: '' })); setTimeout(() => { (document.getElementById('rv-name') as HTMLInputElement)?.focus() }, 0) }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-500 hover:bg-red-500 transition-colors">
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
              </div>

              {/* Contact Number: editable */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Contact Number <span className="text-red-400">*</span>
                </label>
                <div className={`flex rounded-xl overflow-hidden border ${canSave ? 'border-gray-600' : 'border-red-600'} focus-within:border-blue-500`}>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    autoComplete="off"
                    className="w-[72px] px-2 py-2.5 text-center text-sm font-mono font-bold bg-gray-700 text-white border-r border-gray-600 focus:outline-none" />
                  <input id="rv-num" type="tel" value={form.num} autoFocus={phase === 'error'}
                    autoComplete="off"
                    onChange={e => setForm(f => ({ ...f, num: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    placeholder="41105663"
                    className="flex-1 px-3 py-2.5 text-base font-mono bg-gray-800 text-white focus:outline-none" />
                </div>
                {form.num && (
                  <p className={`text-xs mt-1 ${canSave ? 'text-gray-500' : 'text-red-400'}`}>
                    {canSave ? `Full: ${join(form.code, form.num)}` : `Min 8 digits required (${form.num.length} entered)`}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => {
                  // Stay in fullscreen — only reset state; camera restarts via useEffect
                  setPhase('idle'); setOcr(null); setErrMsg('')
                  setForm(empty); setSaving(false); setIsDup(false)
                }}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5">
                  <RotateCcw className="h-4 w-4" /> Retake
                </button>
                <button id="rv-save" ref={saveRefFull} onClick={() => save(form, ocr || undefined)} disabled={!canSave || saving}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 ${canSave && !saving ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capture button */}
      {phase === 'idle' && (
        <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/70 z-10">
          <button onClick={capture} disabled={!camActive}
            className="w-full bg-blue-600 disabled:bg-gray-700 text-white py-4 rounded-2xl text-lg font-semibold active:scale-95 transition-all">
            📷 Capture Bill
          </button>
        </div>
      )}
    </div>
  )

  // ── NORMAL VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {(['camera', 'upload', 'manual', 'batch'] as CaptureMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); reset() }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {m === 'camera' ? '📷' : m === 'upload' ? '📁' : m === 'batch' ? '📦 Batch' : '✏️'}
            {m !== 'batch' && <span className="hidden sm:inline ml-1">{m === 'camera' ? 'Camera' : m === 'upload' ? 'Upload' : 'Entry'}</span>}
          </button>
        ))}
      </div>

      {/* Partner selector + OCR mode */}
      {mode !== 'manual' && mode !== 'batch' && (
        <div className="space-y-2 mb-4">
          {/* Partner pills */}
          <div className="flex gap-1.5 flex-wrap">
            {([['standard','⭐','Standard','bg-gray-600'], ['snoonu','🟢','Snoonu','bg-green-600'], ['rafeeq','🔵','Rafeeq','bg-blue-600'], ['hurrier','🚚','Hurrier','bg-orange-500'], ['direct','🏪','Direct','bg-purple-600']] as [BillPartner,string,string,string][]).map(([p,emoji,label,color]) => (
              <button key={p} onClick={() => setPartner(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${partner === p ? `${color} text-white shadow-sm` : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                {emoji} {label}
              </button>
            ))}
          </div>
          {/* OCR mode */}
          <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              {partner === 'hurrier' ? '🚚 Hurrier: right-column crop (name+TEL only)' : partner !== 'standard' ? `⚡ ${partner.charAt(0).toUpperCase()+partner.slice(1)}-optimised extraction` : '⭐ Standard: auto-detect all formats'}
            </span>
            <button onClick={() => setOcrMode(m => m === 'fast' ? 'ai' : 'fast')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${ocrMode === 'ai' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
              {ocrMode === 'ai' ? <><Brain className="h-3 w-3" />AI</> : <><Zap className="h-3 w-3" />Fast</>}
            </button>
          </div>
        </div>
      )}

      {/* CAMERA IDLE */}
      {mode === 'camera' && phase === 'idle' && (
        <Card><CardContent className="p-0 overflow-hidden rounded-xl">
          <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!camActive && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white"><div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" /><p className="text-sm">Starting camera...</p></div></div>}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-3/4 border-2 border-white/40 rounded-xl border-dashed">
                <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400/80 scanner-line" />
              </div>
            </div>
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')} className="bg-black/60 p-2 rounded-full text-white"><FlipHorizontal className="h-4 w-4" /></button>
              <button onClick={() => { wasFull.current = true; setFullscreen(true) }} className="bg-black/60 p-2 rounded-full text-white"><Maximize2 className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="p-4 space-y-2">
            <Button onClick={capture} className="w-full" size="lg" disabled={!camActive}><Camera className="h-5 w-5" />Capture Bill</Button>
            <div className="flex gap-2">
              <button onClick={() => { wasFull.current = true; setFullscreen(true) }} className="flex-1 py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1"><Maximize2 className="h-3 w-3" />Fullscreen</button>
              <button onClick={() => setAutoCapture(a => !a)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${autoCapture ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${autoCapture ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                {autoCapture ? (autoStatus === 'scanning' ? 'Scanning...' : 'Auto ON') : 'Auto'}
              </button>
            </div>
          </div>
        </CardContent></Card>
      )}

      {/* UPLOAD IDLE */}
      {mode === 'upload' && phase === 'idle' && (
        <Card><CardContent>
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full"><Upload className="h-7 w-7 text-blue-500" /></div>
            <div className="text-center"><p className="font-semibold text-gray-900 dark:text-white">Tap to upload bill</p><p className="text-xs text-gray-500 mt-1">JPG, PNG — auto-compressed</p></div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        </CardContent></Card>
      )}

      {/* PROCESSING */}
      {phase === 'processing' && (
        <Card><CardContent className="py-14 flex flex-col items-center gap-4">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900/30" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              {ocrMode === 'ai' ? <Brain className="h-7 w-7 text-blue-600" /> : <Zap className="h-7 w-7 text-blue-600" />}
            </div>
          </div>
          <div className="text-center"><p className="font-semibold text-gray-900 dark:text-white text-lg">Reading Bill...</p><p className="text-sm text-gray-500">{partner === 'hurrier' ? 'AI Vision — Hurrier' : ocrMode === 'ai' ? 'AI enhanced' : 'Fast scan'}</p></div>
        </CardContent></Card>
      )}

      {/* REVIEW — verify contact number prominently before saving */}
      {phase === 'review' && (
        <Card><CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" /><span className="font-semibold text-sm text-gray-900 dark:text-white">Verify & Save</span></div>
            {saving && <span className="text-xs text-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving...</span>}
          </div>

          {/* Compact number verification — inline banner */}
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg mb-3">
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">⚠️ Check name &amp; number:</span>
            <span className="text-base font-mono font-bold text-blue-800 dark:text-blue-200 flex-1 truncate">
              {form.code}{form.num || '—'}
            </span>
          </div>

          <div className="space-y-3">
            <NameField id="rv-name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <PhoneInput numId="rv-num" code={form.code} num={form.num} onCode={v => setForm(f => ({ ...f, code: v }))} onNum={v => setForm(f => ({ ...f, num: v }))} />
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={retake} className="flex-1" disabled={saving}><RotateCcw className="h-4 w-4" />Retake</Button>
            <Button id="rv-save" ref={saveRefNormal} onClick={() => save(form, ocr || undefined)} loading={saving} disabled={!canSave} className="flex-1">Save Record</Button>
          </div>
        </CardContent></Card>
      )}

      {/* SUCCESS */}
      {phase === 'success' && (
        <Card><CardContent className="py-10 flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"><CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" /></div>
          <div>
            <p className="font-bold text-2xl text-gray-900 dark:text-white">Saved!</p>
            {isDup && <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠️ Duplicate contact</span>}
            <p className="text-gray-500 text-sm mt-2">Next scan starting...</p>
          </div>
          <p className="font-mono text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg">{join(form.code, form.num)}</p>
        </CardContent></Card>
      )}

      {/* ERROR — only Name (read-only) + Contact — NO BILL NUMBER */}
      {phase === 'error' && (
        <Card><CardContent className="py-6 flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"><AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" /></div>
          <div className="text-center"><p className="font-bold text-gray-900 dark:text-white">OCR Failed</p><p className="text-sm text-gray-500">{errMsg}</p></div>
          <div className="w-full space-y-3">
            <NameField value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <PhoneInput code={form.code} num={form.num} onCode={v => setForm(f => ({ ...f, code: v }))} onNum={v => setForm(f => ({ ...f, num: v }))} autoFocus />
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={retake} className="flex-1"><RotateCcw className="h-4 w-4" />Retake</Button>
            <Button onClick={() => save(form, ocr || undefined)} loading={saving} disabled={!canSave} className="flex-1">Save</Button>
          </div>
        </CardContent></Card>
      )}

      {/* MANUAL ENTRY — Contact + editable Customer Name — NO BILL NUMBER */}
      {mode === 'manual' && phase === 'idle' && (
        <Card><CardContent>
          <div className="flex items-center gap-2 mb-5"><Edit3 className="h-5 w-5 text-blue-500" /><span className="font-semibold text-gray-900 dark:text-white">Quick Entry</span></div>
          <div className="space-y-4">
            <PhoneInput code={form.code} num={form.num} onCode={v => setForm(f => ({ ...f, code: v }))} onNum={v => setForm(f => ({ ...f, num: v }))} autoFocus />
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Customer name" autoComplete="off"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <Button onClick={() => save(form)} loading={saving} disabled={!canSave} className="w-full mt-5">Save Record</Button>
          {!canSave && form.num && <p className="text-xs text-center text-red-500 mt-2">Enter at least 8 digits after country code</p>}
        </CardContent></Card>
      )}
      {/* BATCH MODE */}
      {mode === 'batch' && <BatchCapture />}
    </div>
  )
}
