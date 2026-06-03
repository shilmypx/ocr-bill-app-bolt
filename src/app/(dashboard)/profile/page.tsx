'use client'
import { useState } from 'react'
import { Eye, EyeOff, User, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'

function PwField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user, profile } = useAuth()
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)

  const changePassword = async () => {
    if (!newPw) { toast('error', 'Enter a new password'); return }
    if (newPw !== confirmPw) { toast('error', 'Passwords do not match'); return }
    if (newPw.length < 6) { toast('error', 'Minimum 6 characters required'); return }
    setLoading(true)
    try {
      // Refresh session first to ensure token is valid
      const { data: { session }, error: sessErr } = await supabase.auth.getSession()
      if (sessErr || !session) {
        toast('error', 'Session expired — please log in again')
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error

      await logAudit('CHANGE_PASSWORD', 'Profile', 'User changed their password')
      toast('success', 'Password updated successfully')
      setNewPw('')
      setConfirmPw('')
    } catch (e: any) {
      toast('error', e?.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  const roleCls = profile?.role === 'admin'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Account info and password settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Account Info */}
      <Card>
        <CardHeader><div className="flex items-center gap-2"><User className="h-5 w-5 text-blue-500" /><span className="font-semibold">Account Information</span></div></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{profile?.full_name || '—'}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.email}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${roleCls}`}>
              {profile?.role === 'admin' ? '⚡ Admin' : '👤 User'}
            </span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${profile?.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {profile?.is_active ? '✓ Active' : '✗ Inactive'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader><div className="flex items-center gap-2"><Lock className="h-5 w-5 text-blue-500" /><span className="font-semibold">Change Password</span></div></CardHeader>
        <CardContent className="space-y-4">
          <PwField label="New Password" value={newPw} onChange={setNewPw} placeholder="Min 6 characters" />
          <PwField label="Confirm Password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" />
          <Button onClick={changePassword} loading={loading} disabled={!newPw || !confirmPw} className="w-full">
            Update Password
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
