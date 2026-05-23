/*
  # OCR Bill Capture Schema

  ## New Tables

  ### profiles
  - `id` (uuid, pk, references auth.users)
  - `email` (text)
  - `full_name` (text)
  - `role` (text: 'admin' | 'user', default 'user')
  - `created_at` (timestamptz)

  ### bill_records
  - `id` (uuid, pk)
  - `user_id` (uuid, references auth.users)
  - `customer_name` (text)
  - `contact_number` (text, NOT NULL)
  - `bill_number` (text)
  - `bill_date` (text)
  - `restaurant` (text)
  - `address` (text)
  - `delivery_partner` (text)
  - `raw_text` (text) — original OCR output
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Profiles: users can read/update own profile; admins can read all
  - Bill records: users can CRUD own records; admins can read all
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text DEFAULT '',
  role text DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Bill records table
CREATE TABLE IF NOT EXISTS bill_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name text DEFAULT '',
  contact_number text NOT NULL,
  bill_number text DEFAULT '',
  bill_date text DEFAULT '',
  restaurant text DEFAULT '',
  address text DEFAULT '',
  delivery_partner text DEFAULT '',
  raw_text text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bill_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bill records"
  ON bill_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bill records"
  ON bill_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bill records"
  ON bill_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bill records"
  ON bill_records FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all bill records"
  ON bill_records FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Trigger: auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Indexes
CREATE INDEX IF NOT EXISTS bill_records_user_id_idx ON bill_records(user_id);
CREATE INDEX IF NOT EXISTS bill_records_created_at_idx ON bill_records(created_at DESC);
CREATE INDEX IF NOT EXISTS bill_records_contact_number_idx ON bill_records(contact_number);
