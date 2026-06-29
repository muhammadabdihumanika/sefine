# Setup & Verifikasi — Sefine

Backend = project Supabase **hosted** `hafmdcjnyxmccyucrcia`. Jalankan sekali.

## 1. Terapkan migrasi database

Ada 10 file (`supabase/migrations/0001…0010`) atau tempel **`supabase/all_in_one.sql`** sekali.

**A. Dashboard (paling cepat):** Supabase Studio → **SQL Editor** → tempel `supabase/all_in_one.sql` → Run. (Idempoten — boleh dijalankan ulang.)

**B. CLI:**
```bash
supabase link --project-ref hafmdcjnyxmccyucrcia
supabase db push
```

Ringkasan migrasi: 0001 core (org/RBAC/RLS) · 0002 finance · 0003 tagihan/pinjaman/cicilan/anggaran/target · 0004 AI/WhatsApp · 0005 rekonsiliasi · 0006 tagihan berulang sampai bulan X · 0007 super admin + kredit AI · 0008 base URL provider (9router) · 0009 sesi chat · 0010 pendapatan berulang.

## 2. Aktifkan Realtime (opsional — refresh dashboard otomatis)

```sql
alter publication supabase_realtime add table public.transactions;
```

## 3. Vault secret (enkripsi kunci AI)

Kunci API AI disimpan terenkripsi (pgcrypto + Vault). Buat passphrase sekali:

```sql
select vault.create_secret('<passphrase-kuat>', 'sefine_ai_key');
```

Tanpa ini, menyimpan provider AI gagal dengan pesan *"Vault belum dikonfigurasi"*. (Jika error *"vault … does not exist"*: aktifkan dulu di **Database → Vault → Enable**.)

## 4. Tunjuk super admin (platform)

Super admin mengelola AI (provider/key/base URL/model), melihat **penggunaan kredit**, dan daftar model. Tunjuk minimal satu:

```sql
update public.profiles set is_super_admin = true where email = 'you@email.com';
```

Lalu logout → login. Menu **Pengaturan → Penggunaan kredit AI** muncul, dan **Integrasi → Provider AI** bisa diedit.

> **9router & OpenAI-compatible:** Integrasi → Provider AI → provider *OpenAI / kompatibel* → isi **Base URL** (mis. `http://app.everta.cloud:20128/v1`, ada tombol "Isi otomatis: 9router"), **API Key**, **Model**. AI berjalan di Edge Function (cloud) → **tidak membaca `.env.local`**; key diisi di sini (tersimpan terenkripsi).

## 5. Auth (Supabase Studio → Authentication)

- **URL Redirect** tambahkan: `http://localhost:3000/callback` (dev) + URL produksi.
- **Providers:** Email (magic link & password) aktif. Google: isi Client ID/Secret dari Google Cloud Console.
- (Dev cepat) Nonaktifkan *Confirm email* untuk mencoba daftar langsung.

## 6. Deploy Edge Functions

AI (chat + WhatsApp + test) berjalan di Edge Function. Pilih salah satu:

**A. CLI (direkomendasikan — menangani folder `_shared/`):**
```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt   # WA: no-JWT wajib
supabase functions deploy ai-chat                            # web chat (verifikasi JWT, default)
supabase functions deploy ai-test                            # tombol "Tes koneksi"
supabase secrets set WA_VERIFY_TOKEN=... WA_APP_SECRET=... WA_ACCESS_TOKEN=... WA_PHONE_NUMBER_ID=...
```
(`ai-chat`/`ai-test` tidak butuh secret tambahan — `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` otomatis.)

**B. Dashboard (web):** editor Dashboard hanya terima **satu file per fungsi**, jadi gunakan versi self-contained di `supabase/dashboard/`:
- Edge Functions → New function → nama **`ai-test`** → paste `supabase/dashboard/ai-test.ts` → Deploy.
- nama **`ai-chat`** → paste `supabase/dashboard/ai-chat.ts` → Deploy.
- (Nama harus persis — app memanggil via nama.) File ini sudah menyertakan header CORS + penanganan preflight.
- `whatsapp-webhook` self-contained bisa dibuatkan bila dibutuhkan (butuh setup Meta).

**WhatsApp webhook (di Meta for Developers):**
```
https://hafmdcjnyxmccyucrcia.functions.supabase.co/functions/v1/whatsapp-webhook
```
Verify token = nilai `WA_VERIFY_TOKEN`. Meta GET-verifikasi (`hub.challenge`) lalu kirim pesan.

## 7. Verifikasi keamanan (RLS)

```sql
-- Anggota org A TIDAK boleh baca org B:
select * from public.transactions where organization_id = '<org-B-id>'; -- 0 baris / error

-- Viewer TIDAK boleh insert transaksi → harus error RLS.

-- Klien TIDAK boleh baca kunci API AI:
select api_key_encrypted from public.platform_ai_config; -- 0 baris (RLS hard-block)
```

## 8. Tes end-to-end

1. `npm run dev` → daftar → buat organisasi → undang anggota via kode/email.
2. Rekening + kategori → catat masuk/keluar/transfer → cek saldo di dashboard (transfer netral).
3. Tagihan → "Tandai lunas" → muncul transaksi + next_due maju. Tambah anggaran/target/cicilan/pinjaman. Rekonsiliasi rekening (masukkan saldo nyata).
4. Tema Terang/Gelap, resize mobile, install PWA.
5. **Chat AI (✨ di TopBar):** sesi tersimpan/lanjut, tombol ＋ percakapan baru, 🕒 riwayat. Coba "Berapa saldo saya?" atau "Catat belanja 25rb".
6. **Tes koneksi** di Integrasi → Provider AI untuk memastikan key/base URL/model benar.
7. **Penggunaan kredit AI** (super admin) → token/credit per pengguna tercatat tiap panggilan.
8. **WhatsApp:** hubungkan nomor di Integrasi → kirim dari WA ke nomor Bisnis — "Berapa saldo saya?", "Catat belanja 25rb GoFood dari OVO" → balas **YA**. Replay pesan sama → tidak duplikat (idempotensi).
