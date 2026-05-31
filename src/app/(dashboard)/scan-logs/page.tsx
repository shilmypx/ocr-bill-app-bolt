'use client'
import { useState, useEffect, useRef } from 'react'
import { Activity, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/utils'
import type { ScanLog } from '@/types'

const PAGE_SIZE = 50

export default function ScanLogsPage() {
  const { isAdmin } = useAuth()
  const [logs, setLogs] = useState<ScanLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')
  const triggerRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) return

        let q = supabase
          .from('scan_logs')
          .select('*, profiles!scan_logs_user_id_fkey(full_name)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

        if (!isAdmin) q = q.eq('user_id', uid)
        if (filter !== 'all') q = q.eq('status', filter)

        const { data, count, error } = await q
        if (error) {
          // If FK join fails, retry without join
          let q2 = supabase
            .from('scan_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
          if (!isAdmin) q2 = q2.eq('user_id', uid)
          if (filter !== 'all') q2 = q2.eq('status', filter)
          const { data: d2, count: c2 } = await q2
          if (cancelled) return
          setLogs((d2 ?? []) as ScanLog[])
          setTotal(c2 ?? 0)
        } else {
          if (cancelled) return
          setLogs((data ?? []) as ScanLog[])
          setTotal(count ?? 0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, page, filter, triggerRef.current])

  const successCount = logs.filter(l => l.status === 'success').length
  const failedCount  = logs.filter(l => l.status === 'failed').length
  const avgTime = logs.length > 0
    ? Math.round(logs.reduce((s, l) => s + (l.processing_time_ms || 0), 0) / logs.length)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scan Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} scan attempts</p>
        </div>
        <Button variant="outline" onClick={() => { triggerRef.current++; setLogs([]) }} loading={loading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 border bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="h-5 w-5" /><span className="text-2xl font-bold">{successCount}</span>
          </div>
          <p className="text-xs text-green-600 mt-0.5">Successful</p>
        </div>
        <div className="rounded-xl p-4 border bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <XCircle className="h-5 w-5" /><span className="text-2xl font-bold">{failedCount}</span>
          </div>
          <p className="text-xs text-red-600 mt-0.5">Failed</p>
        </div>
        <div className="rounded-xl p-4 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Clock className="h-5 w-5" /><span className="text-2xl font-bold">{avgTime}</span>
          </div>
          <p className="text-xs text-blue-600 mt-0.5">Avg ms</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(['all', 'success', 'failed'] as const).map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(1) }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
            {f}
          </button>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mode</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Confidence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Time (ms)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Scanned At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(8).fill(0).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                  {Array(6).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                  ))}
                </tr>
              )) : logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No scan logs found
                </td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                  <td className="px-4 py-3">
                    <Badge variant={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}>
                      {log.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{log.source}</td>
                  <td className="px-4 py-3"><Badge variant={log.ocr_mode === 'ai' ? 'info' : 'default'}>{log.ocr_mode}</Badge></td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {log.ocr_confidence ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full max-w-16">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, log.ocr_confidence)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{log.ocr_confidence.toFixed(0)}%</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell font-mono text-xs">{log.processing_time_ms || '—'}</td>
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
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹ Prev</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / PAGE_SIZE)}>Next ›</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
