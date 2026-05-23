export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'user'
  is_active: boolean
  is_approved: boolean
  avatar_url?: string
  last_login?: string
  approved_by?: string
  approved_at?: string
  created_at: string
}

export interface BillRecord {
  id: string
  user_id: string
  customer_name: string
  contact_number: string
  bill_number: string
  bill_date: string
  restaurant: string
  address: string
  delivery_partner: string
  raw_text: string
  created_at: string
  updated_at: string
  ocr_confidence: number
  source: 'camera' | 'upload' | 'manual'
  ocr_mode: 'fast' | 'ai' | 'manual'
  status: 'success' | 'failed' | 'pending'
  // joined
  profiles?: { full_name: string; email: string }
}

export interface ScanLog {
  id: string
  user_id: string
  bill_record_id?: string
  status: 'success' | 'failed' | 'processing'
  ocr_mode: 'fast' | 'ai' | 'manual'
  source: 'camera' | 'upload' | 'manual'
  ocr_confidence: number
  processing_time_ms: number
  error_message?: string
  raw_text?: string
  created_at: string
  profiles?: { full_name: string; email: string }
}

export interface AuditLog {
  id: string
  user_id: string
  action_type: string
  module: string
  description: string
  ip_address: string
  created_at: string
  metadata?: Record<string, unknown>
  user_email?: string
  user_name?: string
}

export interface OCRResult {
  customerName: string
  contactNumber: string
  billNumber: string
  billDate: string
  restaurant: string
  address: string
  deliveryPartner: string
  rawText: string
  confidence: number
}

export interface DashboardStats {
  total_bills: number
  unique_contacts: number
  duplicate_count: number
  today_bills: number
  week_bills: number
  month_bills: number
  failed_scans?: number
}

export interface FilterParams {
  search?: string
  partner?: string
  bill_date_from?: string
  bill_date_to?: string
  captured_date_from?: string
  captured_date_to?: string
  captured_by?: string
  page?: number
  limit?: number
}
