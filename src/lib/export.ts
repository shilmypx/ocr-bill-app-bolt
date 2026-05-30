import * as XLSX from 'xlsx'
import type { BillRecord } from '@/types'

function forceText(val: unknown): string {
  return String(val ?? '')
}

export function exportUniqueContacts(records: BillRecord[]) {
  const seen = new Set<string>()
  const unique = records.filter(r => {
    if (seen.has(r.contact_number)) return false
    seen.add(r.contact_number)
    return true
  })
  const ws = XLSX.utils.aoa_to_sheet([
    ['Customer Name', 'Contact Number'],
    ...unique.map(r => [forceText(r.customer_name), { v: forceText(r.contact_number), t: 's' }]),
  ])
  // Force contact number column to text to prevent scientific notation
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  for (let row = 1; row <= range.e.r; row++) {
    const cell = ws[XLSX.utils.encode_cell({ r: row, c: 1 })]
    if (cell) { cell.t = 's'; cell.z = '@' }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Unique Contacts')
  XLSX.writeFile(wb, `unique_contacts_${new Date().toISOString().slice(0,10)}.xlsx`)
}

export function exportFullRecords(records: BillRecord[], columns: string[]) {
  const columnMap: Record<string, (r: BillRecord) => unknown> = {
    'Customer Name': r => forceText(r.customer_name),
    'Contact Number': r => ({ v: forceText(r.contact_number), t: 's' }),
    'Bill Date': r => forceText(r.bill_date),
    'Bill Number': r => forceText(r.bill_number),
    'Partner': r => forceText(r.delivery_partner),
    'Restaurant': r => forceText(r.restaurant),
    'Address': r => forceText(r.address),
    'Source': r => forceText(r.source),
    'OCR Mode': r => forceText(r.ocr_mode),
    'OCR Confidence': r => r.ocr_confidence ? `${r.ocr_confidence.toFixed(1)}%` : '',
    'Status': r => forceText(r.status),
    'Captured By': r => forceText((r as any).profiles?.full_name ?? (r as any)._name),
    'Captured Date': r => r.created_at ? new Date(r.created_at).toLocaleString() : '',
  }
  const selectedCols = columns.filter(c => columnMap[c])
  const headers = selectedCols
  const rows = records.map(r => selectedCols.map(col => {
    const val = columnMap[col]?.(r)
    return val
  }))
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = selectedCols.map(() => ({ wch: 20 }))
  // Force contact number column to text
  const contactIdx = selectedCols.indexOf('Contact Number')
  if (contactIdx >= 0) {
    const range = XLSX.utils.decode_range(ws['!ref']!)
    for (let row = 1; row <= range.e.r; row++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: contactIdx })]
      if (cell) { cell.t = 's'; cell.z = '@' }
    }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bill Records')
  XLSX.writeFile(wb, `bill_records_${new Date().toISOString().slice(0,10)}.xlsx`)
}
