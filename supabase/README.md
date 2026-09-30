# Sourced Nexus — Supabase Migrations & Image Storage Guide

This folder contains the complete PostgreSQL database schema, Row Level Security (RLS) policies, storage bucket configurations, and seed data to store all Sourced Nexus products, categories, preorders, and images in Supabase.

---

## 🗄️ Structure

- [`migrations/20260930000000_create_sourced_nexus_schema.sql`](./migrations/20260930000000_create_sourced_nexus_schema.sql)
  - Tables: `products`, `categories`, `preorders`
  - Performance indexes for high-speed queries
  - Automatic `updated_at` triggers
  - Full Row Level Security (RLS) policies
  - Storage buckets setup (`product-images`, `category-images`, `preorder-uploads`)
  - Storage bucket public read & upload policies

- [`seed.sql`](./seed.sql)
  - Seeds default luxury categories (`Dresses`, `Suits`, `Heels`, `Shoes`)
  - Pre-populates all curated suits, shoes, heels, and dresses with their sizes, descriptions, and media

---

## 🚀 How to Apply the Migrations

### Option 1: Via Supabase Dashboard (Fastest, No CLI Required)

1. Open your Supabase project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** tab on the left menu.
3. Click **New Query**.
4. Copy the entire contents of [`migrations/20260930000000_create_sourced_nexus_schema.sql`](./migrations/20260930000000_create_sourced_nexus_schema.sql) and paste into the editor.
5. Click **Run** (or press `Ctrl+Enter`).
6. Next, open another new query, copy the contents of [`seed.sql`](./seed.sql), paste and click **Run**.
7. Your tables and public storage buckets are now live!

### Option 2: Using the Supabase CLI

```bash
# Login to Supabase CLI
npx supabase login

# Link your remote Supabase project
npx supabase link --project-ref your-project-ref

# Push migrations
npx supabase db push

# Seed data
npx supabase db reset --linked # or run seed.sql via psql
```

---

## 🖼️ Image Storage in Supabase

Three public storage buckets are created automatically:

| Bucket Name | Purpose | Permissions |
|---|---|---|
| `product-images` | High-res catalog product photography | Public Read, Admin Write |
| `category-images` | Category showcase banners | Public Read, Admin Write |
| `preorder-uploads` | Customer outfit photos uploaded via Pre-Order form | Public Read, Public Upload |

### How Public Image URLs Work
Uploaded images in Supabase Storage have the following CDN URL format:
```
https://<YOUR-PROJECT-REF>.supabase.co/storage/v1/object/public/<BUCKET-NAME>/<IMAGE-FILE-NAME>
```

### Uploading from Code
Use the helper in `src/lib/supabase.js`:
```javascript
import { uploadImageToSupabase } from '@/lib/supabase';

// In an upload handler:
const imageUrl = await uploadImageToSupabase(file, 'product-images');
console.log('Public Supabase image URL:', imageUrl);
```

---

## ⚙️ Environment Variables

Add your Supabase credentials to your local `.env` and to your Render / Vercel deployment dashboards:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```
