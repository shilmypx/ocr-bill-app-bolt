import * as XLSX from 'xlsx';
import type { BillRecord } from './supabase';

function toSheetRows(records: BillRecord[]) {
  return records.map((r) => ({
    'Customer Name': r.customer_name,
    'Contact Number': r.contact_number,
    'Bill Number': r.bill_number,
    'Bill Date': r.bill_date,
    Restaurant: r.restaurant,
    Address: r.address,
    'Delivery Partner': r.delivery_partner,
    'Scanned At': new Date(r.created_at).toLocaleString(),
  }));
}

export function exportFullToExcel(records: BillRecord[], filename = 'bill_records_full') {
  const ws = XLSX.utils.json_to_sheet(toSheetRows(records));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'All Records');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportUniqueContactsToExcel(records: BillRecord[], filename = 'bill_records_unique') {
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    if (seen.has(r.contact_number)) return false;
    seen.add(r.contact_number);
    return true;
  });
  const ws = XLSX.utils.json_to_sheet(toSheetRows(unique));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Unique Contacts');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
