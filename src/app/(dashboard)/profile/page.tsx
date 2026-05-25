'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'

function PasswordField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
  const [resetEmail, setResetEmail] = useState('')
  const [resetting, setResetting] = useState(false)

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { toast('error', 'Passwords do not match'); return }
    if (newPw.length < 6) { toast('error', 'Password must be at least 6 characters'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) toast('error', error.message)
    else {
      await logAudit('PASSWORD_CHANGE', 'Profile', 'User changed their password')
      toast('success', 'Password updated successfully')
      setNewPw(''); setConfirmPw('')
    }
    setLoading(false)
  }

  const sendResetEmail = async () => {
    const email = resetEmail || profile?.email || user?.email || ''
    if (!email) { toast('error', 'No email address found'); return }
    setResetting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) toast('error', error.message)
    else {
      await logAudit('PASSWORD_RESET', 'Profile', `Password reset sent to ${email}`)
      toast('success', `Reset link sent to ${email}`)
    }
    setResetting(false)
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Account settings and password</p>
      </div>

      {/* Account Info */}
      <Card className="mb-4">
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Account Info</span></CardHeader>
        <CardContent>
          {profile ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
                  {(profile.full_name || profile.email || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">{profile.full_name || '(no name set)'}</p>
                  <p className="text-sm text-gray-500">{profile.email}</p>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full capitalize mt-1 ${profile.role==='admin'?'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400':'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {profile.role}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Status</p>
                  <span className={`text-xs font-medium ${profile.is_approved ? 'text-green-600' : 'text-amber-500'}`}>
                    {profile.is_approved ? '✓ Approved' : '⏳ Pending'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Member since</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-pulse space-y-3">
              <div className="h-14 w-14 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="mb-4">
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Change Password</span></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <PasswordField label="New Password" value={newPw} onChange={setNewPw} placeholder="Min 6 characters" />
            <PasswordField label="Confirm Password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" />
            <Button type="submit" loading={loading} className="w-full">Update Password</Button>
          </form>
        </CardContent>
      </Card>

      {/* Send Reset Email */}
      <Card>
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Send Password Reset Email</span></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" value={resetEmail || profile?.email || ''} onChange={e => setResetEmail(e.target.value)} placeholder="email@example.com"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <Button variant="outline" onClick={sendResetEmail} loading={resetting} className="w-full">Send Reset Link</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
