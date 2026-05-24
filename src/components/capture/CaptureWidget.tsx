'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Upload, Edit3, Zap, Brain, RotateCcw, CheckCircle, AlertCircle, Loader2, Maximize2, Minimize2, FlipHorizontal, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { toast } from '@/components/ui/Toast'
import { performOCR, compressImage, validateContactNumber, formatContactNumber, initTesseractWorker } from '@/lib/ocr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import type { OCRResult } from '@/types'

type CaptureMode = 'camera' | 'upload' | 'manual'
type OCRMode = 'fast' | 'ai'
type Phase = 'idle' | 'processing' | 'review' | 'success' | 'error'

const empty = { customerName: '', contactNumber: '', billNumber: '' }

function ContactInput({ value, onChange, autoFocus }: {
  value: string; onChange: (v: string) => void; autoFocus?: boolean
}) {
  const valid = !value || validateContactNumber(value)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Contact Number <span className="text-red-500">*</span>
        <span className="text-xs font-normal text-gray-400 ml-2">format: +94XXXXXXXX</span>
      </label>
      <input
        type="tel"
        value={value}
        autoFocus={autoFocus}
        onChange={e => {
          const raw = e.target.value
          // Auto-format as user types
          if (raw.length > 0 && !raw.startsWith('+')) {
            const fmt = formatContactNumber(raw)
            onChange(fmt || raw)
          } else {
            onChange(raw)
          }
        }}
        placeholder="+94XXXXXXXX"
        className={`w-full px-3 py-2.5 rounded-xl border font-mono text-base transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500
          ${!valid && value ? 'border-red-400 bg-red-50 dark:bg-red-900/10' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}
          text-gray-900 dark:text-white`}
      />
      {!valid && value && (
        <p className="text-xs text-red-500 mt-1">Enter a valid number (e.g. +9431194009)</p>
      )}
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
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
  const [form, setForm] = useState(empty)
  const [cameraActive, setCameraActive] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [fullscreen, setFullscreen] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (mode === 'camera' && phase === 'idle') startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, phase, startCamera, stopCamera])

  const reset = () => {
    setPhase('idle'); setOcrResult(null); setErrorMsg('')
    setForm(empty); setSaving(false); setIsDuplicate(false)
  }
  const retake = () => { reset(); if (mode === 'camera') startCamera() }

  const doSave = useCallback(async (f: typeof empty, result?: OCRResult) => {
    if (!f.contactNumber || !validateContactNumber(f.contactNumber)) {
      toast('error', 'Valid contact number required'); return
    }
    setSaving(true)
    try {
      // Check duplicate
      const { count } = await supabase.from('bill_records')
        .select('*', { count: 'exact', head: true })
        .eq('contact_number', f.contactNumber)
      const dup = (count ?? 0) > 0
      setIsDuplicate(dup)

      const { data, error } = await supabase.from('bill_records').insert({
        user_id: user!.id,
        customer_name: f.customerName || null,
        contact_number: f.contactNumber,
        bill_number: f.billNumber || null,
        raw_text: result?.rawText || '',
        ocr_confidence: result?.confidence || 0,
        source: mode === 'manual' ? 'manual' : mode,
        ocr_mode: mode === 'manual' ? 'manual' : ocrMode,
        status: 'success',
      }).select().single()

      if (error) { console.error('Insert error:', error); throw error }
      await logAudit('CREATE', 'Bill Records', `Saved bill for ${f.contactNumber}${dup ? ' [DUPLICATE]' : ''}`, { id: data.id, is_duplicate: dup })

      // Save scan log without blocking
      supabase.from('scan_logs').insert({
        user_id: user!.id, status: 'success',
        ocr_mode: mode === 'manual' ? 'manual' : ocrMode,
        source: mode, ocr_confidence: result?.confidence || 0,
      })

      setPhase('success')
      setTimeout(() => { reset(); if (mode === 'camera') startCamera() }, 2200)
    } catch (e: any) {
      console.error('Save failed:', e)
      toast('error', `Save failed: ${e?.message || 'Please try again'}`)
      setPhase(mode === 'manual' ? 'idle' : 'review')
    } finally { setSaving(false) }
  }, [user, mode, ocrMode, startCamera])

  const runOCR = async (imageData: string) => {
    setPhase('processing')
    try {
      const result = await performOCR(imageData, ocrMode)
      setOcrResult(result)
      const f = {
        customerName: result.customerName,
        contactNumber: result.contactNumber,
        billNumber: result.billNumber,
      }
      setForm(f)
      if (!result.contactNumber || !validateContactNumber(result.contactNumber)) {
        setErrorMsg('Contact number not detected. Edit manually or retake.')
        setPhase('error')
      } else {
        setPhase('review')
        // Auto-save after brief show
        setTimeout(() => doSave(f, result), 600)
      }
    } catch { setErrorMsg('OCR failed. Retake or enter manually.'); setPhase('error') }
  }

  const capture = useCallback(() => {
    if (!videoRef.current) return
    const c = document.createElement('canvas')
    c.width = videoRef.current.videoWidth; c.height = videoRef.current.videoHeight
    c.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    setFullscreen(false); stopCamera()
    runOCR(c.toDataURL('image/jpeg', 0.9))
  }, [stopCamera])

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const compressed = await compressImage(file)
      await runOCR(compressed)
    } catch { toast('error', 'Failed to process image') }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [ocrMode])

  const canSave = validateContactNumber(form.contactNumber)

  // FULLSCREEN CAMERA
  if (fullscreen && mode === 'camera' && phase === 'idle') return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <video ref={videoRef} autoPlay playsInline muted className="flex-1 w-full object-cover" />
      <div className="absolute inset-x-0 top-1/4 bottom-1/4 mx-6 border-2 border-white/40 rounded-2xl pointer-events-none">
        <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400/80 scanner-line" />
      </div>
      <div className="absolute top-4 right-4 flex gap-2">
        <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')} className="bg-black/50 backdrop-blur p-3 rounded-full text-white"><FlipHorizontal className="h-5 w-5" /></button>
        <button onClick={() => setFullscreen(false)} className="bg-black/50 backdrop-blur p-3 rounded-full text-white"><Minimize2 className="h-5 w-5" /></button>
      </div>
      <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/60">
        <button onClick={capture} className="w-full bg-blue-600 active:bg-blue-700 text-white py-4 rounded-2xl text-lg font-semibold active:scale-95 transition-all">
          📷 Capture Bill
        </button>
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Mode tabs */}
      <div className="flex gap-1.5 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {(['camera','upload','manual'] as CaptureMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); reset() }}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {m==='camera'?'📷 Camera':m==='upload'?'📁 Upload':'✏️ Quick Entry'}
          </button>
        ))}
      </div>

      {/* OCR toggle */}
      {mode !== 'manual' && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-700">
          <Zap className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">OCR Mode</span>
          <button onClick={() => setOcrMode(m => m === 'fast' ? 'ai' : 'fast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${ocrMode==='ai' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
            {ocrMode==='ai' ? <><Brain className="h-3.5 w-3.5"/>AI Enhanced</> : <><Zap className="h-3.5 w-3.5"/>Fast</>}
          </button>
        </div>
      )}

      {/* CAMERA */}
      {mode==='camera' && phase==='idle' && (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-xl">
            <div className="relative bg-black" style={{aspectRatio:'4/3'}}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!cameraActive && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white"><div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2"/><p className="text-sm">Starting camera...</p></div></div>}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-4/5 h-3/4 border-2 border-white/40 rounded-xl border-dashed">
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400/80 scanner-line"/>
                </div>
              </div>
              <div className="absolute top-3 right-3 flex gap-2">
                <button onClick={() => setFacing(f => f==='environment'?'user':'environment')} className="bg-black/50 p-2 rounded-full text-white"><FlipHorizontal className="h-4 w-4"/></button>
                <button onClick={() => setFullscreen(true)} className="bg-black/50 p-2 rounded-full text-white"><Maximize2 className="h-4 w-4"/></button>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <Button onClick={capture} className="w-full" size="lg" disabled={!cameraActive}><Camera className="h-5 w-5"/>Capture Bill</Button>
              <button onClick={() => setFullscreen(true)} className="w-full py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1"><Maximize2 className="h-3 w-3"/>Fullscreen capture</button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPLOAD */}
      {mode==='upload' && phase==='idle' && (
        <Card>
          <CardContent>
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 active:scale-98 transition-all">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full"><Upload className="h-7 w-7 text-blue-500"/></div>
              <div className="text-center">
                <p className="font-semibold text-gray-900 dark:text-white">Tap to upload bill image</p>
                <p className="text-xs text-gray-500 mt-1">JPG, PNG — auto-compressed & OCR processed</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile}/>
          </CardContent>
        </Card>
      )}

      {/* PROCESSING */}
      {phase==='processing' && (
        <Card><CardContent className="py-14 flex flex-col items-center gap-4">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900/30"/>
            <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"/>
            <div className="absolute inset-0 flex items-center justify-center">{ocrMode==='ai'?<Brain className="h-7 w-7 text-blue-600"/>:<Zap className="h-7 w-7 text-blue-600"/>}</div>
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 dark:text-white text-lg">Reading Bill...</p>
            <p className="text-sm text-gray-500 mt-1">{ocrMode==='ai'?'AI enhanced scan':'Fast scan'}</p>
          </div>
        </CardContent></Card>
      )}

      {/* REVIEW */}
      {phase==='review' && (
        <Card><CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500"/><span className="font-semibold text-gray-900 dark:text-white">Review & Save</span></div>
            {saving && <div className="flex items-center gap-1 text-xs text-blue-500"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Saving...</div>}
          </div>
          <div className="space-y-3">
            <ContactInput value={form.contactNumber} onChange={v => setForm(f => ({...f,contactNumber:v}))}/>
            <TextField label="Customer Name" value={form.customerName} onChange={v => setForm(f => ({...f,customerName:v}))} placeholder="Customer name"/>
            <TextField label="Bill Number" value={form.billNumber} onChange={v => setForm(f => ({...f,billNumber:v}))} placeholder="Bill #"/>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={retake} className="flex-1" disabled={saving}><RotateCcw className="h-4 w-4"/>Retake</Button>
            <Button onClick={() => doSave(form, ocrResult||undefined)} loading={saving} disabled={!canSave} className="flex-1">Save Record</Button>
          </div>
        </CardContent></Card>
      )}

      {/* SUCCESS */}
      {phase==='success' && (
        <Card><CardContent className="py-12 flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400"/>
          </div>
          <div>
            <p className="font-bold text-2xl text-gray-900 dark:text-white">Saved!</p>
            {isDuplicate && <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">⚠️ Duplicate contact</span>}
            <p className="text-gray-500 text-sm mt-2">Next scan starting...</p>
          </div>
          <button onClick={() => {navigator.clipboard?.writeText(form.contactNumber)}} className="flex items-center gap-1.5 font-mono text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg text-sm">
            {form.contactNumber} <Copy className="h-3.5 w-3.5"/>
          </button>
        </CardContent></Card>
      )}

      {/* ERROR */}
      {phase==='error' && (
        <Card><CardContent className="py-6 flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400"/>
          </div>
          <div className="text-center">
            <p className="font-bold text-gray-900 dark:text-white">OCR Failed to Detect</p>
            <p className="text-sm text-gray-500 mt-1">{errorMsg}</p>
          </div>
          <div className="w-full space-y-3">
            <ContactInput value={form.contactNumber} onChange={v => setForm(f => ({...f,contactNumber:v}))} autoFocus/>
            <TextField label="Customer Name" value={form.customerName} onChange={v => setForm(f => ({...f,customerName:v}))} placeholder="Customer name"/>
            <TextField label="Bill Number" value={form.billNumber} onChange={v => setForm(f => ({...f,billNumber:v}))} placeholder="Bill #"/>
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={retake} className="flex-1"><RotateCcw className="h-4 w-4"/>Retake</Button>
            <Button onClick={() => doSave(form, ocrResult||undefined)} loading={saving} disabled={!canSave} className="flex-1">Save</Button>
          </div>
        </CardContent></Card>
      )}

      {/* MANUAL ENTRY */}
      {mode==='manual' && phase==='idle' && (
        <Card><CardContent>
          <div className="flex items-center gap-2 mb-5">
            <Edit3 className="h-5 w-5 text-blue-500"/>
            <span className="font-semibold text-gray-900 dark:text-white">Quick Entry</span>
          </div>
          <div className="space-y-4">
            <ContactInput value={form.contactNumber} onChange={v => setForm(f => ({...f,contactNumber:v}))} autoFocus/>
            <TextField label="Customer Name" value={form.customerName} onChange={v => setForm(f => ({...f,customerName:v}))} placeholder="Customer name"/>
          </div>
          <Button onClick={() => doSave(form)} loading={saving} disabled={!canSave} className="w-full mt-5">
            Save Record
          </Button>
          {!canSave && form.contactNumber && (
            <p className="text-xs text-center text-red-500 mt-2">Enter a valid contact number to save</p>
          )}
        </CardContent></Card>
      )}
    </div>
  )
}

