'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'

export default function ProfilePage() {
  const { user, profile } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetEmail, setResetEmail] = useState(user?.email || '')
  const [resetting, setResetting] = useState(false)

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { toast('error', 'Passwords do not match'); return }
    if (newPassword.length < 6) { toast('error', 'Password must be at least 6 characters'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) toast('error', error.message)
    else {
      await logAudit('PASSWORD_CHANGE', 'Profile', 'User changed their password')
      toast('success', 'Password updated successfully')
      setNewPassword(''); setConfirmPassword('')
    }
    setLoading(false)
  }

  const sendResetEmail = async () => {
    setResetting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) toast('error', error.message)
    else {
      await logAudit('PASSWORD_RESET', 'Profile', `Password reset email sent to ${resetEmail}`)
      toast('success', `Reset link sent to ${resetEmail}`)
    }
    setResetting(false)
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account settings</p>
      </div>

      <Card className="mb-4">
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Account Info</span></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div><p className="text-xs text-gray-500">Full Name</p><p className="font-medium text-gray-900 dark:text-white">{profile?.full_name || '—'}</p></div>
            <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900 dark:text-white">{profile?.email}</p></div>
            <div><p className="text-xs text-gray-500">Role</p>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded capitalize ${profile?.role==='admin'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{profile?.role}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Change Password</span></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <Input label="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" required/>
            <Input label="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" required/>
            <Button type="submit" loading={loading} className="w-full">Update Password</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><span className="font-semibold text-gray-900 dark:text-white">Send Password Reset Email</span></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Input label="Email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="email@example.com" type="email"/>
            <Button variant="outline" onClick={sendResetEmail} loading={resetting} className="w-full">Send Reset Link</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
