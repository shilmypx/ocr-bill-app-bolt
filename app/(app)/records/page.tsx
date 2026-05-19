'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search, Download, Filter, ChevronLeft, ChevronRight,
  Trash2, ScanLine, Phone, Calendar, Hash, Store, MapPin, Truck, User,
  FileSpreadsheet, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type BillRecord } from '@/lib/supabase';
import { exportFullToExcel, exportUniqueContactsToExcel } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

const PAGE_SIZE = 20;

const DELIVERY_PARTNERS = ['Zomato', 'Swiggy', 'Uber Eats', 'Dunzo', 'Magicpin', 'Foodpanda', 'Rapido'];

export default function RecordsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [records, setRecords] = useState<BillRecord[]>([]);
  const [filtered, setFiltered] = useState<BillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<BillRecord | null>(null);

  useEffect(() => {
    if (!user) return;
    loadRecords();
  }, [user]);

  async function loadRecords() {
    setLoading(true);
    const isAdmin = profile?.role === 'admin';
    let query = supabase.from('bill_records').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('user_id', user!.id);
    const { data } = await query;
    setRecords(data || []);
    setLoading(false);
  }

  const applyFilters = useCallback(() => {
    let result = [...records];
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter((r) =>
        r.customer_name?.toLowerCase().includes(q) ||
        r.contact_number?.includes(q) ||
        r.bill_number?.toLowerCase().includes(q) ||
        r.restaurant?.toLowerCase().includes(q) ||
        r.address?.toLowerCase().includes(q) ||
        r.delivery_partner?.toLowerCase().includes(q)
      );
    }
    if (partnerFilter) {
      result = result.filter((r) => r.delivery_partner?.toLowerCase() === partnerFilter.toLowerCase());
    }
    if (dateFilter) {
      result = result.filter((r) => {
        const d = new Date(r.created_at);
        return d.toISOString().startsWith(dateFilter);
      });
    }
    setFiltered(result);
    setPage(1);
  }, [records, search, partnerFilter, dateFilter]);

  useEffect(() => { applyFilters(); }, [applyFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedRecords = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const deleteRecord = async (id: string) => {
    const { error } = await supabase.from('bill_records').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    setRecords((prev) => prev.filter((r) => r.id !== id));
    if (selectedRecord?.id === id) setSelectedRecord(null);
    toast({ title: 'Record deleted' });
  };

  const clearFilters = () => {
    setSearch('');
    setPartnerFilter('');
    setDateFilter('');
  };

  const hasFilters = search || partnerFilter || dateFilter;

  return (
    <div className="page-enter space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Records</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : `${filtered.length} of ${records.length} records`}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Export Options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportFullToExcel(records)}>
              <Download className="h-4 w-4 mr-2" />
              Full Export ({records.length} records)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportUniqueContactsToExcel(records)}>
              <Phone className="h-4 w-4 mr-2" />
              Unique Contacts Only
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportFullToExcel(filtered)} disabled={filtered.length === records.length}>
              <Filter className="h-4 w-4 mr-2" />
              Export Filtered ({filtered.length})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4 shadow-sm space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, bill no, restaurant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Partners</option>
            {DELIVERY_PARTNERS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="h-4 bg-muted animate-pulse rounded flex-1" />
                <div className="h-4 bg-muted animate-pulse rounded w-28" />
                <div className="h-4 bg-muted animate-pulse rounded w-20" />
              </div>
            ))}
          </div>
        ) : paginatedRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <ScanLine className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {hasFilters ? 'No records match your filters' : 'No records yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {hasFilters ? 'Try adjusting your search or filters' : 'Scan a bill to get started'}
              </p>
            </div>
            {hasFilters && (
              <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    {['Customer', 'Contact', 'Bill No.', 'Date', 'Restaurant', 'Partner', 'Scanned', ''].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedRecords.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedRecord(r)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[120px] truncate">
                        {r.customer_name || <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground font-mono">{r.contact_number}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {r.bill_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.bill_date || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[100px] truncate">
                        {r.restaurant || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {r.delivery_partner ? (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100 font-medium">
                            {r.delivery_partner}
                          </span>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => deleteRecord(r.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {paginatedRecords.map((r) => (
                <div
                  key={r.id}
                  className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedRecord(r)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-foreground truncate">
                          {r.customer_name || r.restaurant || 'Unknown'}
                        </span>
                        {r.delivery_partner && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 flex-shrink-0">
                            {r.delivery_partner}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span className="text-xs text-muted-foreground font-mono">{r.contact_number}</span>
                        {r.bill_number && <span className="text-xs text-muted-foreground">#{r.bill_number}</span>}
                        {r.bill_date && <span className="text-xs text-muted-foreground">{r.bill_date}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRecord(r.id); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail drawer / modal */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
              <h3 className="font-semibold text-foreground">Bill Details</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => deleteRecord(selectedRecord.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {[
                { icon: User, label: 'Customer Name', value: selectedRecord.customer_name },
                { icon: Phone, label: 'Contact Number', value: selectedRecord.contact_number },
                { icon: Hash, label: 'Bill Number', value: selectedRecord.bill_number },
                { icon: Calendar, label: 'Bill Date', value: selectedRecord.bill_date },
                { icon: Store, label: 'Restaurant', value: selectedRecord.restaurant },
                { icon: MapPin, label: 'Address', value: selectedRecord.address },
                { icon: Truck, label: 'Delivery Partner', value: selectedRecord.delivery_partner },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-sm font-medium mt-0.5 break-words ${value ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                      {value || 'Not detected'}
                    </p>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Scanned {new Date(selectedRecord.created_at).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
