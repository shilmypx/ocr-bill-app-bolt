'use client'
import { useEffect, useState, useCallback } from 'react'
import { FileText, Users, Copy, AlertCircle, TrendingUp, Calendar, Clock, BarChart2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatNumber } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Stats {
  total_bills: number
  unique_contacts: number
  duplicate_count?: number
  today_scans: number
  this_week: number
  this_month: number
}

interface PartnerStat { partner: string; count: number }
interface UserStat { name: string; count: number }

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444']

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string
}) {
  return (
    <div className={`rounded-xl p-4 border ${color} flex items-start gap-3`}>
      <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold truncate">{formatNumber(Number(value))}</p>
        <p className="text-xs font-medium opacity-80">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

type BillRecordWithProfile = {
  delivery_partner?: string | null
  profiles?: { full_name: string | null } | null
}

export function DashboardStats() {
  const { user, isAdmin } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [partnerStats, setPartnerStats] = useState<PartnerStat[]>([])
  const [userStats, setUserStats] = useState<UserStat[]>([])
  const [failedScans, setFailedScans] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      if (isAdmin) {
        const { data } = await supabase.rpc('get_dashboard_stats', {
          p_user_id: user!.id,
          p_is_admin: true
        })
        setStats(data as Stats)

        // Partner stats
        const { data: ps } = await supabase
          .from('bill_records')
          .select('delivery_partner')
          .eq('status', 'success')
          .neq('delivery_partner', '')
        const counts: Record<string, number> = {}
        ps?.forEach(r => { if (r.delivery_partner) counts[r.delivery_partner] = (counts[r.delivery_partner] || 0) + 1 })
        setPartnerStats(Object.entries(counts).map(([partner, count]) => ({ partner, count })).sort((a, b) => b.count - a.count).slice(0, 5))

        // User stats
        const { data: us } = await supabase
          .from('bill_records')
          .select('profiles!bill_records_user_id_fkey(full_name)')
          .eq('status', 'success')
        const uc: Record<string, number> = {}
        ;(us as BillRecordWithProfile[] | null)?.forEach(r => {
          const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
          const name = profile?.full_name || 'Unknown'
          uc[name] = (uc[name] || 0) + 1
        })
        setUserStats(Object.entries(uc).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5))

        // Failed scans
        const { count } = await supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('status', 'failed')
        setFailedScans(count ?? 0)
      } else {
        const { data } = await supabase.rpc('get_dashboard_stats', {
          p_user_id: user!.id,
          p_is_admin: false
        })
        setStats(data as Stats)
      }
    } catch (err) {
      console.error('Stats fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [isAdmin, user])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (loading) return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Bills Scanned" value={stats?.total_bills ?? 0}
          icon={FileText} color="bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" />
        <StatCard label="Unique Contacts" value={stats?.unique_contacts ?? 0}
          icon={Users} color="bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400" />
        <StatCard label="Today's Scans" value={stats?.today_scans ?? 0}
          icon={Calendar} color="bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400" />
        <StatCard label="This Month" value={stats?.this_month ?? 0}
          icon={TrendingUp} color="bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400" />
      </div>

      {isAdmin && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Duplicate Records" value={stats?.duplicate_count ?? 0}
            icon={Copy} color="bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400" />
          <StatCard label="Failed OCR Scans" value={failedScans}
            icon={AlertCircle} color="bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400" />
          <StatCard label="This Week" value={stats?.this_week ?? 0}
            icon={Clock} color="bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-400" />
          <StatCard label="Avg Daily (Month)" value={Math.round((stats?.this_month ?? 0) / 30)}
            icon={BarChart2} color="bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/20 dark:border-teal-800 dark:text-teal-400" />
        </div>
      )}

      {/* Charts */}
      {isAdmin && (partnerStats.length > 0 || userStats.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {partnerStats.length > 0 && (
            <Card>
              <CardHeader>
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Top Delivery Partners</span>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={partnerStats} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="partner" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {partnerStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {userStats.length > 0 && (
            <Card>
              <CardHeader>
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Top Scanners</span>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {userStats.map((u, i) => (
                    <div key={u.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium truncate text-gray-900 dark:text-white">{u.name}</span>
                          <span className="text-xs text-gray-500">{u.count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${(u.count / userStats[0].count) * 100}%`,
                            backgroundColor: COLORS[i % COLORS.length]
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={fetchStats} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
          <RefreshCw className="h-3 w-3" /> Refresh stats
        </button>
      </div>
    </div>
  )
}
