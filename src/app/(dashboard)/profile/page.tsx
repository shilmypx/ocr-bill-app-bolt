'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

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

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPw) { toast('error', 'Enter a new password'); return }
    if (newPw !== confirmPw) { toast('error', 'Passwords do not match'); return }
    if (newPw.length < 6) { toast('error', 'Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) { toast('error', error.message); return }
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
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Account info and password settings</p>
      </div>

      <Card className="mb-4">
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Account Info</span></CardHeader>
        <CardContent>
          {profile ? (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl shrink-0">
                {(profile.full_name || profile.email || 'U')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{profile.full_name || '(no name)'}</p>
                <p className="text-sm text-gray-500 truncate">{profile.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${roleCls}`}>{profile.role}</span>
                  <span className={`text-xs font-medium ${profile.is_approved ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`}>
                    {profile.is_approved ? '✓ Approved' : '⏳ Pending'}
                  </span>
                </div>
                {profile.created_at && (
                  <p className="text-xs text-gray-400 mt-1">Member since {new Date(profile.created_at).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Change Password</span></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <PwField label="New Password" value={newPw} onChange={setNewPw} placeholder="At least 6 characters" />
            <PwField label="Confirm Password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" />
            <Button type="submit" loading={loading} className="w-full" disabled={!newPw || !confirmPw}>
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
