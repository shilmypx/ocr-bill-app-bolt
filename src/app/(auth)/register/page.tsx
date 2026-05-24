'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role: 'user' } }
    })
    if (err) { setError(err.message); setLoading(false) }
    else { setDone(true); setLoading(false) }
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl p-8 text-center border border-gray-200 dark:border-gray-700">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Account Created</h2>
        <p className="text-sm text-gray-500 mb-4">Your account is pending approval by an administrator.</p>
        <Link href="/login" className="text-blue-600 hover:underline text-sm font-medium">Back to login</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-sm"><Zap className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">BillCapture</h1>
            <p className="text-xs text-gray-500">Enterprise OCR Platform</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Create Account</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <Input label="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" required />
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
            <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required />
            {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>Create Account</Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
