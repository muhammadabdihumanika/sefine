# Sefine

Web app **mobile-first** untuk mencatat keuangan pribadi & rumah tangga. Buat **organisasi** (keluarga/tim), undang anggota dengan **RBAC**, catat uang masuk/keluar/transfer, tagihan berulang, pinjaman, cicilan, anggaran & target. Fitur unggulan: **asisten AI** lewat **WhatsApp** dan **chat web** yang bisa baca data keuangan & input transaksi, dengan **pelacakan kredit** (fondasi langganan). Tema **liquid glass biru**, installable **PWA**.

> Panduan setup lengkap & verifikasi: **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

## Fitur

**Akun & organisasi**
- Autentikasi (email + magic link + Google + password), profil otomatis.
- Organisasi + undang anggota (kode undangan / email), ganti organisasi aktif.
- RBAC: **owner / admin / member / viewer** (konfigurabel); plus **super admin** platform.
- Keamanan: semua data org-scoped via **RLS** + RPC *security definer*.

**Pencatatan keuangan**
- Rekening (kas/bank/e-wallet/kredit/investasi), kategori (seed otomatis + akun default per kategori).
- Transaksi: **masuk / keluar / transfer** (double-entry), quick-add via bottom-sheet, **edit** + **hapus (dengan konfirmasi)**.
- **Tagihan** berulang sampai bulan tertentu, **pinjaman** (lent/borrowed), **cicilan** (progres x/n), **anggaran** (vs realisasi), **target tabungan**.
- **Rekonsiliasi saldo**: samakan saldo tercatat dengan saldo nyata (auto catat penyesuaian).
- Dashboard: total saldo, pemasukan vs pengeluaran, tagihan berikutnya, belanja per kategori, aktivitas terbaru. Realtime.

**AI (multi-provider + kredit)**
- **Chat web** (✨ di TopBar): sesi/riwayat percakapan, lanjut/buat baru, saran cepat, bisa **input transaksi**.
- **Asisten WhatsApp** (Meta Cloud API): deteksi nomor → jawab info keuangan → catat transaksi (dengan konfirmasi "YA").
- **Multi-provider**: Anthropic Claude / OpenAI / **OpenAI-compatible (mis. 9router via base URL kustom)**.
- **Super admin** mengelola AI (key tersimpan **terenkripsi** di DB) + melihat **penggunaan kredit** per pengguna.

**Tampilan**
- Tema **liquid glass** biru (glassmorphism), terang/gelap, animasi background.
- Mobile-first: bottom-nav, bottom-sheets, datepicker kalender, dialog konfirmasi, safe-area.
- **PWA** installable + offline shell.

## Stack

- **Frontend:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · next-themes · recharts
- **Backend:** Supabase (Postgres, Auth, RLS, Edge Functions/Deno, Realtime, Storage, Vault)
- **AI:** abstraksi provider (Anthropic + OpenAI), tool-use keuangan, pelacakan kredit
- **WhatsApp:** Meta Cloud API (webhook → Edge Function)

## Struktur

```
app/            # rute App Router: (auth), (onboarding), (app){dashboard,transactions,bills,
                #   keuangan(Tagihan/Anggaran/Target gabung), chat, settings/*}
components/     # ui(shadcn), glass, shell, transactions, accounts, categories, bills, budgets,
                #   goals, loans, installments, keuangan, chat, settings, auth, pwa
lib/            # rbac, session, format, env
utils/supabase/ # server.ts, client.ts, middleware.ts
proxy.ts        # Next 16 (middleware → proxy)
supabase/
  migrations/   # 0001_init_core … 0010_recurring_income
  all_in_one.sql# gabungan seluruh migrasi (tempel sekali)
  functions/    # whatsapp-webhook, ai-chat, ai-test, _shared/ai (modular, untuk CLI)
  dashboard/    # ai-test.ts, ai-chat.ts (self-contained, untuk deploy via Dashboard web)
docs/DEPLOY.md  # setup & verifikasi lengkap
```

## Mulai

```bash
npm install
cp .env.example .env.local   # isi URL + publishable key Supabase
npm run dev                  # http://localhost:3000
```

Lalu terapkan database + deploy fungsi AI mengikuti **[`docs/DEPLOY.md`](docs/DEPLOY.md)** (migrasi `all_in_one.sql`, Vault secret, super admin, deploy Edge Functions, konfigurasi AI).

## Catatan

- **Publishable key** aman di browser (dilindungi RLS). **Service-role key** hanya di Edge Function.
- Kunci API AI per-org/platform tersimpan **terenkripsi** (`platform_ai_config`), didekripsi hanya di Edge Function.
- AI berjalan di Edge Function (cloud) → **tidak membaca `.env.local`**; key diisi di Pengaturan → Integrasi.
- Skrip bash di repo menggunakan `npm`; supabase CLI dipakai untuk DB & deploy fungsi.
