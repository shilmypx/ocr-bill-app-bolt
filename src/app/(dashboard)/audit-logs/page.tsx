'use client'
import { useState, useEffect, useCallback } from 'react'
import { Shield, Search, Download, RefreshCw, Filter } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
import type { AuditLog } from '@/types'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

const PAGE_SIZE = 50

const ACTION_COLORS: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  CREATE: 'success', DELETE: 'error', BULK_DELETE: 'error',
  EDIT: 'info', LOGIN: 'default', LOGOUT: 'default',
  EXPORT: 'info', APPROVE_USER: 'success', REVOKE_USER: 'warning',
  ACTIVATE_USER: 'success', DEACTIVATE_USER: 'error', CHANGE_ROLE: 'warning',
}

export default function AuditLogsPage() {
  const { isAdmin } = useAuth()
  const router = useRouter()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!isAdmin) { router.replace('/dashboard'); return }
  }, [isAdmin, router])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (search) q = q.or(`description.ilike.%${search}%,user_email.ilike.%${search}%,action_type.ilike.%${search}%`)
    if (actionFilter) q = q.eq('action_type', actionFilter)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')
    const { data, count } = await q
    setLogs(data ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search, actionFilter, dateFrom, dateTo])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleExport = async () => {
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false })
    const rows = (data ?? []).map(l => ({
      'Action': l.action_type, 'Module': l.module, 'User': l.user_email || '',
      'Description': l.description, 'IP Address': l.ip_address,
      'Timestamp': l.created_at ? new Date(l.created_at).toLocaleString() : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs')
    XLSX.writeFile(wb, `audit_logs_${new Date().toISOString().slice(0, 10)}.xlsx`)
    await logAudit('EXPORT', 'Audit Logs', `Exported ${data?.length} audit log entries`)
  }

  const ACTION_TYPES = ['LOGIN', 'LOGOUT', 'CREATE', 'EDIT', 'DELETE', 'BULK_DELETE', 'EXPORT', 'APPROVE_USER', 'REVOKE_USER', 'ACTIVATE_USER', 'DEACTIVATE_USER', 'CHANGE_ROLE']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} total events tracked</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs} loading={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search description, user, action..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <select
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1) }}>
              <option value="">All Actions</option>
              {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" placeholder="From"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
            <input type="date" placeholder="To"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Module</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">IP</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    {Array(5).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No audit logs found
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                  <td className="px-4 py-3">
                    <Badge variant={ACTION_COLORS[log.action_type] || 'default'}>
                      {log.action_type.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">{log.module}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-xs">{log.user_name || '—'}</p>
                      <p className="text-gray-400 text-xs">{log.user_email || ''}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs hidden lg:table-cell max-w-xs truncate">
                    {log.description}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono hidden lg:table-cell">{log.ip_address}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Math.ceil(total / PAGE_SIZE) > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / PAGE_SIZE)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
