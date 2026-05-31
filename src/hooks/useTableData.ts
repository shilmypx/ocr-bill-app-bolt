/**
 * Shared hook for reliable table data loading.
 * Uses fresh session auth on every load — avoids stale context user issues
 * that cause tables to stop loading after navigation or filter changes.
 */
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface UseTableDataOptions {
  /**
   * Build the Supabase query given the current user ID and admin flag.
   * Return null to skip (e.g. if deps aren't ready).
   */
  buildQuery: (uid: string, isAdmin: boolean) => Promise<{ data: any[] | null; count?: number | null; error?: any }>
  /** Re-run whenever any value in this array changes */
  deps: any[]
}

export function useTableData({ buildQuery, deps }: UseTableDataOptions) {
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const runId = useRef(0) // prevents stale results from racing fetches

  // Trigger a manual refresh
  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)

  useEffect(() => {
    let cancelled = false
    const id = ++runId.current

    async function run() {
      setLoading(true)
      setError('')

      try {
        // Always fetch fresh session — avoids stale auth from React context
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) { if (!cancelled) { setError('Not authenticated'); setLoading(false) }; return }

        // Check admin status from DB (not context, which can be stale)
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', uid).single()
        const isAdmin = profile?.role === 'admin'

        const result = await buildQuery(uid, isAdmin)

        if (cancelled || runId.current !== id) return // stale result

        if (result.error) throw new Error(result.error.message || result.error.code || 'Query failed')

        setRows(result.data ?? [])
        setTotal(result.count ?? result.data?.length ?? 0)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { rows, total, loading, error, refresh, setRows }
}
