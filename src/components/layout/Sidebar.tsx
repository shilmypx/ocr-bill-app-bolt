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

interface SidebarProps { darkMode: boolean; toggleDark: () => void }

export function Sidebar({ darkMode, toggleDark }: SidebarProps) {
  const pathname = usePathname()
  const { profile, signOut, isAdmin } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const links = navItems.filter(i => !i.adminOnly || isAdmin)

  const NavLinks = ({ mini }: { mini?: boolean }) => (
    <nav className={cn('flex-1 overflow-y-auto', mini ? 'px-2 py-4' : 'px-3 py-4')}>
      {!mini && <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2">Menu</p>}
      {links.map(item => {
        const active = pathname === item.href
        return (
          <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
            title={mini ? item.label : undefined}
            className={cn(
              'flex items-center rounded-xl mb-0.5 transition-all group',
              mini ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
              active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-white'
            )}>
            <item.icon className={cn('shrink-0', mini ? 'h-5 w-5' : 'h-4 w-4')} />
            {!mini && <span className="flex-1 text-sm font-medium">{item.label}</span>}
            {!mini && active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
          </Link>
        )
      })}
    </nav>
  )

  const UserInfo = ({ mini }: { mini?: boolean }) => (
    <div className={cn('border-t border-gray-200 dark:border-gray-700', mini ? 'p-2' : 'p-4')}>
      {!mini && (
        <div className="flex items-center gap-3 mb-3 p-2 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded capitalize',
              profile?.role === 'admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400')}>
              {profile?.role}
            </span>
          </div>
        </div>
      )}
      {mini && (
        <div className="flex justify-center mb-2">
          <div title={profile?.full_name || 'User'} className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
            {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
          </div>
        </div>
      )}
      <button onClick={toggleDark} title="Toggle theme"
        className={cn('w-full flex items-center gap-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60', mini ? 'justify-center p-2 mb-1' : 'px-3 py-2 mb-1 text-sm')}>
        {darkMode ? <Sun className="h-4 w-4 text-amber-500 shrink-0"/> : <Moon className="h-4 w-4 shrink-0"/>}
        {!mini && <span>Toggle Theme</span>}
      </button>
      <button onClick={signOut} title="Sign out"
        className={cn('w-full flex items-center gap-2 rounded-lg transition-colors text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10', mini ? 'justify-center p-2' : 'px-3 py-2 text-sm')}>
        <LogOut className="h-4 w-4 shrink-0"/>
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
        {/* Logo */}
        <div className={cn('flex items-center border-b border-gray-200 dark:border-gray-700 shrink-0', collapsed ? 'justify-center p-3' : 'gap-3 p-5')}>
          <div className="bg-blue-600 p-2 rounded-xl shadow-sm shrink-0"><Zap className="h-4 w-4 text-white"/></div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-gray-900 dark:text-white text-sm leading-tight">BillCapture</h1>
              <p className="text-xs text-gray-400">Enterprise OCR</p>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)}
            className={cn('p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 shrink-0', collapsed && 'hidden')}>
            <ChevronLeft className="h-4 w-4"/>
          </button>
        </div>
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="flex justify-center py-2 text-gray-400 hover:text-gray-600">
            <ChevronRightIcon className="h-4 w-4"/>
          </button>
        )}

        <NavLinks mini={collapsed} />
        <UserInfo mini={collapsed} />
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg"><Zap className="h-4 w-4 text-white"/></div>
          <span className="font-bold text-sm text-gray-900 dark:text-white">BillCapture</span>
        </div>
        <div className="flex items-center gap-2">
          {/* User info on mobile header */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded-lg">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 hidden sm:block">{profile?.full_name || 'User'}</span>
            <span className={cn('text-xs px-1.5 rounded capitalize hidden sm:block',
              profile?.role==='admin'?'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400':'bg-gray-100 text-gray-600')}>
              {profile?.role}
            </span>
          </div>
          <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            {darkMode ? <Sun className="h-4 w-4 text-amber-500"/> : <Moon className="h-4 w-4"/>}
          </button>
          <button onClick={() => setMobileOpen(o => !o)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {mobileOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)}/>
          <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-gray-800 flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="bg-blue-600 p-2 rounded-xl"><Zap className="h-4 w-4 text-white"/></div>
              <div>
                <h1 className="font-bold text-gray-900 dark:text-white text-sm">BillCapture</h1>
                <p className="text-xs text-gray-400">Enterprise OCR</p>
              </div>
            </div>
            <NavLinks />
            <UserInfo />
          </aside>
        </div>
      )}
    </>
  )
}
