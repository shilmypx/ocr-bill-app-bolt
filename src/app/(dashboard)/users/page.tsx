'use client'
import { useState, useEffect, useCallback } from 'react'
import { UserCheck, UserX, Shield, ShieldOff, RefreshCw, UserPlus, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Input'
import { Input } from '@/components/ui/Input'
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
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [newUser, setNewUser] = useState({ fullName: '', email: '', password: '', role: 'user' })

  useEffect(() => { if (!isAdmin) router.replace('/dashboard') }, [isAdmin, router])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const createUser = async () => {
    if (!newUser.email || !newUser.password) { toast('error', 'Email and password required'); return }
    if (newUser.password.length < 6) { toast('error', 'Password must be at least 6 characters'); return }
    setCreating(true)
    try {
      // Use the SQL function that bypasses email limits and "User not allowed" errors
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_email: newUser.email,
        p_password: newUser.password,
        p_full_name: newUser.fullName,
        p_role: newUser.role,
      })
      if (error) throw error
      await logAudit('CREATE_USER', 'Users', `${(data as any)?.action === 'updated' ? 'Updated' : 'Created'} user ${newUser.email} as ${newUser.role}`)
      toast('success', `User ${newUser.email} ${(data as any)?.action === 'updated' ? 'updated' : 'created'} successfully`)
      setShowCreate(false)
      setNewUser({ fullName: '', email: '', password: '', role: 'user' })
      fetchUsers()
    } catch (e: any) {
      toast('error', e?.message || 'Failed to create user')
    } finally { setCreating(false) }
  }

  const updateUser = async (id: string, updates: Partial<Profile>, auditMsg: string) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) { toast('error', 'Update failed'); return false }
    await logAudit('UPDATE_USER', 'Users', auditMsg)
    fetchUsers()
    return true
  }

  const toggleApprove = async (u: Profile) => {
    setActionLoading(u.id)
    const approved = !u.is_approved
    await updateUser(u.id, { is_approved: approved, approved_by: approved ? user!.id : null, approved_at: approved ? new Date().toISOString() : null },
      `${approved ? 'Approved' : 'Revoked'} ${u.email}`)
    toast('success', `User ${approved ? 'approved' : 'revoked'}`)
    setActionLoading(null)
  }

  const toggleActive = async (u: Profile) => {
    setActionLoading(u.id + 'a')
    const active = !u.is_active
    await updateUser(u.id, { is_active: active }, `${active ? 'Activated' : 'Deactivated'} ${u.email}`)
    toast('success', `User ${active ? 'activated' : 'deactivated'}`)
    setActionLoading(null)
  }

  const toggleRole = async (u: Profile) => {
    setActionLoading(u.id + 'r')
    const role = u.role === 'admin' ? 'user' : 'admin'
    await updateUser(u.id, { role }, `Changed ${u.email} to ${role}`)
    toast('success', `Role changed to ${role}`)
    setActionLoading(null)
  }

  const pending = users.filter(u => !u.is_approved)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} users · {pending.length} pending</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchUsers} loading={loading}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setShowCreate(s => !s)}><UserPlus className="h-4 w-4" />Create User</Button>
        </div>
      </div>

      {showCreate && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Create New User</span></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Input label="Full Name" value={newUser.fullName} onChange={e => setNewUser(f => ({ ...f, fullName: e.target.value }))} placeholder="Full name" />
              <Input label="Email *" type="email" value={newUser.email} onChange={e => setNewUser(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              <div className="relative">
                <Input label="Password *" type={showPw ? 'text' : 'password'} value={newUser.password}
                  onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-8 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select value={newUser.role} onChange={e => setNewUser(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Button>
              <Button onClick={createUser} loading={creating} className="flex-1">Create User</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader><span className="font-semibold text-gray-900 dark:text-white">⏳ Pending Approval ({pending.length})</span></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pending.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{u.full_name || u.email}</p>
                    <p className="text-xs text-gray-500">{u.email} · {formatDateTime(u.created_at)}</p>
                  </div>
                  <Button size="sm" onClick={() => toggleApprove(u)} loading={actionLoading === u.id}>
                    <UserCheck className="h-4 w-4" />Approve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(3).fill(0).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                  {Array(4).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>)}
                </tr>
              )) : users.map(u => (
                <tr key={u.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {(u.full_name || u.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate text-sm">{u.full_name || '(no name)'}</p>
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">{formatDateTime(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={u.role === 'admin' ? 'info' : 'default'}>{u.role}</Badge>
                      <Badge variant={u.is_approved ? 'success' : 'warning'}>{u.is_approved ? 'Approved' : 'Pending'}</Badge>
                      {!u.is_active && <Badge variant="error">Inactive</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== user?.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleApprove(u)} disabled={!!actionLoading} title={u.is_approved ? 'Revoke' : 'Approve'}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 transition-colors">
                          {u.is_approved ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                        <button onClick={() => toggleActive(u)} disabled={!!actionLoading} title={u.is_active ? 'Deactivate' : 'Activate'}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-amber-600 transition-colors">
                          {u.is_active ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                        </button>
                        <button onClick={() => toggleRole(u)} disabled={!!actionLoading} title={`Make ${u.role === 'admin' ? 'user' : 'admin'}`}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-violet-600 transition-colors">
                          <Shield className="h-4 w-4" />
                        </button>
                      </div>
                    ) : <span className="text-xs text-gray-400 italic text-right block pr-2">You</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
