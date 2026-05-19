import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL environment variable')
}

export const sql = neon(process.env.DATABASE_URL)

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
