'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Edit3, Zap, Brain, RotateCcw, CheckCircle, AlertCircle, Loader2, Maximize2, Minimize2, FlipHorizontal, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { toast } from '@/components/ui/Toast'
import { performOCR, compressImage, validateContactNumber, initTesseractWorker } from '@/lib/ocr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { OCRResult } from '@/types'

type CaptureMode = 'camera' | 'upload' | 'manual'
type OCRMode = 'fast' | 'ai'
type Phase = 'idle' | 'processing' | 'review' | 'success' | 'error'

const emptyForm = { code: '+94', number: '', name: '', billNo: '' }
const fullContact = (code: string, num: string) => code.trim() + num.replace(/\D/g, '')
const isValid = (code: string, num: string) => {
  const full = fullContact(code, num)
  return full.length >= 9 && /^\+\d{9,15}$/.test(full)
}

// Phone input: editable country code + number
function PhoneInput({ code, number, onCode, onNum, autoFocus }: {
  code: string; number: string
  onCode: (v: string) => void; onNum: (v: string) => void
  autoFocus?: boolean
}) {
  const valid = !number || isValid(code, number)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Contact Number <span className="text-red-500">*</span>
      </label>
      <div className={`flex rounded-xl overflow-hidden border transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${!valid && number ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}>
        <input
          value={code}
          onChange={e => onCode(e.target.value)}
          className="w-16 shrink-0 px-2 py-3 text-center text-sm font-mono font-bold bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-r border-gray-300 dark:border-gray-600 focus:outline-none"
          placeholder="+94"
        />
        <input
          type="tel"
          value={number}
          autoFocus={autoFocus}
          onChange={e => onNum(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="41105663"
          className="flex-1 px-3 py-3 text-base font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
        />
      </div>
      {number && (
        <p className={`text-xs mt-1 ${valid ? 'text-gray-400' : 'text-red-500'}`}>
          {valid ? `Full number: ${fullContact(code, number)}` : 'Invalid number format'}
        </p>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}

export function CaptureWidget() {
  const { user } = useAuth()
  const [mode, setMode] = useState<CaptureMode>('camera')
  const [ocrMode, setOcrMode] = useState<OCRMode>('fast')
  const [phase, setPhase] = useState<Phase>('idle')
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [cameraActive, setCameraActive] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [fullscreen, setFullscreen] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wasFullscreen = useRef(false)

  useEffect(() => { initTesseractWorker() }, [])

  const startCamera = useCallback(async () => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; setCameraActive(true) }
    } catch { toast('error', 'Camera access denied') }
  }, [facing])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null; setCameraActive(false)
  }, [])

  // Camera lifecycle
  useEffect(() => {
    const needCamera = mode === 'camera' && phase === 'idle'
    if (needCamera) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, phase, startCamera, stopCamera])

  // Also start camera when entering fullscreen
  useEffect(() => {
    if (fullscreen && mode === 'camera' && phase === 'idle') startCamera()
  }, [fullscreen, mode, phase, startCamera])

  const resetAll = useCallback((restoreFullscreen = false) => {
    setPhase('idle'); setOcrResult(null); setErrorMsg('')
    setForm(emptyForm); setSaving(false); setIsDuplicate(false)
    if (restoreFullscreen) setTimeout(() => setFullscreen(true), 150)
  }, [])

  // Core save function - simplified, no FK joins
  const doSave = useCallback(async (f: typeof emptyForm, result?: OCRResult) => {
    const contact = fullContact(f.code, f.number)
    if (!f.number || !isValid(f.code, f.number)) {
      toast('error', 'Enter a valid contact number first'); return
    }
    if (!user?.id) { toast('error', 'Not logged in'); return }

    setSaving(true)
    try {
      // Check duplicate
      const { count } = await supabase
        .from('bill_records')
        .select('id', { count: 'exact', head: true })
        .eq('contact_number', contact)
      setIsDuplicate((count ?? 0) > 0)

      // INSERT — no .select().single() to avoid extra RLS check
      const { error: insertError } = await supabase
        .from('bill_records')
        .insert({
          user_id: user.id,
          contact_number: contact,
          customer_name: f.name.trim() || null,
          bill_number: f.billNo.trim() || null,
          raw_text: result?.rawText?.slice(0, 2000) || '',
          ocr_confidence: result?.confidence || 0,
          source: mode === 'manual' ? 'manual' : mode,
          ocr_mode: mode === 'manual' ? 'manual' : ocrMode,
          status: 'success',
        })

      if (insertError) {
        console.error('Insert error:', JSON.stringify(insertError))
        throw new Error(insertError.message || insertError.code || 'Insert failed')
      }

      // Log scan (fire and forget)
      supabase.from('scan_logs').insert({
        user_id: user.id,
        status: 'success',
        ocr_mode: mode === 'manual' ? 'manual' : ocrMode,
        source: mode,
        ocr_confidence: result?.confidence || 0,
      }).then(() => {})

      setPhase('success')
      const shouldRestoreFs = wasFullscreen.current && mode === 'camera'
      setTimeout(() => resetAll(shouldRestoreFs), 2000)
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Unknown error'
      console.error('Save failed:', msg)
      toast('error', `Save failed: ${msg}`)
      setPhase(mode === 'manual' ? 'idle' : 'review')
    } finally {
      setSaving(false)
    }
  }, [user, mode, ocrMode, resetAll])

  const runOCR = useCallback(async (imageData: string) => {
    setPhase('processing')
    try {
      const result = await performOCR(imageData, ocrMode)
      setOcrResult(result)
      // Parse contact number from OCR
      const raw = result.contactNumber || ''
      let code = '+94'; let num = ''
      if (raw.startsWith('+')) {
        const digits = raw.slice(1)
        // Take last 8 digits as local number, rest as country code
        if (digits.length >= 9) {
          num = digits.slice(-8)
          code = '+' + digits.slice(0, digits.length - 8)
        } else { num = digits }
      } else {
        num = raw.replace(/\D/g, '').slice(-8)
      }
      const f = { code, number: num, name: result.customerName || '', billNo: result.billNumber || '' }
      setForm(f)
      if (!num || !isValid(code, num)) {
        setErrorMsg('Contact number not found. Edit manually or retake.')
        setPhase('error')
      } else {
        setPhase('review')
        setTimeout(() => doSave(f, result), 500)
      }
    } catch (err) {
      console.error('OCR error:', err)
      setErrorMsg('OCR processing failed. Enter manually or retake.')
      setPhase('error')
    }
  }, [ocrMode, doSave])

  const capture = useCallback(() => {
    if (!videoRef.current || !cameraActive) return
    wasFullscreen.current = fullscreen
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    setFullscreen(false)
    stopCamera()
    runOCR(canvas.toDataURL('image/jpeg', 0.9))
  }, [cameraActive, fullscreen, stopCamera, runOCR])

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    try { await runOCR(await compressImage(file)) }
    catch { toast('error', 'Failed to read image') }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [runOCR])

  const retake = () => { resetAll(); if (mode === 'camera') startCamera() }
  const canSave = isValid(form.code, form.number)

  // ── FULLSCREEN CAMERA ─────────────────────────────────────
  if (fullscreen && mode === 'camera') return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Camera feed always shown in background */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />

      {/* Scan guide overlay */}
      {phase === 'idle' && (
        <div className="absolute inset-x-6 top-1/4 bottom-1/4 border-2 border-white/50 rounded-2xl pointer-events-none">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400 scanner-line" />
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
          className="bg-black/60 p-3 rounded-full text-white"><FlipHorizontal className="h-5 w-5" /></button>
        <button onClick={() => { setFullscreen(false); wasFullscreen.current = false }}
          className="bg-black/60 p-3 rounded-full text-white"><Minimize2 className="h-5 w-5" /></button>
      </div>

      {/* Processing overlay */}
      {phase === 'processing' && (
        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-4 z-10">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-blue-900/40" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-white font-semibold">Reading bill...</p>
        </div>
      )}

      {/* Success overlay */}
      {phase === 'success' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 z-10">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-400" />
          </div>
          <p className="text-white font-bold text-2xl">Saved!</p>
          {isDuplicate && <span className="text-xs text-amber-400 bg-amber-900/30 px-3 py-1 rounded-full">⚠️ Duplicate contact</span>}
          <p className="text-gray-400 text-sm font-mono">{fullContact(form.code, form.number)}</p>
          <p className="text-gray-500 text-xs">Restarting camera...</p>
        </div>
      )}

      {/* Review / Error overlay */}
      {(phase === 'review' || phase === 'error') && (
        <div className="absolute inset-0 bg-black/90 z-10 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-10">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                {phase === 'error'
                  ? <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                  : <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />}
                <span className="text-white font-semibold">
                  {phase === 'error' ? 'Not detected — enter manually' : 'Review & Save'}
                </span>
              </div>
              {phase === 'error' && <p className="text-gray-500 text-xs">{errorMsg}</p>}
              <PhoneInput code={form.code} number={form.number}
                onCode={v => setForm(f => ({ ...f, code: v }))} onNum={v => setForm(f => ({ ...f, number: v }))} autoFocus />
              <Field label="Customer Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Customer name" />
              <Field label="Bill Number" value={form.billNo} onChange={v => setForm(f => ({ ...f, billNo: v }))} placeholder="Bill #" />
              <div className="flex gap-2 pt-1">
                <button onClick={() => { wasFullscreen.current = true; resetAll(true) }}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors">
                  <RotateCcw className="h-4 w-4" /> Retake
                </button>
                <button onClick={() => doSave(form, ocrResult || undefined)} disabled={!canSave || saving}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${canSave && !saving ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
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
          <button onClick={capture} disabled={!cameraActive}
            className="w-full bg-blue-600 disabled:bg-gray-700 text-white py-4 rounded-2xl text-lg font-semibold active:scale-95 transition-all">
            📷 Capture Bill
          </button>
        </div>
      )}
    </div>
  )

  // ── NORMAL VIEW ────────────────────────────────────────────
  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {(['camera', 'upload', 'manual'] as CaptureMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); resetAll() }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {m === 'camera' ? '📷 Camera' : m === 'upload' ? '📁 Upload' : '✏️ Entry'}
          </button>
        ))}
      </div>

      {/* OCR mode toggle */}
      {mode !== 'manual' && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-700">
          <Zap className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">OCR Mode</span>
          <button onClick={() => setOcrMode(m => m === 'fast' ? 'ai' : 'fast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${ocrMode === 'ai' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
            {ocrMode === 'ai' ? <><Brain className="h-3.5 w-3.5" />AI Enhanced</> : <><Zap className="h-3.5 w-3.5" />Fast</>}
          </button>
        </div>
      )}

      {/* CAMERA IDLE */}
      {mode === 'camera' && phase === 'idle' && (
        <Card><CardContent className="p-0 overflow-hidden rounded-xl">
          <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">
                <div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" /><p className="text-sm">Starting camera...</p></div>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-3/4 border-2 border-white/40 rounded-xl border-dashed">
                <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400/80 scanner-line" />
              </div>
            </div>
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')} className="bg-black/60 p-2 rounded-full text-white"><FlipHorizontal className="h-4 w-4" /></button>
              <button onClick={() => { wasFullscreen.current = true; setFullscreen(true) }} className="bg-black/60 p-2 rounded-full text-white"><Maximize2 className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="p-4 space-y-2">
            <Button onClick={capture} className="w-full" size="lg" disabled={!cameraActive}><Camera className="h-5 w-5" />Capture Bill</Button>
            <button onClick={() => { wasFullscreen.current = true; setFullscreen(true) }} className="w-full py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1">
              <Maximize2 className="h-3 w-3" />Open Fullscreen
            </button>
          </div>
        </CardContent></Card>
      )}

      {/* UPLOAD IDLE */}
      {mode === 'upload' && phase === 'idle' && (
        <Card><CardContent>
          <div onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full"><Upload className="h-7 w-7 text-blue-500" /></div>
            <div className="text-center"><p className="font-semibold text-gray-900 dark:text-white">Tap to upload bill</p><p className="text-xs text-gray-500 mt-1">JPG, PNG — auto-compressed</p></div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
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
          <div className="text-center"><p className="font-semibold text-gray-900 dark:text-white text-lg">Reading Bill...</p><p className="text-sm text-gray-500">{ocrMode === 'ai' ? 'AI enhanced' : 'Fast scan'}</p></div>
        </CardContent></Card>
      )}

      {/* REVIEW */}
      {phase === 'review' && (
        <Card><CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /><span className="font-semibold text-gray-900 dark:text-white">Review & Save</span></div>
            {saving && <div className="flex items-center gap-1 text-xs text-blue-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</div>}
          </div>
          <div className="space-y-3">
            <PhoneInput code={form.code} number={form.number} onCode={v => setForm(f => ({ ...f, code: v }))} onNum={v => setForm(f => ({ ...f, number: v }))} />
            <Field label="Customer Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Customer name" />
            <Field label="Bill Number" value={form.billNo} onChange={v => setForm(f => ({ ...f, billNo: v }))} placeholder="Bill #" />
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={retake} className="flex-1" disabled={saving}><RotateCcw className="h-4 w-4" />Retake</Button>
            <Button onClick={() => doSave(form, ocrResult || undefined)} loading={saving} disabled={!canSave} className="flex-1">Save</Button>
          </div>
        </CardContent></Card>
      )}

      {/* SUCCESS */}
      {phase === 'success' && (
        <Card><CardContent className="py-10 flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"><CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" /></div>
          <div>
            <p className="font-bold text-2xl text-gray-900 dark:text-white">Saved!</p>
            {isDuplicate && <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠️ Duplicate contact</span>}
            <p className="text-gray-500 text-sm mt-2">Next scan starting...</p>
          </div>
          <p className="font-mono text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg">{fullContact(form.code, form.number)}</p>
        </CardContent></Card>
      )}

      {/* ERROR */}
      {phase === 'error' && (
        <Card><CardContent className="py-6 flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"><AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" /></div>
          <div className="text-center"><p className="font-bold text-gray-900 dark:text-white">OCR Failed</p><p className="text-sm text-gray-500">{errorMsg}</p></div>
          <div className="w-full space-y-3">
            <PhoneInput code={form.code} number={form.number} onCode={v => setForm(f => ({ ...f, code: v }))} onNum={v => setForm(f => ({ ...f, number: v }))} autoFocus />
            <Field label="Customer Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Customer name" />
            <Field label="Bill Number" value={form.billNo} onChange={v => setForm(f => ({ ...f, billNo: v }))} placeholder="Bill #" />
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={retake} className="flex-1"><RotateCcw className="h-4 w-4" />Retake</Button>
            <Button onClick={() => doSave(form, ocrResult || undefined)} loading={saving} disabled={!canSave} className="flex-1">Save</Button>
          </div>
        </CardContent></Card>
      )}

      {/* MANUAL ENTRY */}
      {mode === 'manual' && phase === 'idle' && (
        <Card><CardContent>
          <div className="flex items-center gap-2 mb-5"><Edit3 className="h-5 w-5 text-blue-500" /><span className="font-semibold text-gray-900 dark:text-white">Quick Entry</span></div>
          <div className="space-y-4">
            <PhoneInput code={form.code} number={form.number} onCode={v => setForm(f => ({ ...f, code: v }))} onNum={v => setForm(f => ({ ...f, number: v }))} autoFocus />
            <Field label="Customer Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Customer name" />
          </div>
          <Button onClick={() => doSave(form)} loading={saving} disabled={!canSave} className="w-full mt-5">Save Record</Button>
          {!canSave && form.number && <p className="text-xs text-center text-red-500 mt-2">Enter at least 8 digits</p>}
        </CardContent></Card>
      )}
    </div>
  )
}
