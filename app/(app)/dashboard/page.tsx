'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScanLine, Users, Phone, TrendingUp, Clock, ChevronRight, ChartBar as BarChart3, CircleCheck as CheckCircle2, CircleAlert as AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type BillRecord } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface Stats {
  total: number;
  today: number;
  uniqueContacts: number;
  withDeliveryPartner: number;
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, today: 0, uniqueContacts: 0, withDeliveryPartner: 0 });
  const [recent, setRecent] = useState<BillRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  async function loadDashboard() {
    setLoading(true);
    const isAdmin = profile?.role === 'admin';

    let query = supabase.from('bill_records').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('user_id', user!.id);

    const { data } = await query;
    const records = data || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = records.filter((r) => new Date(r.created_at) >= today);
    const uniqueContacts = new Set(records.map((r) => r.contact_number)).size;
    const withPartner = records.filter((r) => r.delivery_partner).length;

    setStats({
      total: records.length,
      today: todayRecords.length,
      uniqueContacts,
      withDeliveryPartner: withPartner,
    });
    setRecent(records.slice(0, 8));
    setLoading(false);
  }

  const statCards = [
    {
      label: 'Total Scans',
      value: stats.total,
      icon: ScanLine,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      label: 'Today',
      value: stats.today,
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-100',
    },
    {
      label: 'Unique Contacts',
      value: stats.uniqueContacts,
      icon: Phone,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
    {
      label: 'With Delivery',
      value: stats.withDeliveryPartner,
      icon: Users,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
    },
  ];

  return (
    <div className="page-enter space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {profile?.full_name ? `Hello, ${profile.full_name.split(' ')[0]}` : 'Dashboard'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link href="/scan">
          <Button className="gap-2 shadow-sm">
            <ScanLine className="h-4 w-4" />
            Scan Bill
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div
            key={label}
            className={`bg-card rounded-2xl border ${border} p-4 shadow-sm`}
          >
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            {loading ? (
              <div className="h-7 w-16 bg-muted animate-pulse rounded-md mb-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
            )}
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent scans */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Recent Scans</h2>
          </div>
          <Link href="/records" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded-md w-1/3" />
                  <div className="h-3 bg-muted animate-pulse rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <BarChart3 className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">No scans yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start scanning bills to see data here</p>
            </div>
            <Link href="/scan">
              <Button size="sm" className="gap-1.5 mt-1">
                <ScanLine className="h-3.5 w-3.5" />
                Scan your first bill
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((record) => (
              <div key={record.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  record.contact_number ? 'bg-green-50' : 'bg-amber-50'
                }`}>
                  {record.contact_number
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <AlertCircle className="h-4 w-4 text-amber-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {record.customer_name || record.restaurant || 'Unknown'}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {record.contact_number && (
                      <span className="text-xs text-muted-foreground">{record.contact_number}</span>
                    )}
                    {record.delivery_partner && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md border border-blue-100">
                        {record.delivery_partner}
                      </span>
                    )}
                    {record.bill_number && (
                      <span className="text-xs text-muted-foreground">#{record.bill_number}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
