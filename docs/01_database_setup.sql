-- ============================================================
-- O2 Cafe Qatar — OCR Bill Capture App
-- Database Setup Script
-- Run this in Supabase SQL Editor (project > SQL Editor > New Query)
-- ============================================================

-- ── 1. profiles table ────────────────────────────────────────
-- Extends auth.users with role and approval fields
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'user'  CHECK (role IN ('admin', 'user')),
  is_approved   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. bill_records table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bill_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name     TEXT,
  contact_number    TEXT,
  order_number      TEXT,
  bill_date         TEXT,
  restaurant        TEXT,
  delivery_partner  TEXT,  -- 'snoonu' | 'rafeeq' | 'hurrier' | 'direct' | 'standard'
  raw_text          TEXT,
  ocr_confidence    NUMERIC,
  source            TEXT,  -- 'camera' | 'file' | 'manual'
  ocr_mode          TEXT,  -- 'fast' | 'ai'
  status            TEXT DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. scan_logs table (optional analytics) ──────────────────
CREATE TABLE IF NOT EXISTS public.scan_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  partner       TEXT,
  success       BOOLEAN,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bill_records_user_id      ON public.bill_records(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_records_created_at   ON public.bill_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_records_contact      ON public.bill_records(contact_number);
CREATE INDEX IF NOT EXISTS idx_bill_records_partner      ON public.bill_records(delivery_partner);

-- ── 5. Updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bill_records_updated_at
  BEFORE UPDATE ON public.bill_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 6. Auto-create profile on new user signup ─────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_approved, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user',
    FALSE,
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 7. Helper: check if current user is admin (avoids RLS recursion) ──
CREATE OR REPLACE FUNCTION public.uid_is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 8. Helper: admin can create users ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email     TEXT,
  p_password  TEXT,
  p_name      TEXT,
  p_role      TEXT DEFAULT 'user'
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_result  JSON;
BEGIN
  -- Only admins may call this
  IF NOT public.uid_is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Create auth user
  v_user_id := (
    SELECT id FROM auth.users
    WHERE email = p_email
    LIMIT 1
  );

  IF v_user_id IS NULL THEN
    -- Insert into auth.users via Supabase admin API (use Edge Function in practice)
    RAISE EXCEPTION 'Use Supabase Dashboard or Admin API to create auth users';
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET full_name = p_name, role = p_role, is_approved = TRUE
  WHERE id = v_user_id;

  RETURN json_build_object('user_id', v_user_id, 'email', p_email);
END;
$$;

-- ── 9. Row Level Security ─────────────────────────────────────
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_logs   ENABLE ROW LEVEL SECURITY;

-- profiles: users see their own; admins see all
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.uid_is_admin());

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.uid_is_admin());

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR public.uid_is_admin());

-- bill_records: users see/modify their own; admins see all
CREATE POLICY "bill_records_select" ON public.bill_records FOR SELECT
  USING (user_id = auth.uid() OR public.uid_is_admin());

CREATE POLICY "bill_records_insert" ON public.bill_records FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "bill_records_update" ON public.bill_records FOR UPDATE
  USING (user_id = auth.uid() OR public.uid_is_admin());

CREATE POLICY "bill_records_delete" ON public.bill_records FOR DELETE
  USING (user_id = auth.uid() OR public.uid_is_admin());

-- scan_logs: users insert their own; admins read all
CREATE POLICY "scan_logs_insert" ON public.scan_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "scan_logs_select" ON public.scan_logs FOR SELECT
  USING (user_id = auth.uid() OR public.uid_is_admin());

-- ── 10. Seed first admin user (run AFTER creating user in Auth) ──
-- Replace 'YOUR_USER_UUID' with the UUID from Auth > Users
-- UPDATE public.profiles
-- SET role = 'admin', is_approved = TRUE, is_active = TRUE
-- WHERE id = 'YOUR_USER_UUID';
