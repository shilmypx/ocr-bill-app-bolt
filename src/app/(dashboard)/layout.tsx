'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout/Sidebar'
import { Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isApproved } = useAuth()
  const router = useRouter()
  const [darkMode, setDarkMode] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('darkMode') === 'true'
    const col = localStorage.getItem('navCollapsed') === 'true'
    setDarkMode(saved); setCollapsed(col)
    document.documentElement.classList.toggle('dark', saved)
  }, [])

  const toggleDark = () => {
    const next = !darkMode; setDarkMode(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('darkMode', String(next))
  }

  useEffect(() => { if (!loading && !user) router.replace('/login') }, [user, loading, router])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin"/>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  )

  if (!user) return null

  if (profile && !isApproved) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Account Pending Approval</h2>
        <p className="text-gray-500 text-sm mb-6">An administrator needs to approve your access.</p>
        <Link href="/login" className="text-blue-600 text-sm hover:underline">Back to login</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar darkMode={darkMode} toggleDark={toggleDark} />
      <main className={`pt-14 lg:pt-0 transition-all duration-200 ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
