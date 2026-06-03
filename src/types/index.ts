export interface Profile {
  id: string
  email?: string | null
  full_name?: string | null
  role: 'admin' | 'user'
  is_approved: boolean
  is_active: boolean
  created_at?: string
  approved_by?: string | null
  approved_at?: string | null
}

export interface BillRecord {
  id: string
  user_id: string
  customer_name?: string | null
  contact_number: string
  order_number?: string | null
  bill_date?: string | null
  restaurant?: string | null
  address?: string | null
  delivery_partner?: string | null
  raw_text?: string | null
  ocr_confidence?: number | null
  source?: string | null
  ocr_mode?: string | null
  status?: string | null
  created_at?: string
  updated_at?: string
}

export interface ScanLog {
  id: string
  user_id: string
  bill_record_id?: string | null
  status?: string | null
  ocr_mode?: string | null
  source?: string | null
  ocr_confidence?: number | null
  processing_time_ms?: number | null
  error_message?: string | null
  raw_text?: string | null
  created_at?: string
  profiles?: { full_name?: string | null } | null
}

export interface AuditLog {
  id: string
  user_id?: string | null
  user_email?: string | null
  user_name?: string | null
  action_type: string
  module: string
  description?: string | null
  metadata?: Record<string, unknown> | null
  ip_address?: string | null
  created_at?: string
}

export interface OCRResult {
  customerName: string
  contactNumber: string
  orderNumber: string
  billDate: string
  restaurant: string
  address: string
  deliveryPartner: string
  rawText: string
  confidence: number
}
