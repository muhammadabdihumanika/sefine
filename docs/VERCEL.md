# Deploy Web App ke Vercel

Panduan ini hanya untuk **frontend Next.js**. Backend (database, Auth, RLS, Edge Functions, Vault) sudah diatur via [`docs/DEPLOY.md`](./DEPLOY.md) — pastikan langit-langit itu sudah selesai dulu.

> **Intinya:** Vercel hanya menjalankan web app. AI chat/WhatsApp/*test koneksi* tetap berjalan di **Supabase Edge Functions** (terpisah dari Vercel). Karena app memanggil Edge Function lewat URL Supabase (`functions.invoke("ai-chat")`), tidak ada env tambahan di Vercel untuk itu.

---

## 0. Yang harus sudah siap

- ✅ Migrasi `supabase/all_in_one.sql` sudah ditempel (cek: `select count(*) from ai_conversations;` jalan tanpa error).
- ✅ `npm run build` hijau lokal (sudah diverifikasi: 25 route, Proxy aktif, 0 warning).
- ✅ Node 22 (lokal pakai 22.21; `engines.node` di `package.json` meminta `>=20.9.0`).

---

## 1. Environment Variables (wajib sebelum build)

Di Vercel → **Settings → Environment Variables**, tambahkan untuk **Production** dan **Preview** (keduanya, karena `NEXT_PUBLIC_*` di-inline saat build):

| Nama | Nilai | Wajib? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hafmdcjnyxmccyucrcia.supabase.co` | **Ya** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (lihat `.env.local`) | **Ya** |
| `TWA_PACKAGE_NAME` | `com.evertahumanics.sefine` | Opsional (default sudah benar) |
| `TWA_SHA256_FINGERPRINT` | sidik jari SHA256 cert signing Android | Opsional (verified app links) |

> ⚠️ **Tidak perlu** di-set di Vercel:
> - `API_KEY_9ROUTER` — kunci AI 9router **diisi lewat UI** (Pengaturan → Integrasi → Provider AI), tersimpan terenkripsi di database. Bukan env var.
> - `SUPABASE_SERVICE_ROLE_KEY`, `WA_*` — secret Edge Function, di-set via `supabase secrets set`, **bukan** Vercel.

> 💡 Pakai nilai yang sama untuk Production & Preview supaya preview deploy bisa dipakai uji coba. Tandai keduanya saat menambah var.

---

## 2. Pilih cara deploy

### A. CLI (paling cepat — tanpa git remote)

```bash
npm i -g vercel          # sekali
cd /path/ke/sefine
vercel                   # preview deploy: membuat project + URL *.vercel.app
vercel --prod            # deploy production
```

Saat pertama `vercel`, jawab prompt: scope (akunmu), nama project `sefine`, direktori `.` , framework **Next.js** (auto-detect), settings default. Lalu tambahkan env var (langkah 1) lewat dashboard dan `vercel --prod` lagi (env harus ada **sebelum** build production agar `NEXT_PUBLIC_*` ter-inline).

Set env lewat CLI (alternatif dashboard):
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel --prod   # rebuild dengan env baru
```

### B. Git import (rekomendasi — auto-deploy tiap push)

1. Push repo ke GitHub:
   ```bash
   git remote add origin git@github.com:<user>/sefine.git
   git push -u origin main
   ```
   (Repo lokal saat ini **belum punya remote** — tambahkan dulu.)
2. Vercel dashboard → **Add New… → Project** → import repo `sefine`.
3. Framework: **Next.js** (terdeteksi otomatis). Build command `next build`, output `.next` — biarkan default. **Tidak perlu `vercel.json`.**
4. Tambahkan env var (langkah 1) → **Deploy**. Tiap push ke `main` → deploy production otomatis; PR → preview deploy.

---

## 3. Update Supabase Auth (URL Redirect)

Setelah dapat URL produksi (`https://sefine.vercel.app` atau domain kustom), tambahkan ke:

**Supabase Studio → Authentication → URL Configuration**
- **Site URL:** `https://<domain-produksi>` (untuk magic link / OAuth redirect pasca-login).
- **Redirect URLs:** tambahkan:
  - `https://<domain-produksi>/callback`
  - `https://<preview>.vercel.app/callback` (agar preview deploy bisa login)
  - `http://localhost:3000/callback` (dev)

Tanpa ini, login Google / magic link redirect ke URL lama / gagal.

---

## 4. Custom domain (opsional)

Vercel → **Settings → Domains** → tambah domain → ikuti instruksi DNS. Setelah aktif, ulangi langkah 3 dengan domain baru.

---

## 5. Verifikasi pasca-deploy

1. Buka URL produksi → halaman login muncul (belum ada sesi).
2. Daftar / login (magic link atau Google). Pastikan redirect `/callback` → `/` dashboard berfungsi.
3. Buat organisasi → rekening + kategori → catat transaksi → saldo muncul di dashboard.
4. **Chat AI (✨ TopBar):** coba "Berapa saldo saya?" — butuh Edge Function `ai-chat` sudah di-deploy (DEPLOY.md §6).
5. **Tes koneksi** di Integrasi → Provider AI — butuh Edge Function `ai-test`.
6. **Install PWA** (Chrome/Edge → install) — service worker `/sw.js` & manifest otomatis tersedia di Vercel (file statik di `public/`).
7. Cek **Vercel → Deployment Logs** bila ada error runtime.

---

## 6. Catatan teknis (kenapa ini berjalan tanpa konfigurasi tambahan)

- **`proxy.ts` = middleware Next 16.** Vercel menjalankannya di Edge runtime otomatis (refresh sesi Supabase + redirect optimis). Build output menandai `ƒ Proxy (Middleware)`.
- **PWA:** `public/sw.js` (cache offline network-first) + `app/manifest.ts` → `/manifest.webmanifest` keduanya statik, langsung bekerja.
- **`next/font/google` (Geist):** Vercel unduh saat build — tidak perlu konfigurasi.
- **Server Actions & Route Handlers** (`/callback`, `/.well-known/assetlinks.json`) → serverless functions otomatis.
- **Edge Functions AI/WA tetap di Supabase**, dipanggil app via `NEXT_PUBLIC_SUPABASE_URL`. Tidak ada perubahan saat pindah dari dev ke Vercel.

---

## 7. Troubleshooting

| Gejala | Sebab | Solusi |
|---|---|---|
| Build gagal: `Missing env var NEXT_PUBLIC_SUPABASE_URL` | env belum di-set sebelum build | Tambah env (langkah 1), lalu **Redeploy** (build ulang). |
| Login redirect ke `localhost` / error | Site URL Supabase masih localhost | Update Site URL & Redirect URLs (langkah 3). |
| "Failed to fetch" di chat AI / tes koneksi | Edge Function belum di-deploy | Deploy `ai-chat` & `ai-test` (DEPLOY.md §6). |
| Provider AI gagal simpan ("Vault belum dikonfigurasi") | Vault secret belum dibuat | `select vault.create_secret('...', 'sefine_ai_key')` (DEPLOY.md §3). |
| Preview deploy tak bisa login | Redirect URL preview belum ditambah | Tambah `https://<preview>.vercel.app/callback` (langkah 3). |
| `engine`/Node tidak kompatibel | Versi Node Vercel terlalu lama | Settings → General → Node.js Version = **22.x**. |
