'use client'
import { useState, useEffect, useCallback } from 'react'
import { Users, UserCheck, UserX, Shield, ShieldOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import { formatDateTime } from '@/lib/utils'
import type { Profile } from '@/types'
import { useRouter } from 'next/navigation'

export default function UsersPage() {
  const { isAdmin, user } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) { router.replace('/dashboard'); return }
  }, [isAdmin, router])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const approveUser = async (u: Profile) => {
    setActionLoading(u.id)
    const newApproved = !u.is_approved
    const { error } = await supabase.from('profiles').update({
      is_approved: newApproved,
      approved_by: newApproved ? user!.id : null,
      approved_at: newApproved ? new Date().toISOString() : null,
    }).eq('id', u.id)
    if (!error) {
      await logAudit(newApproved ? 'APPROVE_USER' : 'REVOKE_USER', 'Users', `${newApproved ? 'Approved' : 'Revoked'} user ${u.email}`, { target_user_id: u.id })
      toast('success', `User ${newApproved ? 'approved' : 'revoked'} successfully`)
      fetchUsers()
    }
    setActionLoading(null)
  }

  const toggleActive = async (u: Profile) => {
    setActionLoading(u.id + '_active')
    const newActive = !u.is_active
    const { error } = await supabase.from('profiles').update({ is_active: newActive }).eq('id', u.id)
    if (!error) {
      await logAudit(newActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'Users', `${newActive ? 'Activated' : 'Deactivated'} user ${u.email}`, { target_user_id: u.id })
      toast('success', `User ${newActive ? 'activated' : 'deactivated'}`)
      fetchUsers()
    }
    setActionLoading(null)
  }

  const makeAdmin = async (u: Profile) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin'
    setActionLoading(u.id + '_role')
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', u.id)
    if (!error) {
      await logAudit('CHANGE_ROLE', 'Users', `Changed ${u.email} role to ${newRole}`, { target_user_id: u.id, new_role: newRole })
      toast('success', `Role updated to ${newRole}`)
      fetchUsers()
    }
    setActionLoading(null)
  }

  const pendingUsers = users.filter(u => !u.is_approved)
  const allUsers = users

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} total users · {pendingUsers.length} pending approval</p>
        </div>
        <Button variant="outline" onClick={fetchUsers} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {pendingUsers.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <span className="font-semibold text-gray-900 dark:text-white">⏳ Pending Approval ({pendingUsers.length})</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm font-bold text-amber-700 dark:text-amber-400 shrink-0">
                      {(u.full_name || u.email || 'U')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{u.full_name || '(no name)'}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      <p className="text-xs text-gray-400">Registered {formatDateTime(u.created_at)}</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => approveUser(u)} loading={actionLoading === u.id}>
                    <UserCheck className="h-4 w-4" /> Approve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className="font-semibold text-gray-900 dark:text-white">All Users</span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Joined</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {allUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0">
                            {(u.full_name || u.email || 'U')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{u.full_name || '(no name)'}</p>
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-gray-500 text-xs hidden md:table-cell">{formatDateTime(u.created_at)}</td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={u.role === 'admin' ? 'info' : 'default'}>{u.role}</Badge>
                          <Badge variant={u.is_approved ? 'success' : 'warning'}>{u.is_approved ? 'Approved' : 'Pending'}</Badge>
                          {!u.is_active && <Badge variant="error">Inactive</Badge>}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1">
                          {u.id !== user?.id ? (
                            <>
                              <button onClick={() => approveUser(u)}
                                disabled={actionLoading === u.id}
                                title={u.is_approved ? 'Revoke approval' : 'Approve user'}
                                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors">
                                {u.is_approved ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                              </button>
                              <button onClick={() => toggleActive(u)}
                                disabled={actionLoading === u.id + '_active'}
                                title={u.is_active ? 'Deactivate user' : 'Activate user'}
                                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-amber-600 transition-colors">
                                {u.is_active ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                              </button>
                              <button onClick={() => makeAdmin(u)}
                                disabled={actionLoading === u.id + '_role'}
                                title={u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-violet-600 transition-colors">
                                <Shield className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 italic">You</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
