'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Camera, FileText, ScanLine, ClipboardList,
  Users, LogOut, Menu, X, ChevronRight, Zap, Moon, Sun
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/capture', icon: Camera, label: 'Capture Bill' },
  { href: '/records', icon: FileText, label: 'Bill Records' },
  { href: '/scan-logs', icon: ScanLine, label: 'Scan Logs' },
  { href: '/audit-logs', icon: ClipboardList, label: 'Audit Logs', adminOnly: true },
  { href: '/users', icon: Users, label: 'User Management', adminOnly: true },
]

interface SidebarProps {
  darkMode: boolean
  toggleDark: () => void
}

export function Sidebar({ darkMode, toggleDark }: SidebarProps) {
  const pathname = usePathname()
  const { profile, signOut, isAdmin } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const links = navItems.filter(i => !i.adminOnly || isAdmin)

  const NavContent = () => (
    <>
      <div className="p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-sm">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 dark:text-white leading-tight">BillCapture</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Enterprise OCR Platform</p>
          </div>
        </div>
      </div>

      <nav className="px-3 py-4 flex-1 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2">Navigation</p>
        {links.map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-all',
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-white'
              )}>
              <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : '')} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        {/* Dark mode toggle */}
        <button onClick={toggleDark}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors">
          {darkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
          <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm shrink-0">
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{profile?.role}</p>
          </div>
        </div>

        <button onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 fixed left-0 top-0 z-30">
        <NavContent />
      </aside>

      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-sm text-gray-900 dark:text-white">BillCapture</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            {darkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-gray-800 flex flex-col shadow-2xl">
            <NavContent />
          </aside>
        </div>
      )}
    </>
  )
}
