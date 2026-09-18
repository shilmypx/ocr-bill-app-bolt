# O2 Cafe Qatar — OCR Bill Capture App
## Complete Deployment Guide (New Environment)

---

## Overview

| Item | Value |
|---|---|
| App | Next.js 14 (React 18, TypeScript) |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel |
| OCR Engine | Tesseract.js (client-side, free) |
| Node.js | 20.x (required) |
| Repo | github.com/shilmypx/ocr-bill-app-bolt |

---

## Prerequisites

Before starting, create accounts on:
- **GitHub** — github.com (free)
- **Supabase** — supabase.com (free tier works)
- **Vercel** — vercel.com (free tier works)

---

## STEP 1 — Fork / Clone the Repository

### Option A: Fork (recommended for your own copy)
1. Go to **github.com/shilmypx/ocr-bill-app-bolt**
2. Click **Fork** → Fork to your account
3. Your repo URL will be: `github.com/YOUR_USERNAME/ocr-bill-app-bolt`

### Option B: Download ZIP
1. Go to the repo → Click **Code** → **Download ZIP**
2. Extract and push to your own GitHub repo

---

## STEP 2 — Create Supabase Project

1. Log in to **supabase.com**
2. Click **New Project**
3. Fill in:
   - **Name:** `ocr-bill-app` (or any name)
   - **Database Password:** Choose a strong password and **save it**
   - **Region:** Choose nearest (e.g. `ap-southeast-1` for Middle East)
4. Click **Create new project** — wait ~2 minutes for provisioning

### 2a. Get Supabase credentials
After the project is ready:
1. Go to **Project Settings** → **API**
2. Copy and save:
   - **Project URL** → `https://XXXX.supabase.co`
   - **anon/public key** → long JWT string
   - **service_role key** → (keep secret, for admin operations)

---

## STEP 3 — Set Up the Database

1. In your Supabase project, go to **SQL Editor** → **New Query**
2. Open the file `docs/01_database_setup.sql` from this repo
3. **Paste the entire contents** into the SQL Editor
4. Click **Run** (or press Ctrl+Enter)
5. You should see "Success. No rows returned"

### 3a. Create your first Admin user
1. Go to **Authentication** → **Users** → **Invite user**
2. Enter the admin email address → **Send invite**
3. The user receives an email — they set their password
4. Once they sign up, go to **SQL Editor** and run:
```sql
UPDATE public.profiles
SET role = 'admin', is_approved = TRUE, is_active = TRUE
WHERE email = 'admin@yourcompany.com';
```

---

## STEP 4 — Configure Environment Variables

Create a file called `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Optional: Claude AI Vision for Hurrier bills (better accuracy)
# Get from: console.anthropic.com/settings/api-keys
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Replace values with your Supabase credentials from Step 2a.

> **Important:** Never commit `.env.local` to Git. It is already in `.gitignore`.

---

## STEP 5 — Deploy to Vercel

### 5a. Connect repo to Vercel
1. Log in to **vercel.com**
2. Click **Add New** → **Project**
3. Click **Import Git Repository**
4. Select your GitHub repo (`ocr-bill-app-bolt`)
5. Vercel auto-detects Next.js — click **Deploy**

### 5b. Add Environment Variables in Vercel
1. After import, go to **Settings** → **Environment Variables**
2. Add each variable from your `.env.local`:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://XXXX.supabase.co` | All 3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJh...` (anon key) | All 3 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (optional) | Production |

3. Click **Save** after each variable
4. Go to **Deployments** → click the three dots → **Redeploy**

### 5c. Verify deployment
- Vercel gives you a URL like: `your-app.vercel.app`
- Open it — you should see the login page
- Sign in with the admin account created in Step 3a

---

## STEP 6 — Configure Supabase Auth (Important)

### 6a. Allow your domain
1. In Supabase → **Authentication** → **URL Configuration**
2. Set **Site URL** to your Vercel URL: `https://your-app.vercel.app`
3. Add to **Redirect URLs**: `https://your-app.vercel.app/**`

### 6b. Email settings (optional)
1. Go to **Authentication** → **Email Templates**
2. Customize invitation and confirmation emails if needed

---

## STEP 7 — Add Staff Users

For each staff member:
1. Go to Supabase → **Authentication** → **Users** → **Invite user**
2. Enter their email → **Send invite**
3. They set their password via the email link
4. Admin logs into the app → **Admin Panel** → approve the user

---

## STEP 8 — Custom Domain (Optional)

### On Vercel:
1. Go to your project → **Settings** → **Domains**
2. Click **Add** → enter your domain (e.g. `bills.o2cafe.qa`)
3. Follow Vercel's DNS instructions to point your domain

### On Supabase:
1. Add the custom domain to **Authentication** → **URL Configuration**
2. Add `https://bills.o2cafe.qa/**` to Redirect URLs

---

## STEP 9 — Local Development (for developers)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/ocr-bill-app-bolt.git
cd ocr-bill-app-bolt

# 2. Install dependencies (requires Node.js 20.x)
npm install

# 3. Create .env.local with your Supabase credentials
cp .env.example .env.local
# Edit .env.local with your values

# 4. Run development server
npm run dev
# Open http://localhost:3000
```

---

## Deployment Workflow (Ongoing Updates)

Every time you push code to the `main` branch, Vercel automatically redeploys:

```bash
git add -A
git commit -m "Description of change"
git push origin main
# Vercel deploys automatically in ~60-90 seconds
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Supabase public API key |
| `ANTHROPIC_API_KEY` | Optional | Claude AI key for Hurrier bill accuracy |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Login fails | Check Supabase Auth URL Configuration matches your domain |
| Can't save bills | Run `01_database_setup.sql` again in SQL Editor |
| User not approved | Admin must approve in Admin Panel or via SQL UPDATE |
| Build fails | Ensure Node.js 20.x is selected in Vercel project settings |
| Camera not working | App must be served over HTTPS (Vercel provides this) |

---

## Architecture Diagram

```
User's Browser
     │
     ▼
Vercel (Next.js 14)
     │
     ├─► Tesseract.js (OCR — runs in browser, no server needed)
     │
     ├─► Supabase Auth (login / session)
     │
     └─► Supabase Database (bill_records, profiles)
              │
              └─► PostgreSQL + Row Level Security
```

---

## Support

- **Repository:** github.com/shilmypx/ocr-bill-app-bolt
- **Live App:** ocr-bill-app-bolt-shilmyyoosuf-8436s-projects.vercel.app
- **Supabase Project:** zrlamlvcuqgdckzoxlhv (ap-south-1)
- **Vercel Project ID:** prj_y5NfDPBgR9QKxhhCGg7p5IJmOMN5
