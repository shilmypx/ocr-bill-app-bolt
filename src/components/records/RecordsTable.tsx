'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Download, ChevronDown, ChevronUp, Trash2, Edit2, Check, X, RefreshCw, Filter, AlertCircle, CheckSquare, Square, Settings2, FileSpreadsheet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const PAGE_SIZE = 25

const ALL_COLS = [
  { key: 'customer_name',    label: 'Customer Name' },
  { key: 'contact_number',   label: 'Contact Number' },
  { key: 'order_number',     label: 'Order Number' },
  { key: 'delivery_partner', label: 'Partner' },
  { key: 'restaurant',       label: 'Restaurant' },
  { key: 'bill_date',        label: 'Order Date' },
  { key: '_name',            label: 'Captured By' },
  { key: 'created_at',       label: 'Captured Date' },
  { key: 'source',           label: 'Source' },
  { key: 'ocr_mode',         label: 'OCR Mode' },
]

function ExportDialog({ type, onClose, getAllData, getExportCount }: {
  type: 'all' | 'unique'; onClose: () => void
  getAllData: () => Promise<any[]>
  getExportCount: (type: 'all' | 'unique') => Promise<number>
}) {
  const [selectedCols, setSelectedCols] = useState<string[]>(
    type === 'unique'
      ? ['customer_name', 'contact_number', 'order_number']
      : ['customer_name', 'contact_number', 'order_number', 'delivery_partner', 'restaurant', '_name', 'created_at']
  )
  const [includeHeader, setIncludeHeader] = useState(true)
  const [loading, setLoading] = useState(false)
  const [exportCount, setExportCount] = useState<number | null>(null)

  useEffect(() => {
    getExportCount(type).then(setExportCount)
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  const doExport = async () => {
    if (!selectedCols.length) { toast('error', 'Select at least one column'); return }
    setLoading(true)
    try {
      let rows = await getAllData()
      if (type === 'unique') {
        const seen = new Set<string>()
        rows = rows.filter((r: any) => { if (seen.has(r.contact_number)) return false; seen.add(r.contact_number); return true })
      }
      const cols = ALL_COLS.filter(c => selectedCols.includes(c.key))
      const data = rows.map((r: any) => {
        const row: Record<string, any> = {}
        cols.forEach(c => {
          let v = r[c.key] ?? ''
          if (c.key === 'created_at' && v) v = new Date(v).toLocaleString()
          if (c.key === 'contact_number') v = String(v)
          row[c.label] = v
        })
        return row
      })
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(data, { skipHeader: !includeHeader })
      XLSX.utils.book_append_sheet(wb, ws, type === 'unique' ? 'Unique' : 'All Records')
      XLSX.writeFile(wb, `${type === 'unique' ? 'unique_contacts' : 'bill_records'}_${new Date().toISOString().slice(0,10)}.xlsx`)
      onClose()
    } catch (e: any) { toast('error', e?.message || 'Export failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Export {type === 'unique' ? 'Unique Contacts' : 'All Records'}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Columns</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_COLS.map(col => (
                <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedCols.includes(col.key)}
                    onChange={() => setSelectedCols(p => p.includes(col.key) ? p.filter(k => k !== col.key) : [...p, col.key])}
                    className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{col.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeHeader} onChange={e => setIncludeHeader(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Include header row</span>
            </label>
            <p className="text-xs text-gray-400 mt-1 ml-6">Uncheck to export data rows only</p>
          </div>
        </div>
        {exportCount !== null && (
          <div className="px-5 pb-2">
            <p className="text-sm text-center font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg py-2">
              {exportCount === 0 ? 'No records to export' : `Will export ${exportCount.toLocaleString()} ${type === 'unique' ? 'unique contacts' : 'records'}`}
            </p>
          </div>
        )}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={doExport} loading={loading} disabled={!selectedCols.length} className="flex-1">
            <Download className="h-4 w-4" />Download Excel
          </Button>
        </div>
      </div>
    </div>
  )
}

export function RecordsTable() {
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [exportDialog, setExportDialog] = useState<'all' | 'unique' | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [pdfAllLoading, setPdfAllLoading] = useState(false)
  const [pdfUniqueLoading, setPdfUniqueLoading] = useState(false)
  const runId = useRef(0)

  // ── Direct useEffect with all deps listed — no closure issues ──────────────
  useEffect(() => {
    let cancelled = false
    const id = ++runId.current

    async function load() {
      setLoading(true)
      setError('')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) { setError('Not authenticated'); return }

        const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
        const isAdmin = prof?.role === 'admin'

        // Load user list for admin filter
        if (isAdmin && allUsers.length === 0) {
          supabase.from('profiles').select('id,full_name,email')
            .then(({ data }) => { if (data && !cancelled) setAllUsers(data) })
        }

        let q = supabase
          .from('bill_records')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

        if (!isAdmin) q = q.eq('user_id', uid)
        else if (userFilter) q = q.eq('user_id', userFilter)

        if (search.trim()) q = q.or(
          `customer_name.ilike.%${search.trim()}%,contact_number.ilike.%${search.trim()}%,order_number.ilike.%${search.trim()}%`
        )
        if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00Z')
        if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59Z')

        const { data: bills, count, error: qErr } = await q
        if (qErr) throw new Error(qErr.message)
        if (cancelled || runId.current !== id) return

        // Enrich with profile names
        const uids = Array.from(new Set((bills ?? []).map((b: any) => b.user_id).filter(Boolean)))
        const nameMap: Record<string, string> = {}
        if (uids.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id,full_name,email').in('id', uids as string[])
          ;(profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.email || '—' })
        }
        if (cancelled || runId.current !== id) return

        setRows((bills ?? []).map((b: any) => ({ ...b, _name: nameMap[b.user_id] || '—' })))
        setTotal(count ?? 0)
        setSelected(new Set())
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  // All state that affects the query is listed — no stale closure issues
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, dateFrom, dateTo, userFilter])

  const refresh = useCallback(() => {
    // Force re-run by bumping a separate counter via direct call
    setLoading(true)
    runId.current++ // invalidate any in-flight request
    const id = runId.current
    let cancelled = false

    async function reload() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) { setError('Not authenticated'); setLoading(false); return }
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
        const isAdmin = prof?.role === 'admin'

        let q = supabase
          .from('bill_records')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

        if (!isAdmin) q = q.eq('user_id', uid)
        else if (userFilter) q = q.eq('user_id', userFilter)
        if (search.trim()) q = q.or(`customer_name.ilike.%${search.trim()}%,contact_number.ilike.%${search.trim()}%,order_number.ilike.%${search.trim()}%`)
        if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00Z')
        if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59Z')

        const { data: bills, count, error: qErr } = await q
        if (qErr) throw new Error(qErr.message)
        if (cancelled || runId.current !== id) return

        const uids = Array.from(new Set((bills ?? []).map((b: any) => b.user_id).filter(Boolean)))
        const nameMap: Record<string, string> = {}
        if (uids.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id,full_name,email').in('id', uids as string[])
          ;(profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.email || '—' })
        }
        if (cancelled || runId.current !== id) return
        setRows((bills ?? []).map((b: any) => ({ ...b, _name: nameMap[b.user_id] || '—' })))
        setTotal(count ?? 0)
        setSelected(new Set())
        setError('')
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    reload()
    return () => { cancelled = true }
  }, [page, search, dateFrom, dateTo, userFilter])

  // Fetch all for export — paginates in batches of 1000 to bypass PostgREST row limit
  // Shared helper: apply current filters to a Supabase query
  const applyFilters = (q: any, isAdmin: boolean, uid: string) => {
    if (!isAdmin) q = q.eq('user_id', uid)
    else if (userFilter) q = q.eq('user_id', userFilter)
    if (search.trim()) q = q.or(
      `customer_name.ilike.%${search.trim()}%,contact_number.ilike.%${search.trim()}%,order_number.ilike.%${search.trim()}%`
    )
    if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00Z')
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59Z')
    return q
  }

  const getAllData = async (): Promise<any[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id; if (!uid) return []
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
    const isAdmin = prof?.role === 'admin'
    // Paginate in batches — applying active filters so export matches what the table shows
    const BATCH = 1000
    let allRows: any[] = []
    let from = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase.from('bill_records').select('*')
        .order('created_at', { ascending: false })
        .range(from, from + BATCH - 1)
      q = applyFilters(q, isAdmin, uid)
      const { data, error } = await q
      if (error || !data || data.length === 0) break
      allRows = allRows.concat(data)
      if (data.length < BATCH) break
      from += BATCH
    }
    const uids = Array.from(new Set(allRows.map((b: any) => b.user_id).filter(Boolean)))
    const nameMap: Record<string, string> = {}
    if (uids.length > 0) {
      const { data: p } = await supabase.from('profiles').select('id,full_name,email').in('id', uids as string[])
      ;(p ?? []).forEach((x: any) => { nameMap[x.id] = x.full_name || x.email || '—' })
    }
    return allRows.map((b: any) => ({ ...b, _name: nameMap[b.user_id] || '—' }))
  }

  // Get total export count with active filters applied
  const getExportCount = async (exportType: 'all' | 'unique'): Promise<number> => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id; if (!uid) return 0
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
    const isAdmin = prof?.role === 'admin'
    let q = supabase.from('bill_records').select('*', { count: 'exact', head: true })
    q = applyFilters(q, isAdmin, uid)
    const { count } = await q
    if (exportType === 'all') return count ?? 0
    // For unique: count distinct contact numbers within filtered set
    let q2 = supabase.from('bill_records').select('contact_number')
    q2 = applyFilters(q2, isAdmin, uid)
    const { data } = await q2
    return new Set((data ?? []).map((r: any) => r.contact_number).filter(Boolean)).size
  }

  // Export PDF — filtered, with header and table
  const exportPdf = async (type: 'all' | 'unique') => {
    const setLoading = type === 'all' ? setPdfAllLoading : setPdfUniqueLoading
    setLoading(true)
    try {
      const allRows = await getAllData()
      let rows = allRows
      if (type === 'unique') {
        const seen = new Set<string>()
        rows = allRows.filter((r: any) => {
          if (!r.contact_number || seen.has(r.contact_number)) return false
          seen.add(r.contact_number); return true
        })
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // Header
      const filterDesc = [
        search ? `Search: "${search}"` : '',
        dateFrom ? `From: ${dateFrom}` : '',
        dateTo ? `To: ${dateTo}` : '',
      ].filter(Boolean).join('  |  ') || 'All records'

      const totalCount2 = allRows.length
      const uniqueCount2 = type === 'unique' ? rows.length
        : new Set(allRows.map((r: any) => r.contact_number).filter(Boolean)).size
      const dupCount2 = totalCount2 - uniqueCount2

      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(type === 'unique' ? 'Unique Contacts Bill Records' : 'All Contacts Bill Records', 14, 16)

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      doc.text(`Total Records        ${totalCount2.toLocaleString()}`, 14, 24)
      doc.text(`Unique Contacts      ${uniqueCount2.toLocaleString()}`, 14, 30)
      doc.text(`Duplicate Contacts   ${dupCount2.toLocaleString()}`, 14, 36)

      // Reset text color
      doc.setTextColor(0, 0, 0)

      // Table
      const tableData = rows.map((r: any, idx: number) => [
        idx + 1,
        r.customer_name || '—',
        r.contact_number || '—',
      ])

      autoTable(doc, {
        startY: 42,
        head: [['#', 'Customer Name', 'Contact Number']],
        body: tableData,
        headStyles: {
          fillColor: [37, 99, 235],  // blue-600
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
        },
        bodyStyles: { fontSize: 8.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 90 },
          2: { cellWidth: 75 },
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data: any) => {
          // Footer with page number
          const pageCount = (doc as any).internal.getNumberOfPages()
          doc.setFontSize(8)
          doc.setTextColor(150, 150, 150)
          doc.text(
            `Page ${data.pageNumber} of ${pageCount}`,
            doc.internal.pageSize.getWidth() - 14,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'right' }
          )
        },
      })

      const filename = `bill_records_${type}_${new Date().toISOString().slice(0,10)}.pdf`
      doc.save(filename)
      toast('success', `PDF exported: ${rows.length.toLocaleString()} ${type === 'unique' ? 'unique contacts' : 'records'}`)
    } catch (e: any) {
      toast('error', e?.message || 'PDF export failed')
    } finally {
      setLoading(false)
    }
  }

  // Export 3-sheet report: Summary + Unique Contacts + All Records
  const exportReport = async () => {
    setReportLoading(true)
    try {
      const allRows = await getAllData()
      const seen = new Set<string>()
      const uniqueRows = allRows.filter((r: any) => {
        if (!r.contact_number || seen.has(r.contact_number)) return false
        seen.add(r.contact_number); return true
      })
      const totalCount    = allRows.length
      const uniqueCount   = uniqueRows.length
      const duplicateCount = totalCount - uniqueCount

      const wb = XLSX.utils.book_new()

      // Sheet 1: Summary
      const filterDesc = [
        search ? `Search: "${search}"` : '',
        dateFrom ? `From: ${dateFrom}` : '',
        dateTo ? `To: ${dateTo}` : '',
      ].filter(Boolean).join(', ') || 'No filters (all data)'

      const summaryData = [
        { Metric: 'Total Records (filtered)',   Count: totalCount },
        { Metric: 'Unique Contacts',            Count: uniqueCount },
        { Metric: 'Duplicate Contacts',         Count: duplicateCount },
        { Metric: 'Active Filters',             Count: filterDesc },
        { Metric: 'Export Date',                Count: new Date().toLocaleDateString() },
      ]
      const wsSummary = XLSX.utils.json_to_sheet(summaryData)
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

      // Sheet 2: Unique Records (name + contact only)
      const uniqueData = uniqueRows.map((r: any) => ({
        'Customer Name':   r.customer_name || '',
        'Contact Number':  String(r.contact_number || ''),
      }))
      const wsUnique = XLSX.utils.json_to_sheet(uniqueData)
      wsUnique['!cols'] = [{ wch: 30 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, wsUnique, 'Unique Contacts')

      // Sheet 3: All Records (name + contact only)
      const allData = allRows.map((r: any) => ({
        'Customer Name':   r.customer_name || '',
        'Contact Number':  String(r.contact_number || ''),
      }))
      const wsAll = XLSX.utils.json_to_sheet(allData)
      wsAll['!cols'] = [{ wch: 30 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, wsAll, 'All Records')

      XLSX.writeFile(wb, `bill_records_report_${new Date().toISOString().slice(0,10)}.xlsx`)
      toast('success', `Report exported: ${totalCount.toLocaleString()} records, ${uniqueCount.toLocaleString()} unique`)
    } catch (e: any) { toast('error', e?.message || 'Export failed') }
    finally { setReportLoading(false) }
  }

  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))
  const toggleOne = (id: string) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s) }

  const deleteSelected = async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} record(s)?`)) return
    setDeleting(true)
    const ids = Array.from(selected)
    const { error: e } = await supabase.from('bill_records').delete().in('id', ids)
    if (e) { toast('error', 'Delete failed: ' + e.message); setDeleting(false); return }
    toast('success', `${ids.length} record(s) deleted`); setSelected(new Set()); setDeleting(false); refresh()
  }
  const deleteSingle = async (id: string) => {
    if (!confirm('Delete this record?')) return
    const { error: e } = await supabase.from('bill_records').delete().eq('id', id)
    if (e) { toast('error', 'Delete failed'); return }
    toast('success', 'Deleted'); refresh()
  }
  const saveEdit = async (id: string) => {
    const { error: e } = await supabase.from('bill_records').update({ customer_name: editForm.customer_name, contact_number: editForm.contact_number, order_number: editForm.order_number }).eq('id', id)
    if (e) { toast('error', 'Update failed'); return }
    toast('success', 'Updated'); setEditId(null); refresh()
  }

  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {exportDialog && <ExportDialog type={exportDialog} onClose={() => setExportDialog(null)} getAllData={getAllData} getExportCount={getExportCount} />}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{loading ? '...' : `${total.toLocaleString()} records`}</p>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <Button variant="outline" size="sm" onClick={deleteSelected} loading={deleting}
              className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="h-4 w-4" />Delete {selected.size}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowFilters(s => !s)}><Filter className="h-4 w-4" />Filters</Button>
          <Button variant="outline" size="sm" onClick={() => setExportDialog('unique')}><Download className="h-4 w-4" />Unique</Button>
          <Button variant="outline" size="sm" onClick={() => setExportDialog('all')}><Download className="h-4 w-4" />All</Button>
          <Button variant="outline" size="sm" onClick={exportReport} loading={reportLoading}
            className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20">
            <FileSpreadsheet className="h-4 w-4" />Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPdf('unique')} loading={pdfUniqueLoading}
            className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20">
            <Download className="h-4 w-4" />PDF Unique
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPdf('all')} loading={pdfAllLoading}
            className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20">
            <Download className="h-4 w-4" />PDF All
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} loading={loading}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
          placeholder="Search name, contact, order number..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {showFilters && (
        <Card><CardContent className="py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 block mb-1">From Date</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" /></div>
            <div><label className="text-xs font-medium text-gray-500 block mb-1">To Date</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" /></div>
            {allUsers.length > 0 && (
              <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-500 block mb-1">Captured By</label>
                <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                  <option value="">All Users</option>
                  {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                </select></div>
            )}
            <div className="sm:col-span-2">
              <button onClick={() => { setDateFrom(''); setDateTo(''); setUserFilter(''); setPage(1) }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear filters</button>
            </div>
          </div>
        </CardContent></Card>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span>
          <button onClick={refresh} className="underline text-xs">Retry</button>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-3 py-3 w-10">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-blue-500">
                    {allSelected ? <CheckSquare className="h-4 w-4 text-blue-500" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Order #</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Captured By</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Date</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(5).fill(0).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                  {Array(7).fill(0).map((_, j) => <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>)}
                </tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center">
                  <div className="text-3xl mb-2">📋</div>
                  <p className="text-gray-400 text-sm">{error ? 'Error loading records' : 'No records found'}</p>
                </td></tr>
              ) : rows.map(r => {
                const editing = editId === r.id; const isSel = selected.has(r.id)
                return (
                  <React.Fragment key={r.id}>
                    <tr className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20 ${isSel ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}>
                      <td className="px-3 py-3">
                        <button onClick={() => toggleOne(r.id)} className="text-gray-400 hover:text-blue-500">
                          {isSel ? <CheckSquare className="h-4 w-4 text-blue-500" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3">{editing
                        ? <input value={editForm.customer_name || ''} onChange={e => setEditForm((f: any) => ({ ...f, customer_name: e.target.value }))} className="w-full px-2 py-1 rounded border border-blue-400 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                        : <span className="font-medium text-gray-900 dark:text-white">{r.customer_name || '—'}</span>}</td>
                      <td className="px-3 py-3">{editing
                        ? <input value={editForm.contact_number || ''} onChange={e => setEditForm((f: any) => ({ ...f, contact_number: e.target.value }))} className="w-full px-2 py-1 rounded border border-blue-400 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                        : <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{r.contact_number}</span>}</td>
                      <td className="px-3 py-3 hidden md:table-cell">{editing
                        ? <input value={editForm.order_number || ''} onChange={e => setEditForm((f: any) => ({ ...f, order_number: e.target.value }))} className="w-full px-2 py-1 rounded border border-blue-400 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                        : <span className="text-gray-600 dark:text-gray-400">{r.order_number || '—'}</span>}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden lg:table-cell">{r._name}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden sm:table-cell">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-3"><div className="flex items-center justify-end gap-1">
                        {editing ? (
                          <><button onClick={() => saveEdit(r.id)} className="p-1.5 rounded text-green-600 hover:bg-green-50"><Check className="h-4 w-4" /></button>
                            <button onClick={() => setEditId(null)} className="p-1.5 rounded text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button></>
                        ) : (
                          <><button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                            {expanded === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                            <button onClick={() => { setEditId(r.id); setEditForm({ customer_name: r.customer_name || '', contact_number: r.contact_number || '', order_number: r.order_number || '' }) }}
                              className="p-1.5 rounded hover:bg-blue-50 text-blue-500"><Edit2 className="h-4 w-4" /></button>
                            <button onClick={() => deleteSingle(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 className="h-4 w-4" /></button></>
                        )}
                      </div></td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="border-b border-gray-100 dark:border-gray-700/50 bg-blue-50/20 dark:bg-blue-900/5">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            <div><span className="text-gray-400 block mb-0.5">Order #</span><span className="font-medium text-gray-900 dark:text-white">{r.order_number || '—'}</span></div>
                            <div><span className="text-gray-400 block mb-0.5">Partner</span><Badge variant="default">{r.delivery_partner || '—'}</Badge></div>
                            <div><span className="text-gray-400 block mb-0.5">Restaurant</span><span className="font-medium text-gray-900 dark:text-white">{r.restaurant || '—'}</span></div>
                            <div><span className="text-gray-400 block mb-0.5">OCR Mode</span><Badge variant={r.ocr_mode === 'ai' ? 'info' : 'default'}>{r.ocr_mode || '—'}</Badge></div>
                            <div><span className="text-gray-400 block mb-0.5">Captured By</span><span className="font-medium text-gray-900 dark:text-white">{r._name}</span></div>
                            <div><span className="text-gray-400 block mb-0.5">Captured At</span><span className="font-medium text-gray-900 dark:text-white">{formatDateTime(r.created_at)}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-500">Page {page} of {pages} · {total} total</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹ Prev</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= pages}>Next ›</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
