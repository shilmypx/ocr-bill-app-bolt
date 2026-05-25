'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Camera, FileText, ScanLine, ClipboardList, Users, LogOut, Menu, X, ChevronRight, Zap, Moon, Sun, ChevronLeft, ChevronRightIcon, UserCircle } from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/capture', icon: Camera, label: 'Capture Bill' },
  { href: '/records', icon: FileText, label: 'Bill Records' },
  { href: '/scan-logs', icon: ScanLine, label: 'Scan Logs' },
  { href: '/audit-logs', icon: ClipboardList, label: 'Audit Logs', adminOnly: true },
  { href: '/users', icon: Users, label: 'Users', adminOnly: true },
  { href: '/profile', icon: UserCircle, label: 'My Profile' },
]

interface SidebarProps { darkMode: boolean; toggleDark: () => void; onCollapse?: (c: boolean) => void }

export function Sidebar({ darkMode, toggleDark, onCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { profile, signOut, isAdmin } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('navCollapsed', String(next))
    onCollapse?.(next)
  }

  const links = navItems.filter(i => !i.adminOnly || isAdmin)
  const roleBadge = profile?.role === 'admin'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'

  const NavLinks = ({ mini }: { mini?: boolean }) => (
    <nav className={cn('flex-1 overflow-y-auto', mini ? 'px-2 py-4' : 'px-3 py-4')}>
      {!mini && <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2">Menu</p>}
      {links.map(item => {
        const active = pathname === item.href
        return (
          <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
            title={mini ? item.label : undefined}
            className={cn('flex items-center rounded-xl mb-0.5 transition-all',
              mini ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
              active ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-white')}>
            <item.icon className={cn('shrink-0', mini ? 'h-5 w-5' : 'h-4 w-4')} />
            {!mini && <span className="flex-1 text-sm font-medium">{item.label}</span>}
            {!mini && active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
          </Link>
        )
      })}
    </nav>
  )

  const UserFooter = ({ mini }: { mini?: boolean }) => (
    <div className={cn('border-t border-gray-200 dark:border-gray-700', mini ? 'p-2 space-y-1' : 'p-4')}>
      {/* User info — shown above theme toggle */}
      {!mini ? (
        <div className="mb-3">
          <div className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile?.email}</p>
              <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded capitalize mt-0.5 inline-block', roleBadge)}>
                {profile?.role}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center mb-1">
          <div title={`${profile?.full_name} (${profile?.role})`}
            className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
            {(profile?.full_name || 'U')[0].toUpperCase()}
          </div>
        </div>
      )}

      {/* Theme toggle */}
      <button onClick={toggleDark}
        className={cn('w-full flex items-center gap-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60',
          mini ? 'justify-center p-2 mb-1' : 'px-3 py-2 mb-1 text-sm')}>
        {darkMode ? <Sun className="h-4 w-4 text-amber-500 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
        {!mini && <span>Toggle Theme</span>}
      </button>

      {/* Sign out */}
      <button onClick={signOut}
        className={cn('w-full flex items-center gap-2 rounded-lg transition-colors text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10',
          mini ? 'justify-center p-2' : 'px-3 py-2 text-sm')}>
        <LogOut className="h-4 w-4 shrink-0" />
        {!mini && <span>Sign Out</span>}
      </button>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 fixed left-0 top-0 z-30 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}>
        {/* Logo row */}
        <div className={cn('flex items-center border-b border-gray-200 dark:border-gray-700 shrink-0', collapsed ? 'justify-center p-3 flex-col gap-1' : 'gap-3 p-5')}>
          <div className="bg-blue-600 p-2 rounded-xl shadow-sm shrink-0"><Zap className="h-4 w-4 text-white" /></div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-gray-900 dark:text-white text-sm leading-tight">BillCapture</h1>
                <p className="text-xs text-gray-400">Enterprise OCR</p>
              </div>
              <button onClick={toggleCollapse} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          )}
          {collapsed && (
            <button onClick={toggleCollapse} className="text-gray-400 hover:text-gray-600">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <NavLinks mini={collapsed} />
        <UserFooter mini={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg"><Zap className="h-4 w-4 text-white" /></div>
          <span className="font-bold text-sm text-gray-900 dark:text-white">BillCapture</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">{profile?.full_name}</p>
              <p className="text-xs text-gray-400 truncate max-w-24">{profile?.email}</p>
            </div>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded capitalize hidden sm:block', roleBadge)}>{profile?.role}</span>
          </div>
          <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            {darkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => setMobileOpen(o => !o)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-gray-800 flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="bg-blue-600 p-2 rounded-xl"><Zap className="h-4 w-4 text-white" /></div>
              <div><h1 className="font-bold text-gray-900 dark:text-white text-sm">BillCapture</h1><p className="text-xs text-gray-400">Enterprise OCR</p></div>
            </div>
            <NavLinks />
            <UserFooter />
          </aside>
        </div>
      )}
    </>
  )
}
