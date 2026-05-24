'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Search, Download, ChevronDown, ChevronUp, Trash2, Edit2, Check, X, RefreshCw, Filter } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import { formatDateTime } from '@/lib/utils'
import type { BillRecord } from '@/types'
import * as XLSX from 'xlsx'

const PAGE_SIZE = 20

type ProfileJoin = { full_name: string | null; email: string | null }

export function RecordsTable() {
  const { user, isAdmin } = useAuth()
  const [records, setRecords] = useState<(BillRecord & { profiles?: ProfileJoin | null })[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [users, setUsers] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<BillRecord>>({})
  const [showFilters, setShowFilters] = useState(false)

  // Load users for admin filter
  useEffect(() => {
    if (isAdmin) {
      supabase.from('profiles').select('id, full_name, email').then(({ data }) => setUsers(data ?? []))
    }
  }, [isAdmin])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('bill_records')
      .select('*, profiles(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (!isAdmin) q = q.eq('user_id', user!.id)
    if (isAdmin && userFilter) q = q.eq('user_id', userFilter)
    if (search) q = q.or(`customer_name.ilike.%${search}%,contact_number.ilike.%${search}%,bill_number.ilike.%${search}%`)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')
    const { data, count } = await q
    setRecords((data ?? []) as (BillRecord & { profiles?: ProfileJoin | null })[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [user, isAdmin, page, search, dateFrom, dateTo, userFilter])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const deleteRecord = async (id: string, contact: string) => {
    if (!confirm('Delete this record?')) return
    const { error } = await supabase.from('bill_records').delete().eq('id', id)
    if (!error) {
      await logAudit('DELETE', 'Bill Records', `Deleted bill for ${contact}`, { id })
      toast('success', 'Record deleted')
      fetchRecords()
    }
  }

  const startEdit = (r: BillRecord) => {
    setEditId(r.id)
    setEditForm({ customer_name: r.customer_name, contact_number: r.contact_number, bill_number: r.bill_number })
  }

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from('bill_records').update(editForm).eq('id', id)
    if (!error) {
      await logAudit('EDIT', 'Bill Records', `Edited bill ${id}`, editForm)
      toast('success', 'Record updated')
      setEditId(null)
      fetchRecords()
    } else toast('error', 'Update failed')
  }

  const exportUnique = async () => {
    const { data } = await supabase.from('bill_records').select('bill_number,customer_name,contact_number').eq('status', 'success')
    const seen = new Set<string>()
    const unique = (data ?? []).filter(r => { if (seen.has(r.contact_number)) return false; seen.add(r.contact_number); return true })
    const ws = XLSX.utils.json_to_sheet(unique.map(r => ({
      'Bill Number': r.bill_number || '',
      'Customer Name': r.customer_name || '',
      'Contact Number': { t: 's', v: String(r.contact_number) },
    })))
    const wb = XLSX.utils.book_new()
    // Force text format for contact numbers to prevent scientific notation
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: 2 })]
      if (cell) { cell.t = 's'; cell.z = '@' }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Unique Contacts')
    XLSX.writeFile(wb, `unique_contacts_${new Date().toISOString().slice(0, 10)}.xlsx`)
    await logAudit('EXPORT', 'Bill Records', `Exported ${unique.length} unique contacts`)
  }

  const exportAll = async () => {
    let q = supabase.from('bill_records').select('*, profiles!bill_records_user_id_fkey(full_name)').order('created_at', { ascending: false })
    if (!isAdmin) q = q.eq('user_id', user!.id)
    const { data } = await q
    const rows = ((data ?? []) as (BillRecord & { profiles?: ProfileJoin | null })[]).map(r => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        'Customer Name': r.customer_name || '', 'Contact Number': String(r.contact_number),
        'Bill Number': r.bill_number || '', 'Captured By': profile?.full_name || '',
        'Captured Date': r.created_at ? new Date(r.created_at).toLocaleString() : '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'All Records')
    XLSX.writeFile(wb, `bill_records_${new Date().toISOString().slice(0, 10)}.xlsx`)
    await logAudit('EXPORT', 'Bill Records', `Exported ${rows.length} records`)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{total.toLocaleString()} records</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)}>
            <Filter className="h-4 w-4" /> Filters
          </Button>
          <Button variant="outline" size="sm" onClick={exportUnique}><Download className="h-4 w-4" /> Unique</Button>
          <Button variant="outline" size="sm" onClick={exportAll}><Download className="h-4 w-4" /> All</Button>
          <Button variant="outline" size="sm" onClick={fetchRecords} loading={loading}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Search always visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search name, contact, bill number..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <Card>
          <CardContent className="py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Captured From</label>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Captured To</label>
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
              </div>
              {isAdmin && (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Filter by User</label>
                  <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1) }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="">All Users</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <button onClick={() => { setDateFrom(''); setDateTo(''); setUserFilter(''); setPage(1) }}
                  className="text-xs text-blue-600 hover:underline">Clear filters</button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-0">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Bill #</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Captured By</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Date</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(5).fill(0).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                  {Array(6).fill(0).map((_, j) => (
                    <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                  ))}
                </tr>
              )) : records.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No records found</td></tr>
              ) : records.map(record => {
                const profile = Array.isArray(record.profiles) ? record.profiles[0] : record.profiles
                const isEditing = editId === record.id
                return (
                  <React.Fragment key={record.id}>
                    <tr className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input value={editForm.customer_name || ''} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                            className="w-full px-2 py-1 rounded border border-blue-400 text-sm bg-white dark:bg-gray-800" />
                        ) : (
                          <span className="font-medium text-gray-900 dark:text-white text-sm">{record.customer_name || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input value={editForm.contact_number || ''} onChange={e => setEditForm(f => ({ ...f, contact_number: e.target.value }))}
                            className="w-full px-2 py-1 rounded border border-blue-400 text-sm font-mono bg-white dark:bg-gray-800" />
                        ) : (
                          <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{record.contact_number}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {isEditing ? (
                          <input value={editForm.bill_number || ''} onChange={e => setEditForm(f => ({ ...f, bill_number: e.target.value }))}
                            className="w-full px-2 py-1 rounded border border-blue-400 text-sm bg-white dark:bg-gray-800" />
                        ) : (
                          <span className="text-gray-600 dark:text-gray-400 text-sm">{record.bill_number || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-xs text-gray-500">{profile?.full_name || '—'}</td>
                      <td className="px-3 py-3 hidden sm:table-cell text-xs text-gray-500">{record.created_at ? new Date(record.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEdit(record.id)} className="p-1.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditId(null)} className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><X className="h-4 w-4" /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setExpanded(expanded === record.id ? null : record.id)}
                                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                                {expanded === record.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                              <button onClick={() => startEdit(record)} className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500"><Edit2 className="h-4 w-4" /></button>
                              <button onClick={() => deleteRecord(record.id, record.contact_number)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="h-4 w-4" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === record.id && (
                      <tr className="border-b border-gray-100 dark:border-gray-700/50 bg-blue-50/30 dark:bg-blue-900/5">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            <div><span className="text-gray-400 block">Bill #</span><span className="font-medium text-gray-900 dark:text-white">{record.bill_number || '—'}</span></div>
                            <div><span className="text-gray-400 block">Captured By</span><span className="font-medium text-gray-900 dark:text-white">{profile?.full_name || '—'}</span></div>
                            <div><span className="text-gray-400 block">Captured At</span><span className="font-medium text-gray-900 dark:text-white">{formatDateTime(record.created_at)}</span></div>
                            <div><span className="text-gray-400 block">Source</span><Badge variant="default">{record.source || '—'}</Badge></div>
                            <div><span className="text-gray-400 block">OCR Mode</span><Badge variant={record.ocr_mode === 'ai' ? 'info' : 'default'}>{record.ocr_mode || '—'}</Badge></div>
                            <div><span className="text-gray-400 block">Confidence</span><span className="font-medium text-gray-900 dark:text-white">{record.ocr_confidence ? `${record.ocr_confidence.toFixed(0)}%` : '—'}</span></div>
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

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-500">Page {page} of {totalPages} · {total} records</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹ Prev</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next ›</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
