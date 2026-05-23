'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Upload, Edit3, Zap, Brain, RotateCcw, CheckCircle, AlertCircle, Loader2, FlipHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { performOCR, compressImage, validateContactNumber, initTesseractWorker } from '@/lib/ocr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { OCRResult } from '@/types'
import { logAudit } from '@/lib/audit'

type CaptureMode = 'camera' | 'upload' | 'manual'
type OCRMode = 'fast' | 'ai'
type Phase = 'idle' | 'processing' | 'review' | 'success' | 'error'

const PARTNERS = [
  { value: '', label: 'Select Partner' },
  { value: 'Talabat', label: 'Talabat' },
  { value: 'HungerStation', label: 'HungerStation' },
  { value: 'Jahez', label: 'Jahez' },
  { value: 'Careem', label: 'Careem' },
  { value: 'Noon Food', label: 'Noon Food' },
  { value: 'Marsool', label: 'Marsool' },
  { value: 'Zomato', label: 'Zomato' },
  { value: 'Other', label: 'Other' },
]

const emptyForm = {
  customerName: '', contactNumber: '', billNumber: '',
  billDate: '', restaurant: '', address: '', deliveryPartner: '',
}

export function CaptureWidget() {
  const { user } = useAuth()
  const [captureMode, setCaptureMode] = useState<CaptureMode>('camera')
  const [ocrMode, setOcrMode] = useState<OCRMode>('fast')
  const [phase, setPhase] = useState<Phase>('idle')
  const [imageData, setImageData] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const autoSaveRef = useRef(false)

  // Pre-warm Tesseract on mount
  useEffect(() => {
    initTesseractWorker()
  }, [])

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setCameraActive(true)
      }
    } catch {
      toast('error', 'Camera access denied. Please allow camera permission.')
    }
  }, [facing])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }, [])

  useEffect(() => {
    if (captureMode === 'camera' && phase === 'idle') startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [captureMode, phase, startCamera, stopCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    const data = canvas.toDataURL('image/jpeg', 0.9)
    stopCamera()
    setImageData(data)
    setPhase('processing')
    runOCR(data)
  }, [stopCamera])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhase('processing')
    try {
      const compressed = await compressImage(file)
      setImageData(compressed)
      runOCR(compressed)
    } catch {
      toast('error', 'Failed to process image')
      setPhase('idle')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const runOCR = async (data: string) => {
    const startTime = Date.now()
    try {
      const result = await performOCR(data, ocrMode)
      const processingTime = Date.now() - startTime
      setOcrResult(result)
      const extractedForm = {
        customerName: result.customerName,
        contactNumber: result.contactNumber,
        billNumber: result.billNumber,
        billDate: result.billDate,
        restaurant: result.restaurant,
        address: result.address,
        deliveryPartner: result.deliveryPartner,
      }
      setForm(extractedForm)

      await supabase.from('scan_logs').insert({
        user_id: user!.id,
        status: result.contactNumber ? 'success' : 'failed',
        ocr_mode: ocrMode,
        source: captureMode,
        ocr_confidence: result.confidence,
        processing_time_ms: processingTime,
        raw_text: result.rawText,
        error_message: result.contactNumber ? null : 'No contact number extracted',
      })

      if (!result.contactNumber || !validateContactNumber(result.contactNumber)) {
        setErrorMsg('Contact number not detected. Please retake or enter manually.')
        setPhase('error')
      } else {
        autoSaveRef.current = true
        setPhase('review')
        // Auto-save after brief review period
        setTimeout(() => autoSaveDirect(extractedForm, result), 600)
      }
    } catch {
      setErrorMsg('OCR processing failed. Please retake.')
      setPhase('error')
    }
  }

  const autoSaveDirect = async (formData: typeof emptyForm, result: OCRResult) => {
    if (!autoSaveRef.current) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('bill_records').insert({
        user_id: user!.id,
        customer_name: formData.customerName,
        contact_number: formData.contactNumber,
        bill_number: formData.billNumber,
        bill_date: formData.billDate,
        restaurant: formData.restaurant,
        address: formData.address,
        delivery_partner: formData.deliveryPartner,
        raw_text: result.rawText,
        ocr_confidence: result.confidence,
        source: captureMode,
        ocr_mode: ocrMode,
        status: 'success',
      }).select().single()
      if (error) throw error
      await logAudit('CREATE', 'Bill Records', `Auto-saved bill for ${formData.contactNumber}`, { id: data.id })
      setPhase('success')
      setTimeout(() => {
        autoSaveRef.current = false
        resetCapture()
        if (captureMode === 'camera') startCamera()
      }, 2000)
    } catch {
      toast('error', 'Failed to save record. Please try again.')
      setPhase('review')
    } finally {
      setSaving(false)
    }
  }

  const saveRecord = useCallback(async () => {
    if (!validateContactNumber(form.contactNumber)) {
      toast('error', 'Please enter a valid contact number')
      return
    }
    autoSaveRef.current = false
    setSaving(true)
    try {
      const { data, error } = await supabase.from('bill_records').insert({
        user_id: user!.id,
        customer_name: form.customerName,
        contact_number: form.contactNumber,
        bill_number: form.billNumber,
        bill_date: form.billDate,
        restaurant: form.restaurant,
        address: form.address,
        delivery_partner: form.deliveryPartner,
        raw_text: ocrResult?.rawText || '',
        ocr_confidence: ocrResult?.confidence || 0,
        source: captureMode,
        ocr_mode: captureMode === 'manual' ? 'manual' : ocrMode,
        status: 'success',
      }).select().single()
      if (error) throw error
      await logAudit('CREATE', 'Bill Records', `Saved bill for ${form.contactNumber}`, { id: data.id })
      setPhase('success')
      setTimeout(() => {
        resetCapture()
        if (captureMode === 'camera') startCamera()
      }, 2000)
    } catch {
      toast('error', 'Failed to save record. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [form, ocrResult, captureMode, ocrMode, user, startCamera])

  const resetCapture = () => {
    autoSaveRef.current = false
    setPhase('idle')
    setImageData(null)
    setOcrResult(null)
    setErrorMsg('')
    setForm(emptyForm)
  }

  const retake = () => {
    resetCapture()
    if (captureMode === 'camera') startCamera()
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Mode Selector */}
      <div className="flex gap-2 mb-4">
        {(['camera', 'upload', 'manual'] as CaptureMode[]).map(m => (
          <button key={m} onClick={() => { setCaptureMode(m); resetCapture() }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all
              ${captureMode === m ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            {m === 'camera' ? '📷' : m === 'upload' ? '📁' : '✏️'} {m === 'manual' ? 'Quick Entry' : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* OCR Mode Toggle */}
      {captureMode !== 'manual' && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <Zap className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">OCR Mode</span>
          <button onClick={() => setOcrMode(m => m === 'fast' ? 'ai' : 'fast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${ocrMode === 'ai' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
            {ocrMode === 'ai' ? <><Brain className="h-3.5 w-3.5" /> AI Mode</> : <><Zap className="h-3.5 w-3.5" /> Fast Mode</>}
          </button>
        </div>
      )}

      {/* CAMERA */}
      {captureMode === 'camera' && phase === 'idle' && (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-xl">
            <div className="relative bg-black" style={{ aspectRatio: '3/4' }}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center text-white bg-black/60">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Starting camera...</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-4/5 h-3/4 border-2 border-white/40 rounded-lg border-dashed" />
              </div>
              <div className="absolute top-0 inset-x-0 h-0.5 scanner-line bg-blue-400/70" />
              <button onClick={() => { setFacing(f => f === 'environment' ? 'user' : 'environment') }}
                className="absolute top-4 right-4 bg-black/40 p-2 rounded-full text-white hover:bg-black/60 transition-colors">
                <FlipHorizontal className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <Button onClick={capturePhoto} className="w-full" size="lg" disabled={!cameraActive}>
                <Camera className="h-5 w-5" /> Capture Bill
              </Button>
              <p className="text-center text-xs text-gray-400 mt-2">Position bill within the frame</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* UPLOAD */}
      {captureMode === 'upload' && phase === 'idle' && (
        <Card>
          <CardContent>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full">
                <Upload className="h-8 w-8 text-blue-500" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-900 dark:text-white">Upload Bill Image</p>
                <p className="text-sm text-gray-500 mt-1">JPG, PNG, HEIC — Auto-compressed to &lt;400KB</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </CardContent>
        </Card>
      )}

      {/* PROCESSING */}
      {phase === 'processing' && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900/30" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                {ocrMode === 'ai' ? <Brain className="h-7 w-7 text-blue-600" /> : <Zap className="h-7 w-7 text-blue-600" />}
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white">Scanning Bill...</p>
              <p className="text-sm text-gray-500 mt-1">{ocrMode === 'ai' ? 'AI enhanced mode' : 'Fast mode — target &lt;1.5s'}</p>
            </div>
            {imageData && (
              <img src={imageData} alt="preview" className="w-24 h-24 object-cover rounded-lg opacity-40 mt-2" />
            )}
          </CardContent>
        </Card>
      )}

      {/* REVIEW — brief display before auto-save */}
      {phase === 'review' && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-semibold text-gray-900 dark:text-white">OCR Complete</span>
              </div>
              <div className="flex items-center gap-2">
                {ocrResult && (
                  <Badge variant={ocrResult.confidence > 70 ? 'success' : 'warning'}>
                    {ocrResult.confidence.toFixed(0)}% confidence
                  </Badge>
                )}
                {saving && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              </div>
            </div>
            <div className="space-y-3">
              <Input label="Customer Name" value={form.customerName}
                onChange={e => { autoSaveRef.current = false; setForm(f => ({ ...f, customerName: e.target.value })) }}
                placeholder="Customer name" />
              <Input label="Contact Number *" value={form.contactNumber}
                onChange={e => { autoSaveRef.current = false; setForm(f => ({ ...f, contactNumber: e.target.value })) }}
                placeholder="Contact number"
                error={!validateContactNumber(form.contactNumber) && form.contactNumber ? 'Invalid number' : undefined} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Bill Number" value={form.billNumber}
                  onChange={e => { autoSaveRef.current = false; setForm(f => ({ ...f, billNumber: e.target.value })) }}
                  placeholder="Bill #" />
                <Input label="Bill Date" value={form.billDate}
                  onChange={e => { autoSaveRef.current = false; setForm(f => ({ ...f, billDate: e.target.value })) }}
                  placeholder="Date" />
              </div>
              <Select label="Delivery Partner" value={form.deliveryPartner}
                onChange={e => { autoSaveRef.current = false; setForm(f => ({ ...f, deliveryPartner: e.target.value })) }}
                options={PARTNERS} />
              <Input label="Restaurant" value={form.restaurant}
                onChange={e => { autoSaveRef.current = false; setForm(f => ({ ...f, restaurant: e.target.value })) }}
                placeholder="Restaurant name" />
              <Input label="Address" value={form.address}
                onChange={e => { autoSaveRef.current = false; setForm(f => ({ ...f, address: e.target.value })) }}
                placeholder="Delivery address" />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={retake} className="flex-1" disabled={saving}>
                <RotateCcw className="h-4 w-4" /> Retake
              </Button>
              <Button onClick={saveRecord} loading={saving} className="flex-1"
                disabled={!form.contactNumber || !validateContactNumber(form.contactNumber)}>
                Save Record
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SUCCESS */}
      {phase === 'success' && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full pulse-ring" />
            </div>
            <div>
              <p className="font-bold text-2xl text-gray-900 dark:text-white">Saved!</p>
              <p className="text-gray-500 text-sm mt-1">Auto-starting next scan in 2s...</p>
            </div>
            {form.contactNumber && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-lg">
                <span className="text-xs text-gray-500">Contact:</span>
                <span className="font-mono font-bold text-green-700 dark:text-green-400">{form.contactNumber}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ERROR */}
      {phase === 'error' && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-900 dark:text-white">Extraction Failed</p>
              <p className="text-sm text-gray-500 mt-1">{errorMsg}</p>
            </div>
            <div className="w-full space-y-3">
              <Input label="Contact Number *"
                value={form.contactNumber}
                onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
                placeholder="e.g. 966508123456"
                autoFocus />
              <Input label="Customer Name"
                value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder="Customer name" />
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={retake} className="flex-1">
                <RotateCcw className="h-4 w-4" /> Retake
              </Button>
              <Button onClick={saveRecord} loading={saving} className="flex-1"
                disabled={!form.contactNumber || !validateContactNumber(form.contactNumber)}>
                Save Manually
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MANUAL ENTRY */}
      {captureMode === 'manual' && phase === 'idle' && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <Edit3 className="h-5 w-5 text-blue-500" />
              <span className="font-semibold text-gray-900 dark:text-white">Quick Manual Entry</span>
            </div>
            <div className="space-y-3">
              <Input label="Customer Name" value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder="Customer name" />
              <Input label="Contact Number *" value={form.contactNumber}
                onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
                placeholder="966XXXXXXXXX" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Bill Number" value={form.billNumber}
                  onChange={e => setForm(f => ({ ...f, billNumber: e.target.value }))}
                  placeholder="Bill #" />
                <Input label="Bill Date" type="date" value={form.billDate}
                  onChange={e => setForm(f => ({ ...f, billDate: e.target.value }))} />
              </div>
              <Select label="Delivery Partner" value={form.deliveryPartner}
                onChange={e => setForm(f => ({ ...f, deliveryPartner: e.target.value }))}
                options={PARTNERS} />
              <Input label="Restaurant" value={form.restaurant}
                onChange={e => setForm(f => ({ ...f, restaurant: e.target.value }))}
                placeholder="Restaurant name" />
              <Input label="Address" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Delivery address" />
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
