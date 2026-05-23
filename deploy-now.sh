#!/bin/bash
set -e
echo "🚀 Deploying OCR Bill Capture App to Vercel..."
echo ""

TOKEN="7HSvFljO3c5YJVJ8d7EMMv3JjOgTra5MHlA6l21sEOmMgxNEAb1KAXjb"

# Install vercel CLI if not present
if ! command -v vercel &> /dev/null; then
  echo "📦 Installing Vercel CLI..."
  npm install -g vercel
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy as new project
echo "🌐 Creating new Vercel project and deploying..."
vercel deploy --prod --token="$TOKEN" --yes \
  --env NEXT_PUBLIC_SUPABASE_URL=https://zrlamlvcuqgdckzoxlhv.supabase.co \
  --env NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpybGFtbHZjdXFnZGNrem94bGh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTM3NTUsImV4cCI6MjA5NDU4OTc1NX0.nuqYJDsSkwV9NWmYz0Be1HCVuxYoqRNVkZXEbtftTVM

echo ""
echo "✅ Done! Your app is live."
