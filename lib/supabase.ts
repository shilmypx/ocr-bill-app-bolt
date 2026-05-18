import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'admin' | 'user';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface BillRecord {
  id: string;
  user_id: string;
  customer_name: string;
  contact_number: string;
  bill_number: string;
  bill_date: string;
  restaurant: string;
  address: string;
  delivery_partner: string;
  raw_text: string;
  created_at: string;
}

export type BillRecordInsert = Omit<BillRecord, 'id' | 'created_at'>;
