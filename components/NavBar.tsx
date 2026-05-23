'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ScanLine, LayoutDashboard, List, LogOut, Menu, X, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/scan', label: 'Scan', icon: ScanLine },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/records', label: 'Records', icon: List },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-primary text-lg">
          <ScanLine className="h-5 w-5" />
          <span className="hidden sm:block">BillSnap</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {profile?.role === 'admin' && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
              <ShieldCheck className="h-3 w-3" />
              Admin
            </span>
          )}
          <span className="hidden sm:block text-xs text-muted-foreground truncate max-w-[120px]">
            {profile?.email || profile?.full_name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="hidden md:flex gap-1 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
          <button
            className="md:hidden p-2 rounded-lg hover:bg-muted"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <hr className="border-border my-1" />
            <div className="px-3 py-1 text-xs text-muted-foreground">
              {profile?.email}
              {profile?.role === 'admin' && (
                <span className="ml-2 text-amber-600 font-medium">(Admin)</span>
              )}
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
