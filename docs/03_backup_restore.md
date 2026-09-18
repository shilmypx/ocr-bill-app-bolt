# Database Backup & Restore Guide

---

## Export Current Database (Full Backup)

### Method 1 — Supabase Dashboard (Recommended)

1. Go to your Supabase project
2. Click **Project Settings** → **Database**
3. Scroll to **Backups** section
4. Click **Download** next to the latest backup
   - This gives a full PostgreSQL dump (`.sql` file)
   - Includes all tables, data, functions, and policies

### Method 2 — pg_dump (Command Line)

```bash
# Replace with your Supabase database connection string
# Found at: Project Settings > Database > Connection string

pg_dump \
  "postgresql://postgres:[YOUR_DB_PASSWORD]@db.[YOUR_PROJECT_REF].supabase.co:5432/postgres" \
  --no-owner \
  --no-acl \
  -f backup_$(date +%Y%m%d).sql

# To include only specific tables:
pg_dump \
  "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  --no-owner --no-acl \
  --table=public.profiles \
  --table=public.bill_records \
  -f data_backup_$(date +%Y%m%d).sql
```

### Method 3 — Export as CSV via SQL Editor

Run these queries in Supabase SQL Editor and click the **CSV** button:

```sql
-- Export bill_records
SELECT 
  id, user_id, customer_name, contact_number, order_number,
  bill_date, restaurant, delivery_partner, source, ocr_mode,
  status, created_at, updated_at
FROM public.bill_records
ORDER BY created_at DESC;

-- Export profiles
SELECT id, email, full_name, role, is_approved, is_active, created_at
FROM public.profiles
ORDER BY created_at;
```

---

## Restore to New Supabase Project

### From Supabase Backup File

1. Create a new Supabase project (see Deployment Guide Step 2)
2. Go to **SQL Editor** → **New Query**
3. Paste the contents of `01_database_setup.sql` → **Run** (creates schema)
4. Import data using `pg_restore` or paste the data INSERT statements

### From pg_dump file

```bash
# Restore to new project
psql \
  "postgresql://postgres:[NEW_DB_PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  -f backup_20260624.sql
```

---

## Automated Weekly Backup (Supabase Pro Feature)

Supabase Pro plan includes:
- **Daily point-in-time recovery** backups
- **Retained for 7 days** (Pro) or **30 days** (Team)
- One-click restore from dashboard

For free tier: schedule manual exports weekly using the CSV method above.

---

## Application Code Backup

The application code is always stored in GitHub:
**github.com/shilmypx/ocr-bill-app-bolt**

To download a snapshot:
1. Go to the repo on GitHub
2. Click **Code** → **Download ZIP**
3. Save the ZIP — this is the complete application

To clone:
```bash
git clone https://github.com/shilmypx/ocr-bill-app-bolt.git
```

---

## What's NOT in the Backup

| Item | Where It Lives | How to Recover |
|---|---|---|
| Auth users (passwords) | Supabase Auth service | Users re-invite themselves |
| Environment variables | Vercel settings | Re-enter from your saved copy |
| Vercel deployment config | Vercel | Re-import repo (takes 2 min) |
| Application code | GitHub | Clone/fork the repo |
