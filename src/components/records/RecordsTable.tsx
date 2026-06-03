'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Download, ChevronDown, ChevronUp, Trash2, Edit2, Check, X, RefreshCw, Filter, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/utils'
import * as XLSX from 'xlsx'

const PAGE_SIZE = 25

export function RecordsTable() {
  const { user, isAdmin } = useAuth()
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(true)
  const [fetchErr, setFetchErr] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [showFilters, setShowFilters] = useState(false)
  const triggerRef = useRef(0) // increment to force reload

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('profiles').select('id,full_name,email')
      .then(({ data }) => setAllUsers(data ?? []))
  }, [isAdmin])

  // Single useEffect with all deps — reliable on filter change and navigation
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setBusy(true)
      setFetchErr('')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id || user?.id
        if (!uid) { if (!cancelled) setFetchErr('Not authenticated'); return }

        let q = supabase
          .from('bill_records')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

        if (!isAdmin) q = q.eq('user_id', uid)
        else if (userFilter) q = q.eq('user_id', userFilter)

        if (search.trim()) {
          q = q.or(
            `customer_name.ilike.%${search.trim()}%,` +
            `contact_number.ilike.%${search.trim()}%,` +
            `order_number.ilike.%${search.trim()}%`
          )
        }
        if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00Z')
        if (dateTo)   q = q.lte('created_at', dateTo   + 'T23:59:59Z')

        const { data: bills, count, error } = await q
        if (error) throw new Error(error.message)
        if (cancelled) return

        // Enrich with profile names
        const uids = Array.from(new Set((bills ?? []).map((b: any) => b.user_id).filter(Boolean)))
        const nameMap: Record<string, string> = {}
        if (uids.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id,full_name,email').in('id', uids)
          ;(profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.email || 'Unknown' })
        }
        if (cancelled) return

        setRows((bills ?? []).map((b: any) => ({ ...b, _name: nameMap[b.user_id] || '—' })))
        setTotal(count ?? 0)
      } catch (e: any) {
        if (!cancelled) setFetchErr(e?.message || 'Failed to load records')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    run()
    return () => { cancelled = true }
  // triggerRef.current forces manual refresh without changing other deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, page, search, dateFrom, dateTo, userFilter, triggerRef.current])

  const reload = useCallback(() => { triggerRef.current += 1; setRows([]); }, [])

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this record?')) return
    const { error } = await supabase.from('bill_records').delete().eq('id', id)
    if (error) { toast('error', error.message); return }
    toast('success', 'Deleted')
    reload()
  }

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from('bill_records').update({
      customer_name: editForm.customer_name,
      contact_number: editForm.contact_number,
      order_number: editForm.order_number,
    }).eq('id', id)
    if (error) { toast('error', error.message); return }
    toast('success', 'Updated')
    setEditId(null)
    reload()
  }

  const exportUnique = async () => {
    let q = supabase.from('bill_records').select('order_number,customer_name,contact_number').eq('status', 'success')
    if (!isAdmin) q = q.eq('user_id', user!.id)
    const { data } = await q
    const seen = new Set<string>()
    const unique = (data ?? []).filter((r: any) => { if (seen.has(r.contact_number)) return false; seen.add(r.contact_number); return true })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(unique.map((r: any) => ({
      'Order Number': r.order_number || '', 'Customer Name': r.customer_name || '',
      'Contact Number': String(r.contact_number),
    })))
    XLSX.utils.book_append_sheet(wb, ws, 'Unique Contacts')
    XLSX.writeFile(wb, `unique_contacts_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportAll = async () => {
    let q = supabase.from('bill_records').select('*').order('created_at', { ascending: false })
    if (!isAdmin) q = q.eq('user_id', user!.id)
    const { data } = await q
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet((data ?? []).map((r: any) => ({
      'Customer Name': r.customer_name || '', 'Contact Number': String(r.contact_number),
      'Order Number': r.order_number || '', 'Captured Date': r.created_at ? new Date(r.created_at).toLocaleString() : '',
    })))
    XLSX.utils.book_append_sheet(wb, ws, 'Records')
    XLSX.writeFile(wb, `bill_records_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{busy ? '...' : `${total.toLocaleString()} records`}</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(s => !s)}><Filter className="h-4 w-4" />Filters</Button>
          <Button variant="outline" size="sm" onClick={exportUnique}><Download className="h-4 w-4" />Unique</Button>
          <Button variant="outline" size="sm" onClick={exportAll}><Download className="h-4 w-4" />All</Button>
          <Button variant="outline" size="sm" onClick={reload} loading={busy}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
          placeholder="Search name, contact, bill number..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {showFilters && (
        <Card><CardContent className="py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">From Date</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">To Date</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
            {isAdmin && (
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-500 block mb-1">Captured By</label>
                <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                  <option value="">All Users</option>
                  {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <button onClick={() => { setDateFrom(''); setDateTo(''); setUserFilter(''); setPage(1) }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear filters</button>
            </div>
          </div>
        </CardContent></Card>
      )}

      {fetchErr && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{fetchErr}</span>
          <button onClick={reload} className="underline text-xs">Retry</button>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Order #</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Captured By</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Date</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {busy ? Array(5).fill(0).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                  {Array(6).fill(0).map((_, j) => <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>)}
                </tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center">
                  <div className="text-3xl mb-2">📋</div>
                  <p className="text-gray-400 text-sm">{fetchErr ? 'Error loading' : 'No records found'}</p>
                  {!search && !dateFrom && !fetchErr && <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Capture bills to see them here</p>}
                </td></tr>
              ) : rows.map(r => {
                const editing = editId === r.id
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                      <td className="px-3 py-3">
                        {editing ? <input value={editForm.customer_name || ''} onChange={e => setEditForm((f: any) => ({ ...f, customer_name: e.target.value }))} className="w-full px-2 py-1 rounded border border-blue-400 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                          : <span className="font-medium text-gray-900 dark:text-white">{r.customer_name || '—'}</span>}
                      </td>
                      <td className="px-3 py-3">
                        {editing ? <input value={editForm.contact_number || ''} onChange={e => setEditForm((f: any) => ({ ...f, contact_number: e.target.value }))} className="w-full px-2 py-1 rounded border border-blue-400 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                          : <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{r.contact_number}</span>}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {editing ? <input value={editForm.order_number || ''} onChange={e => setEditForm((f: any) => ({ ...f, order_number: e.target.value }))} className="w-full px-2 py-1 rounded border border-blue-400 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                          : <span className="text-gray-600 dark:text-gray-400">{r.order_number || '—'}</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden lg:table-cell">{r._name}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden sm:table-cell">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {editing ? <>
                            <button onClick={() => saveEdit(r.id)} className="p-1.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><Check className="h-4 w-4" /></button>
                            <button onClick={() => setEditId(null)} className="p-1.5 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><X className="h-4 w-4" /></button>
                          </> : <>
                            <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                              {expanded === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button onClick={() => { setEditId(r.id); setEditForm({ customer_name: r.customer_name || '', contact_number: r.contact_number || '', order_number: r.order_number || '' }) }}
                              className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500"><Edit2 className="h-4 w-4" /></button>
                            <button onClick={() => deleteRow(r.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="border-b border-gray-100 dark:border-gray-700/50 bg-blue-50/20 dark:bg-blue-900/5">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            <div><span className="text-gray-400 block mb-0.5">Order #</span><span className="font-medium text-gray-900 dark:text-white">{r.order_number || '—'}</span></div>
                            <div><span className="text-gray-400 block mb-0.5">Captured By</span><span className="font-medium text-gray-900 dark:text-white">{r._name}</span></div>
                            <div><span className="text-gray-400 block mb-0.5">Captured At</span><span className="font-medium text-gray-900 dark:text-white">{formatDateTime(r.created_at)}</span></div>
                            <div><span className="text-gray-400 block mb-0.5">Source</span><Badge variant="default">{r.source || '—'}</Badge></div>
                            <div><span className="text-gray-400 block mb-0.5">OCR Mode</span><Badge variant={r.ocr_mode === 'ai' ? 'info' : 'default'}>{r.ocr_mode || '—'}</Badge></div>
                            <div><span className="text-gray-400 block mb-0.5">Confidence</span><span className="font-medium text-gray-900 dark:text-white">{r.ocr_confidence ? `${Number(r.ocr_confidence).toFixed(0)}%` : '—'}</span></div>
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
