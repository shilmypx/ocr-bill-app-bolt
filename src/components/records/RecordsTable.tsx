'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Download, Edit2, Trash2, ChevronDown, ChevronUp, RefreshCw, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Badge } from '@/components/ui/Input'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Card'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { exportUniqueContacts, exportFullRecords } from '@/lib/export'
import { logAudit } from '@/lib/audit'
import { formatDateTime, formatDate } from '@/lib/utils'
import type { BillRecord } from '@/types'

const PAGE_SIZE = 25
const ALL_EXPORT_COLS = ['Customer Name','Contact Number','Bill Date','Bill Number','Partner','Restaurant','Address','Source','OCR Mode','OCR Confidence','Status','Captured By','Captured Date']
const PARTNERS = ['', 'Talabat', 'HungerStation', 'Jahez', 'Careem', 'Noon Food', 'Marsool', 'Zomato', 'Other']

export function RecordsTable() {
  const { user, isAdmin } = useAuth()
  const [records, setRecords] = useState<BillRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportCols, setExportCols] = useState<string[]>(ALL_EXPORT_COLS)
  const [editRecord, setEditRecord] = useState<BillRecord | null>(null)
  const [filters, setFilters] = useState({
    search: '', partner: '', bill_date_from: '', bill_date_to: '',
    captured_date_from: '', captured_date_to: '', captured_by: ''
  })
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([])

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return
    const { data } = await supabase.from('profiles').select('id, full_name')
    setUsers(data ?? [])
  }, [isAdmin])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('bill_records')
      .select('*, profiles!bill_records_user_id_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (!isAdmin) q = q.eq('user_id', user!.id)
    if (filters.search) {
      q = q.or(`customer_name.ilike.%${filters.search}%,contact_number.ilike.%${filters.search}%,bill_number.ilike.%${filters.search}%`)
    }
    if (filters.partner) q = q.eq('delivery_partner', filters.partner)
    if (filters.bill_date_from) q = q.gte('bill_date', filters.bill_date_from)
    if (filters.bill_date_to) q = q.lte('bill_date', filters.bill_date_to)
    if (filters.captured_date_from) q = q.gte('created_at', filters.captured_date_from)
    if (filters.captured_date_to) q = q.lte('created_at', filters.captured_date_to + 'T23:59:59')
    if (isAdmin && filters.captured_by) q = q.eq('user_id', filters.captured_by)
    const { data, count } = await q
    setRecords(data ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filters, isAdmin, user])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record?')) return
    await supabase.from('bill_records').delete().eq('id', id)
    await logAudit('DELETE', 'Bill Records', `Deleted bill record ${id}`)
    toast('success', 'Record deleted')
    fetchRecords()
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} records?`)) return
    await supabase.from('bill_records').delete().in('id', Array.from(selected))
    await logAudit('BULK_DELETE', 'Bill Records', `Bulk deleted ${selected.size} records`)
    toast('success', `${selected.size} records deleted`)
    setSelected(new Set())
    fetchRecords()
  }

  const handleEdit = async () => {
    if (!editRecord) return
    const { error } = await supabase.from('bill_records').update({
      customer_name: editRecord.customer_name,
      contact_number: editRecord.contact_number,
      bill_number: editRecord.bill_number,
      bill_date: editRecord.bill_date,
      restaurant: editRecord.restaurant,
      address: editRecord.address,
      delivery_partner: editRecord.delivery_partner,
    }).eq('id', editRecord.id)
    if (error) { toast('error', 'Failed to update'); return }
    await logAudit('EDIT', 'Bill Records', `Edited bill record ${editRecord.id}`)
    toast('success', 'Record updated')
    setEditRecord(null)
    fetchRecords()
  }

  const handleExportUnique = async () => {
    // Fetch all for export
    let q = supabase.from('bill_records').select('*').eq('status', 'success')
    if (!isAdmin) q = q.eq('user_id', user!.id)
    const { data } = await q
    exportUniqueContacts(data ?? [])
    await logAudit('EXPORT', 'Bill Records', 'Exported unique contacts')
    toast('success', 'Unique contacts exported')
  }

  const handleExportFull = async () => {
    let q = supabase.from('bill_records').select('*, profiles!bill_records_user_id_fkey(full_name, email)')
    if (!isAdmin) q = q.eq('user_id', user!.id)
    if (filters.partner) q = q.eq('delivery_partner', filters.partner)
    const { data } = await q
    exportFullRecords(data ?? [], exportCols)
    await logAudit('EXPORT', 'Bill Records', `Exported ${data?.length} records with columns: ${exportCols.join(', ')}`)
    toast('success', 'Records exported')
    setShowExportModal(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search name, phone, bill #..."
                value={filters.search}
                onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }}
              />
            </div>
            <Select
              options={[{ value: '', label: 'All Partners' }, ...PARTNERS.filter(p => p).map(p => ({ value: p, label: p }))]}
              value={filters.partner}
              onChange={e => { setFilters(f => ({ ...f, partner: e.target.value })); setPage(1) }}
            />
            <Input type="date" placeholder="From date"
              value={filters.captured_date_from}
              onChange={e => { setFilters(f => ({ ...f, captured_date_from: e.target.value })); setPage(1) }} />
            <Input type="date" placeholder="To date"
              value={filters.captured_date_to}
              onChange={e => { setFilters(f => ({ ...f, captured_date_to: e.target.value })); setPage(1) }} />
            {isAdmin && (
              <Select
                options={[{ value: '', label: 'All Users' }, ...users.map(u => ({ value: u.id, label: u.full_name }))]}
                value={filters.captured_by}
                onChange={e => { setFilters(f => ({ ...f, captured_by: e.target.value })); setPage(1) }}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {total.toLocaleString()} records
          </span>
          {selected.size > 0 && isAdmin && (
            <Button variant="danger" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete ({selected.size})
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchRecords}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportUnique}>
            <Download className="h-4 w-4" /> Unique Contacts
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowExportModal(true)}>
            <Download className="h-4 w-4" /> Full Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {isAdmin && (
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox"
                      checked={selected.size === records.length && records.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(records.map(r => r.id)) : new Set())}
                      className="rounded" />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Customer Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Contact Number</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">Bill Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">Partner</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">Captured By</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">Captured Date</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    {Array(7).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No records found
                  </td>
                </tr>
              ) : records.map(record => (
                <React.Fragment key={record.id}>
                  <tr
                    className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(record.id)}
                          onChange={() => toggleSelect(record.id)} className="rounded" />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {record.customer_name || <span className="text-gray-400 italic">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono">{record.contact_number}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">{record.bill_date || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {record.delivery_partner ? (
                        <Badge variant="info">{record.delivery_partner}</Badge>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                      {record.profiles?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell text-xs">
                      {formatDateTime(record.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                          {expandedId === record.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setEditRecord(record)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(record.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === record.id && (
                    <tr key={`${record.id}-expanded`} className="bg-gray-50 dark:bg-gray-700/20">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-600 dark:text-gray-400">
                          <div><span className="font-medium text-gray-800 dark:text-gray-200">Bill #:</span> {record.bill_number || '—'}</div>
                          <div><span className="font-medium text-gray-800 dark:text-gray-200">Restaurant:</span> {record.restaurant || '—'}</div>
                          <div className="col-span-2 sm:col-span-1"><span className="font-medium text-gray-800 dark:text-gray-200">Address:</span> {record.address || '—'}</div>
                          <div><span className="font-medium text-gray-800 dark:text-gray-200">Source:</span> <Badge>{record.source}</Badge></div>
                          <div><span className="font-medium text-gray-800 dark:text-gray-200">OCR Confidence:</span> {record.ocr_confidence?.toFixed(1)}%</div>
                          <div><span className="font-medium text-gray-800 dark:text-gray-200">Status:</span> <Badge variant={record.status === 'success' ? 'success' : 'error'}>{record.status}</Badge></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Edit Modal */}
      <Modal open={!!editRecord} onClose={() => setEditRecord(null)} title="Edit Record">
        {editRecord && (
          <div className="space-y-3">
            <Input label="Customer Name" value={editRecord.customer_name}
              onChange={e => setEditRecord(r => r ? { ...r, customer_name: e.target.value } : null)} />
            <Input label="Contact Number *" value={editRecord.contact_number}
              onChange={e => setEditRecord(r => r ? { ...r, contact_number: e.target.value } : null)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bill Number" value={editRecord.bill_number}
                onChange={e => setEditRecord(r => r ? { ...r, bill_number: e.target.value } : null)} />
              <Input label="Bill Date" value={editRecord.bill_date}
                onChange={e => setEditRecord(r => r ? { ...r, bill_date: e.target.value } : null)} />
            </div>
            <Input label="Restaurant" value={editRecord.restaurant}
              onChange={e => setEditRecord(r => r ? { ...r, restaurant: e.target.value } : null)} />
            <Input label="Address" value={editRecord.address}
              onChange={e => setEditRecord(r => r ? { ...r, address: e.target.value } : null)} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditRecord(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleEdit} className="flex-1">Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Export Modal */}
      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title="Export Records">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Select columns to export:</p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_EXPORT_COLS.map(col => (
              <label key={col} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox"
                  checked={exportCols.includes(col)}
                  onChange={e => setExportCols(prev => e.target.checked ? [...prev, col] : prev.filter(c => c !== col))}
                  className="rounded" />
                {col}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setExportCols(ALL_EXPORT_COLS)} size="sm">Select All</Button>
            <Button variant="outline" onClick={() => setExportCols([])} size="sm">Clear</Button>
          </div>
          <Button onClick={handleExportFull} className="w-full" disabled={exportCols.length === 0}>
            <Download className="h-4 w-4" /> Export to Excel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
