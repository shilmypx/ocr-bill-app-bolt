'use client'
import { useEffect, useState, useCallback } from 'react'
import { FileText, Users, Copy, TrendingUp, Calendar, RefreshCw, BarChart2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

function StatCard({ label, value, icon: Icon, cls }: { label: string; value: number; icon: any; cls: string }) {
  return (
    <div className={`rounded-xl p-4 border flex items-start gap-3 ${cls}`}>
      <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 shrink-0"><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs font-medium opacity-80 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export function DashboardStats() {
  const { user, isAdmin } = useAuth()
  const [stats, setStats] = useState({ total: 0, unique_contacts: 0, today: 0, this_month: 0, duplicate_count: 0 })
  const [partners, setPartners] = useState<{ partner: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true); setErr('')
    try {
      const { data, error } = await supabase.rpc('get_user_bill_stats', {
        p_user_id: user.id, p_is_admin: isAdmin
      })
      if (error) throw error
      setStats(data || { total: 0, unique_contacts: 0, today: 0, this_month: 0, duplicate_count: 0 })

      if (isAdmin) {
        const { data: pr } = await supabase
          .from('bill_records')
          .select('delivery_partner')
          .eq('status', 'success')
          .not('delivery_partner', 'is', null)
          .neq('delivery_partner', '')
        const cnt: Record<string, number> = {}
        ;(pr ?? []).forEach((r: any) => { if (r.delivery_partner) cnt[r.delivery_partner] = (cnt[r.delivery_partner]||0)+1 })
        setPartners(Object.entries(cnt).map(([partner,count])=>({partner,count})).sort((a,b)=>b.count-a.count).slice(0,5))
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load stats')
    } finally { setLoading(false) }
  }, [user?.id, isAdmin])

  // Re-fetch when user changes OR when component becomes visible
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
        {Array(4).fill(0).map((_,i) => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />)}
      </div>
    </div>
  )

  if (err) return (
    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
      <AlertCircle className="h-4 w-4 shrink-0" /> {err}
      <button onClick={load} className="ml-auto underline text-xs">Retry</button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Bills" value={stats.total} icon={FileText} cls="bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" />
        <StatCard label="Unique Contacts" value={stats.unique_contacts} icon={Users} cls="bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400" />
        <StatCard label="Today" value={stats.today} icon={Calendar} cls="bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400" />
        <StatCard label="This Month" value={stats.this_month} icon={TrendingUp} cls="bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400" />
      </div>
      {isAdmin && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Duplicate Contacts" value={stats.duplicate_count} icon={Copy} cls="bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400" />
          <StatCard label="Avg Daily (Month)" value={Math.round(stats.this_month / Math.max(new Date().getDate(),1))} icon={BarChart2} cls="bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-400" />
        </div>
      )}
      {isAdmin && partners.length > 0 && (
        <Card>
          <CardHeader><span className="font-semibold text-gray-900 dark:text-white text-sm">Top Delivery Partners</span></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {partners.map((p,i) => (
                <div key={p.partner} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-4">{i+1}</span>
                  <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{p.partner}</span>
                  <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{width:`${(p.count/partners[0].count)*100}%`}} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  )
}
