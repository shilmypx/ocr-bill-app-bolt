'use client'
import { useState, useRef, useCallback } from 'react'
import { Upload, Play, CheckCircle, XCircle, AlertCircle, Save, SkipForward, Loader2, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { toast } from '@/components/ui/Toast'
import { performOCR, compressImage, initTesseractWorker } from '@/lib/ocr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

type ItemStatus = 'queued' | 'processing' | 'review' | 'saved' | 'skipped' | 'error'

interface BatchItem {
  id: string
  file: File
  preview: string
  status: ItemStatus
  code: string
  num: string
  name: string
  errorMsg: string
  confidence: number
}

// Validation: +974 + exactly 8 digits
const codeOk = (c: string) => c.trim() === '+974'
const numOk  = (n: string) => n.replace(/\D/g, '').length === 8
const isValid = (code: string, num: string) => codeOk(code) && numOk(num)
const fullNum = (code: string, num: string) => code.trim() + num.replace(/\D/g, '')

export function BatchCapture() {
  const { user } = useAuth()
  const [items, setItems] = useState<BatchItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoProcess, setAutoProcess] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)

  const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }, [])

  // Add files to queue
  const addFiles = useCallback(async (files: FileList) => {
    const newItems: BatchItem[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const preview = URL.createObjectURL(file)
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file, preview,
        status: 'queued',
        code: '+974', num: '', name: '',
        errorMsg: '', confidence: 0,
      })
    }
    setItems(prev => [...prev, ...newItems])

    if (autoProcess) {
      // Process new items immediately
      await processQueue([...newItems], updateItem)
    }
  }, [autoProcess, updateItem])

  const processQueue = async (queue: BatchItem[], updater: typeof updateItem) => {
    if (processingRef.current) return
    processingRef.current = true
    setProcessing(true)
    await initTesseractWorker()

    for (const item of queue) {
      if (!processingRef.current) break
      updater(item.id, { status: 'processing' })
      try {
        const compressed = await compressImage(item.file)
        const result = await performOCR(compressed, 'fast')
        
        // Parse phone
        const { splitContactNumber } = await import('@/lib/ocr')
        const { code, local } = splitContactNumber(result.contactNumber || '')
        
        // Clear Arabic names
        const isLatinOnly = (s: string) => /^[a-zA-Z][a-zA-Z\s\-''.]*$/.test(s.trim())
        const extractedName = result.customerName || ''

        updater(item.id, {
          status: local && isValid(code, local) ? 'review' : 'error',
          code,
          num: local,
          name: isLatinOnly(extractedName) ? extractedName : '',
          confidence: result.confidence,
          errorMsg: local && isValid(code, local) ? '' : 'Contact number not detected — edit or skip',
        })
      } catch {
        updater(item.id, { status: 'error', errorMsg: 'OCR failed' })
      }
    }

    processingRef.current = false
    setProcessing(false)
  }

  const processAll = async () => {
    const queued = items.filter(it => it.status === 'queued' || it.status === 'error')
    if (queued.length === 0) { toast('error', 'No items to process'); return }
    await processQueue(queued, updateItem)
  }

  const saveItem = async (item: BatchItem) => {
    if (!user?.id || !isValid(item.code, item.num)) return
    const contact = fullNum(item.code, item.num)
    const { error } = await supabase.from('bill_records').insert({
      user_id: user.id,
      contact_number: contact,
      customer_name: item.name.trim() || null,
      source: 'upload',
      ocr_mode: 'fast',
      status: 'success',
      ocr_confidence: item.confidence,
    })
    if (error) { toast('error', 'Save failed: ' + error.message); return }
    updateItem(item.id, { status: 'saved' })
  }

  const saveAll = async () => {
    if (!user?.id) return
    const readyItems = items.filter(it => it.status === 'review' && isValid(it.code, it.num))
    if (readyItems.length === 0) { toast('error', 'No valid records to save'); return }

    setSaving(true)
    let saved = 0; let failed = 0
    for (const item of readyItems) {
      const contact = fullNum(item.code, item.num)
      const { error } = await supabase.from('bill_records').insert({
        user_id: user.id,
        contact_number: contact,
        customer_name: item.name.trim() || null,
        source: 'upload',
        ocr_mode: 'fast',
        status: 'success',
        ocr_confidence: item.confidence,
      })
      if (error) { failed++; updateItem(item.id, { status: 'error', errorMsg: error.message }) }
      else { saved++; updateItem(item.id, { status: 'saved' }) }
    }
    setSaving(false)
    toast('success', `Saved ${saved} record${saved !== 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''}`)
  }

  const skipItem = (id: string) => updateItem(id, { status: 'skipped' })
  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id))
  const clearAll = () => { items.forEach(it => URL.revokeObjectURL(it.preview)); setItems([]) }

  const counts = {
    total: items.length,
    queued: items.filter(it => it.status === 'queued').length,
    processing: items.filter(it => it.status === 'processing').length,
    review: items.filter(it => it.status === 'review').length,
    saved: items.filter(it => it.status === 'saved').length,
    error: items.filter(it => it.status === 'error').length,
    skipped: items.filter(it => it.status === 'skipped').length,
  }
  const allDone = items.length > 0 && items.every(it => ['saved', 'skipped'].includes(it.status))

  const statusIcon = (status: ItemStatus) => {
    if (status === 'processing') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    if (status === 'review')     return <AlertCircle className="h-4 w-4 text-amber-500" />
    if (status === 'saved')      return <CheckCircle className="h-4 w-4 text-green-500" />
    if (status === 'skipped')    return <SkipForward className="h-4 w-4 text-gray-400" />
    if (status === 'error')      return <XCircle className="h-4 w-4 text-red-500" />
    return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
  }

  return (
    <div className="space-y-4">
      {/* Settings + Upload */}
      <Card><CardContent className="py-4 space-y-3">
        {/* Auto-process toggle */}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="autoProcess" checked={autoProcess} onChange={e => setAutoProcess(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded" />
          <label htmlFor="autoProcess" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            Auto-process when uploaded
          </label>
        </div>

        {/* Drop zone */}
        <div onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full">
            <Upload className="h-7 w-7 text-blue-500" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 dark:text-white">Tap to select multiple bills</p>
            <p className="text-xs text-gray-500 mt-1">Select as many images as you want — all processed in queue</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = '' } }} />
      </CardContent></Card>

      {/* Queue stats + controls */}
      {items.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
            <span className="font-medium text-gray-700 dark:text-gray-300">{counts.total} bills</span>
            {counts.queued > 0 && <span className="text-gray-400">⏳ {counts.queued} queued</span>}
            {counts.processing > 0 && <span className="text-blue-500">🔄 {counts.processing} reading...</span>}
            {counts.review > 0 && <span className="text-amber-600">📋 {counts.review} ready</span>}
            {counts.saved > 0 && <span className="text-green-600">✓ {counts.saved} saved</span>}
            {counts.error > 0 && <span className="text-red-500">✗ {counts.error} failed</span>}
          </div>
          <div className="flex gap-2">
            {counts.queued > 0 && !processing && (
              <Button size="sm" onClick={processAll} loading={processing}>
                <Play className="h-3.5 w-3.5" />Process All
              </Button>
            )}
            {counts.review > 0 && (
              <Button size="sm" onClick={saveAll} loading={saving}
                className="bg-green-600 hover:bg-green-500 text-white">
                <Save className="h-3.5 w-3.5" />Save All ({counts.review})
              </Button>
            )}
            {!processing && (
              <Button variant="outline" size="sm" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5" />Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Queue list */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <Card key={item.id} className={`transition-all ${item.status === 'saved' ? 'opacity-60' : ''}`}>
              <CardContent className="py-3">
                <div className="flex gap-3 items-start">
                  {/* Bill thumbnail */}
                  <div className="w-12 h-14 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                    <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Header row */}
                    <div className="flex items-center gap-2">
                      {statusIcon(item.status)}
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Bill {idx + 1} — {item.file.name.slice(0, 25)}{item.file.name.length > 25 ? '…' : ''}
                      </span>
                      {item.confidence > 0 && (
                        <span className="text-xs text-gray-400 ml-auto">{item.confidence.toFixed(0)}% conf.</span>
                      )}
                    </div>

                    {/* Processing state */}
                    {item.status === 'processing' && (
                      <p className="text-xs text-blue-500">Reading bill...</p>
                    )}

                    {/* Queued */}
                    {item.status === 'queued' && (
                      <p className="text-xs text-gray-400">Waiting to process</p>
                    )}

                    {/* Saved / Skipped */}
                    {item.status === 'saved' && (
                      <p className="text-xs text-green-600 font-mono font-semibold">{fullNum(item.code, item.num)} ✓</p>
                    )}
                    {item.status === 'skipped' && (
                      <p className="text-xs text-gray-400 italic">Skipped</p>
                    )}

                    {/* Review / Error — editable fields */}
                    {(item.status === 'review' || item.status === 'error') && (
                      <div className="space-y-2">
                        {item.errorMsg && (
                          <p className="text-xs text-red-500">{item.errorMsg}</p>
                        )}
                        {/* Customer Name */}
                        <input type="text" value={item.name}
                          onChange={e => updateItem(item.id, { name: e.target.value })}
                          placeholder="Customer name (optional)"
                          autoComplete="off"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {/* Contact Number */}
                        <div className="flex rounded-lg overflow-hidden border focus-within:ring-1 focus-within:ring-blue-500"
                          style={{ borderColor: !codeOk(item.code) ? '#ef4444' : !numOk(item.num) ? '#ef4444' : '#d1d5db' }}>
                          <input value={item.code}
                            onChange={e => updateItem(item.id, { code: e.target.value })}
                            className={`w-16 shrink-0 px-2 py-1.5 text-center text-sm font-mono font-bold border-r focus:outline-none ${!codeOk(item.code) ? 'bg-red-50 dark:bg-red-900/30 text-red-700 border-r-red-400' : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-r-gray-300 dark:border-r-gray-600'}`} />
                          <input type="tel" value={item.num}
                            onChange={e => updateItem(item.id, { num: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                            placeholder="41105663"
                            className={`flex-1 px-2.5 py-1.5 text-sm font-mono focus:outline-none ${item.num && !numOk(item.num) ? 'bg-red-50 dark:bg-red-900/20 text-red-700' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'}`} />
                        </div>
                        {/* Actions */}
                        <div className="flex gap-1.5">
                          <button onClick={() => saveItem(item)} disabled={!isValid(item.code, item.num)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${isValid(item.code, item.num) ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                            <Save className="h-3 w-3" />Save
                          </button>
                          <button onClick={() => skipItem(item.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors">
                            Skip
                          </button>
                          <button onClick={() => removeItem(item.id)}
                            className="px-2 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* All done message */}
      {allDone && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle className="h-10 w-10 text-green-500" />
          <p className="font-semibold text-gray-900 dark:text-white">All bills processed!</p>
          <p className="text-sm text-gray-500">{counts.saved} saved · {counts.skipped} skipped</p>
          <Button variant="outline" size="sm" onClick={clearAll} className="mt-1">
            <RefreshCw className="h-4 w-4" />Start New Batch
          </Button>
        </div>
      )}
    </div>
  )
}
