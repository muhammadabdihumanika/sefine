# Aplikasi Android — Sefine

Karena app web Sefine sudah **PWA** (manifest + service worker + ikon), cara tercepat & resmi untuk punya **APK Android yang 100% sama** adalah **membungkus PWA-nya** menjadi aplikasi native — **tanpa menulis ulang UI**. Google menyebutnya **Trusted Web Activity (TWA)**.

> Hasilnya: aplikasi Android yang membuka app web Anda layar penuh (tanpa address bar), ikon sendiri, bisa di-upload ke Play Store. **Update cukup redeploy web** — tidak perlu rebuild APK untuk perubahan tampilan/fitur.

## Prasyarat

1. **Deploy app web ke HTTPS** (TWA butuh URL publik). Paling mudah: Vercel.
   ```bash
   vercel        # atau hubungkan repo di vercel.com → dapat URL https://...
   ```
   Catat URL produksi (mis. `https://sefine.vercel.app`).

2. **Alat build Android** di komputer Anda (TIDAK bisa dijalankan dari sandbox ini):
   - **JDK 17** (mis. Temurin).
   - **Android Studio** (atau Android SDK command-line tools) — untuk SDK + build tools.

## Opsi A — TWA via Bubblewrap (direkomendasikan, resmi Google)

```bash
# di luar repo ini (folder baru), jalankan:
npx @bubblewrap/cli init --manifest https://<URL-PRODUKSI>/manifest.webmanifest
```
Bubblewrap akan membaca manifest + ikon PWA dan menanyakan:
- **Application name**: Sefine
- **Short name**: Sefine
- **Application ID** (package): mis. `cloud.sefine.app` (harus unik)
- sisanya default.

Lalu build APK/AAB:
```bash
npx @bubblewrap/cli build
```
Bubblewrap mencetak **SHA-256 fingerprint** sertifikat signing Anda — catat.

### Verifikasi (biar tanpa address bar)
Set di env hosting Next Anda:
```
TWA_PACKAGE_NAME=cloud.sefine.app
TWA_SHA256_FINGERPRINT=<hasil dari bubblewrap build>
```
Lalu redeploy web. File `/.well-known/assetlinks.json` (sudah ada di app ini) akan menyajikannya. Cek:
```
https://<URL-PRODUKSI>/.well-known/assetlinks.json
```
Lalu di project TWA: `npx @bubblewrap/cli update` (ambil assetlinks) → rebuild.

### Upload ke Play Store
- `bubblewrap build` menghasilkan `.aab` → upload di **Play Console** (App bundles).
- Atau `.apk` untuk tes langsung install di HP.

## Opsi B — Capacitor (alternatif: WebView wrapper dalam repo ini)

Kalau Anda mau project Android hidup **di dalam repo**, pakai Capacitor dengan **remote URL** (karena Next SSR tidak bisa di-static-export):

```bash
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/android
npx cap init Sefine cloud.sefine.app --web-dir=dist
```
Edit `capacitor.config.ts`:
```ts
server: { url: "https://<URL-PRODUKSI>", cleartext: true }
```
```bash
npx cap add android
npx cap open android   # buka di Android Studio → Run / Build APK
```
Hasilnya WebView yang memuat app web (efek mirip TWA). Kelebihan: bisa akses API native via plugin Capacitor bila nanti perlu (kamera, notif, dll).

## Catatan penting
- **Tanpa deploy web ke HTTPS**, TWA/Capacitor tidak bisa mengambil app (Android app memuat URL live). Jadi deploy dulu.
- **Identik dengan web**: semua fitur (auth, org+RBAC, keuangan, AI chat/WA, kredit) sama persis — tidak ada duplikasi kode.
- **PWA sudah installable langsung di Android** lewat Chrome → "Add to Home screen" **tanpa** bikin APK. TWA/Capacitor hanya untuk **Play Store** + pengalaman lebih "native".
- Saya tidak bisa membuat/menandatangani APK di environment ini (butuh Android SDK/Gradle/JDK). Semua perintah di atas dijalankan **di mesin Anda**.
