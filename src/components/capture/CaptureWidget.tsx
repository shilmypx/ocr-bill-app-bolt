'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Upload, Edit3, Zap, Brain, RotateCcw, CheckCircle, AlertCircle, Loader2, Maximize2, Minimize2, FlipHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { toast } from '@/components/ui/Toast'
import { performOCR, compressImage, validateContactNumber, initTesseractWorker } from '@/lib/ocr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import type { OCRResult } from '@/types'

type CaptureMode = 'camera' | 'upload' | 'manual'
type OCRMode = 'fast' | 'ai'
type Phase = 'idle' | 'processing' | 'review' | 'success' | 'error'

const emptyForm = { customerName: '', contactNumber: '', billNumber: '' }

export function CaptureWidget() {
  const { user } = useAuth()
  const [mode, setMode] = useState<CaptureMode>('camera')
  const [ocrMode, setOcrMode] = useState<OCRMode>('fast')
  const [phase, setPhase] = useState<Phase>('idle')
  const [imageData, setImageData] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [cameraActive, setCameraActive] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [fullscreen, setFullscreen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoSaveRef = useRef(false)

  useEffect(() => { initTesseractWorker() }, [])

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; setCameraActive(true) }
    } catch { toast('error', 'Camera access denied') }
  }, [facing])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }, [])

  useEffect(() => {
    if (mode === 'camera' && phase === 'idle') startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, phase, startCamera, stopCamera])

  const capture = useCallback(() => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    const data = canvas.toDataURL('image/jpeg', 0.9)
    setFullscreen(false)
    stopCamera()
    setImageData(data)
    setPhase('processing')
    runOCR(data)
  }, [stopCamera])

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhase('processing')
    try {
      const compressed = await compressImage(file)
      setImageData(compressed)
      runOCR(compressed)
    } catch { toast('error', 'Failed to process image'); setPhase('idle') }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const runOCR = async (data: string) => {
    const t0 = Date.now()
    try {
      const result = await performOCR(data, ocrMode)
      const ms = Date.now() - t0
      setOcrResult(result)
      const f = { customerName: result.customerName, contactNumber: result.contactNumber, billNumber: result.billNumber }
      setForm(f)
      await supabase.from('scan_logs').insert({
        user_id: user!.id, status: result.contactNumber ? 'success' : 'failed',
        ocr_mode: ocrMode, source: mode, ocr_confidence: result.confidence,
        processing_time_ms: ms, raw_text: result.rawText,
        error_message: result.contactNumber ? null : 'No contact number extracted',
      })
      if (!result.contactNumber || !validateContactNumber(result.contactNumber)) {
        setErrorMsg('Contact number not detected. Please retake or enter manually.')
        setPhase('error')
      } else {
        autoSaveRef.current = true
        setPhase('review')
        setTimeout(() => autoSaveDirect(f, result), 500)
      }
    } catch { setErrorMsg('OCR failed. Please retake.'); setPhase('error') }
  }

  const autoSaveDirect = async (f: typeof emptyForm, result: OCRResult) => {
    if (!autoSaveRef.current) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('bill_records').insert({
        user_id: user!.id, customer_name: f.customerName || null,
        contact_number: f.contactNumber, bill_number: f.billNumber || null,
        raw_text: result.rawText, ocr_confidence: result.confidence,
        source: mode, ocr_mode: ocrMode, status: 'success',
      }).select().single()
      if (error) throw error
      await logAudit('CREATE', 'Bill Records', `Saved bill for ${f.contactNumber}`, { id: data.id })
      setPhase('success')
      setTimeout(() => { autoSaveRef.current = false; reset(); if (mode === 'camera') startCamera() }, 2000)
    } catch (e) {
      console.error('Save error:', e)
      toast('error', 'Failed to save record. Please try again.')
      setPhase('review')
    } finally { setSaving(false) }
  }

  const saveRecord = useCallback(async () => {
    if (!validateContactNumber(form.contactNumber)) { toast('error', 'Valid contact number required'); return }
    autoSaveRef.current = false
    setSaving(true)
    try {
      const { data, error } = await supabase.from('bill_records').insert({
        user_id: user!.id, customer_name: form.customerName || null,
        contact_number: form.contactNumber, bill_number: form.billNumber || null,
        raw_text: ocrResult?.rawText || '', ocr_confidence: ocrResult?.confidence || 0,
        source: mode === 'manual' ? 'manual' : mode, ocr_mode: mode === 'manual' ? 'manual' : ocrMode,
        status: 'success',
      }).select().single()
      if (error) throw error
      await logAudit('CREATE', 'Bill Records', `Saved bill for ${form.contactNumber}`, { id: data.id })
      setPhase('success')
      setTimeout(() => { reset(); if (mode === 'camera') startCamera() }, 2000)
    } catch (e) {
      console.error('Save error:', e)
      toast('error', 'Failed to save record. Please try again.')
    } finally { setSaving(false) }
  }, [form, ocrResult, mode, ocrMode, user, startCamera])

  const reset = () => { autoSaveRef.current = false; setPhase('idle'); setImageData(null); setOcrResult(null); setErrorMsg(''); setForm(emptyForm) }
  const retake = () => { reset(); if (mode === 'camera') startCamera() }
  const updateField = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    autoSaveRef.current = false; setForm(f => ({ ...f, [k]: e.target.value }))
  }

  // --- FULLSCREEN CAMERA ---
  if (fullscreen && mode === 'camera' && phase === 'idle') return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <video ref={videoRef} autoPlay playsInline muted className="flex-1 w-full object-cover" />
      <div className="absolute top-4 right-4 flex gap-2">
        <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
          className="bg-black/50 p-3 rounded-full text-white"><FlipHorizontal className="h-5 w-5" /></button>
        <button onClick={() => { setFullscreen(false) }}
          className="bg-black/50 p-3 rounded-full text-white"><Minimize2 className="h-5 w-5" /></button>
      </div>
      <div className="absolute inset-x-0 top-1/4 bottom-1/4 mx-8 border-2 border-white/40 rounded-xl pointer-events-none">
        <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400 scanner-line" />
      </div>
      <div className="absolute bottom-0 inset-x-0 p-6">
        <button onClick={capture}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl text-lg font-semibold active:scale-95 transition-transform">
          📷 Capture Bill
        </button>
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-lg mx-auto px-0 sm:px-0">
      {/* Mode tabs */}
      <div className="flex gap-1.5 mb-4">
        {(['camera', 'upload', 'manual'] as CaptureMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); reset() }}
            className={`flex-1 py-2.5 px-2 rounded-xl text-sm font-medium transition-all ${
              mode === m ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {m === 'camera' ? '📷' : m === 'upload' ? '📁' : '✏️'}
            <span className="ml-1 hidden sm:inline">{m === 'manual' ? 'Quick Entry' : m.charAt(0).toUpperCase() + m.slice(1)}</span>
            <span className="ml-1 sm:hidden">{m === 'manual' ? 'Entry' : m.charAt(0).toUpperCase() + m.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* OCR Mode toggle */}
      {mode !== 'manual' && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
          <Zap className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">OCR Mode</span>
          <button onClick={() => setOcrMode(m => m === 'fast' ? 'ai' : 'fast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              ocrMode === 'ai' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
            {ocrMode === 'ai' ? <><Brain className="h-3.5 w-3.5" /> AI Enhanced</> : <><Zap className="h-3.5 w-3.5" /> Fast</>}
          </button>
        </div>
      )}

      {/* CAMERA IDLE */}
      {mode === 'camera' && phase === 'idle' && (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-xl">
            <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                  <div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" /><p className="text-sm">Starting camera...</p></div>
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-4/5 h-3/4 border-2 border-white/40 rounded-lg border-dashed">
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-blue-400/80 scanner-line" />
                </div>
              </div>
              <div className="absolute top-3 right-3 flex gap-2">
                <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
                  className="bg-black/50 p-2 rounded-full text-white"><FlipHorizontal className="h-4 w-4" /></button>
                <button onClick={() => setFullscreen(true)}
                  className="bg-black/50 p-2 rounded-full text-white"><Maximize2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <Button onClick={capture} className="w-full" size="lg" disabled={!cameraActive}>
                <Camera className="h-5 w-5" /> Capture Bill
              </Button>
              <button onClick={() => setFullscreen(true)}
                className="w-full py-2 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1">
                <Maximize2 className="h-3.5 w-3.5" /> Open Fullscreen Camera
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPLOAD IDLE */}
      {mode === 'upload' && phase === 'idle' && (
        <Card>
          <CardContent>
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all active:scale-98">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full">
                <Upload className="h-7 w-7 text-blue-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-900 dark:text-white">Tap to upload bill</p>
                <p className="text-xs text-gray-500 mt-1">JPG, PNG — auto-compressed</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          </CardContent>
        </Card>
      )}

      {/* PROCESSING */}
      {phase === 'processing' && (
        <Card>
          <CardContent className="py-14 flex flex-col items-center gap-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900/30" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                {ocrMode === 'ai' ? <Brain className="h-7 w-7 text-blue-600" /> : <Zap className="h-7 w-7 text-blue-600" />}
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white text-lg">Reading Bill...</p>
              <p className="text-sm text-gray-500 mt-1">{ocrMode === 'ai' ? 'AI enhanced scan' : 'Fast scan — target under 1.5s'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* REVIEW */}
      {phase === 'review' && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-semibold text-gray-900 dark:text-white">Review & Save</span>
              </div>
              {saving && <div className="flex items-center gap-1 text-xs text-blue-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</div>}
            </div>
            <div className="space-y-3">
              <Input label="Contact Number *" value={form.contactNumber} onChange={updateField('contactNumber')}
                placeholder="e.g. 966508123456"
                error={form.contactNumber && !validateContactNumber(form.contactNumber) ? 'Invalid number' : undefined} />
              <Input label="Customer Name" value={form.customerName} onChange={updateField('customerName')} placeholder="Customer name" />
              <Input label="Bill Number" value={form.billNumber} onChange={updateField('billNumber')} placeholder="Bill #" />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={retake} className="flex-1" disabled={saving}><RotateCcw className="h-4 w-4" /> Retake</Button>
              <Button onClick={saveRecord} loading={saving} className="flex-1"
                disabled={!form.contactNumber || !validateContactNumber(form.contactNumber)}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SUCCESS */}
      {phase === 'success' && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-bold text-2xl text-gray-900 dark:text-white">Saved!</p>
              <p className="text-gray-500 text-sm mt-1">Next scan starting...</p>
            </div>
            {form.contactNumber && (
              <div className="bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-lg">
                <span className="font-mono font-bold text-green-700 dark:text-green-400">{form.contactNumber}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ERROR */}
      {phase === 'error' && (
        <Card>
          <CardContent className="py-6 flex flex-col items-center gap-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-900 dark:text-white">Extraction Failed</p>
              <p className="text-sm text-gray-500 mt-1">{errorMsg}</p>
            </div>
            <div className="w-full space-y-3">
              <Input label="Contact Number *" value={form.contactNumber} onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
                placeholder="966XXXXXXXXX" autoFocus />
              <Input label="Customer Name" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Customer name" />
              <Input label="Bill Number" value={form.billNumber} onChange={e => setForm(f => ({ ...f, billNumber: e.target.value }))} placeholder="Bill #" />
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={retake} className="flex-1"><RotateCcw className="h-4 w-4" /> Retake</Button>
              <Button onClick={saveRecord} loading={saving} className="flex-1"
                disabled={!form.contactNumber || !validateContactNumber(form.contactNumber)}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MANUAL ENTRY */}
      {mode === 'manual' && phase === 'idle' && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <Edit3 className="h-5 w-5 text-blue-500" />
              <span className="font-semibold text-gray-900 dark:text-white">Quick Entry</span>
            </div>
            <div className="space-y-3">
              <Input label="Contact Number *" value={form.contactNumber}
                onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
                placeholder="966XXXXXXXXX" type="tel" autoFocus />
              <Input label="Customer Name" value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder="Customer name" />
            </div>
            <Button onClick={saveRecord} loading={saving} className="w-full mt-4"
              disabled={!form.contactNumber || !validateContactNumber(form.contactNumber)}>
              Save Record
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
