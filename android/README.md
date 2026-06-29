# Sefine — Android App (Kotlin + AdMob)

Aplikasi Android **native Kotlin** (`com.evertahumanics.sefine`) berbasis **WebView** yang memuat app web Sefine (UI identik 100%) + **AdMob** (banner + interstitial + native card). Cocok untuk Play Store + monetisasi.

## Struktur
```
android/
  app/src/main/java/com/evertahumanics/sefine/
    App.kt            # Application class (init Google Mobile Ads)
    MainActivity.kt   # WebView + AdMob (bottom banner, top banner, interstitial) + JS bridge
  app/src/main/res/
    layout/activity_main.xml   # topAdView (hidden) + WebView + bottom AdView
    values/                     # strings, colors, themes (light/dark)
    xml/network_security_config.xml
    mipmap-*/ic_launcher.png    # launcher icons
  app/build.gradle.kts          # namespace: com.evertahumanics.sefine, deps: play-services-ads
```

## Cara pakai (di Android Studio)
1. Buka folder `android/` di **Android Studio** (File → Open).
2. Android Studio akan generate **Gradle wrapper** + sync dependencies (butuh internet). Kalau diminta, set JDK 17.
3. **Konfigurasi** di `MainActivity.kt` (baris `webUrl`):
   - Produksi: `"https://<URL-DEPLOY-WEB>"`.
   - Dev emulator: `"http://10.0.2.2:3000"`.
4. **Run** ▶ → app memuat web Sefine + iklan AdMob muncul.

## Penempatan Iklan (AdMob)

| Jenis | Lokasi | Cara kerja |
|---|---|---|
| **Banner bawah** | Selalu terlihat (layout) | Native `AdView` di bawah WebView |
| **Banner atas** | Halaman Transaksi saja | `topAdView` (hidden default) → bridge `showTopBanner()` / `hideTopBanner()` |
| **Native card** | Di antara grup transaksi | `AdNativeCard` web component (kartu "Ruang iklan") |
| **Interstitial** | Saat tap nav **"Saya"** | Bridge `showInterstitial()` sebelum navigasi |

Web app mendeteksi Android via `window.Android.isNativeApp()` dan memicu iklan native sesuai konteks. Di browser web: **semua iklan hidden**.

## Konfigurasi AdMob
Saat ini memakai **ID test** (banner `.../6300970111`, interstitial `.../1033173712`). Iklan test tampil tanpa setup. Untuk produksi:
1. Buat akun + aplikasi di **AdMob Console** → dapatkan **App ID** + buat unit iklan.
2. Ganti di kode:
   - `AndroidManifest.xml` → `APPLICATION_ID` → App ID Anda.
   - `MainActivity.kt` → `bannerUnitId` + `interstitialUnitId` → ID unit Anda.

## Bridge JS ↔ Kotlin
```js
// di web app:
window.Android?.isNativeApp?.()       // → true jika di app Android
window.Android?.showInterstitial?.()  // → tampilkan interstitial
window.Android?.showTopBanner?.()     // → tampilkan banner atas
window.Android?.hideTopBanner?.()     // → sembunyikan banner atas
```

## Build APK / AAB
- Debug APK: Build → Build Bundle(s)/APK(s) → Build APK(s).
- Release AAB: Build → Generate Signed Bundle/APK → pilih Android App Bundle → buat keystore.

## Catatan
- **App web harus di-deploy ke HTTPS**. Tanpa deploy, app Android kosong.
- **Cookie + localStorage** aktif di WebView → sesi Supabase + tema tersimpan.
- **Banner AdMob** di luar viewport web → bottom-nav web tidak tertutup.
- **UI identik** dengan web; update fitur cukup redeploy web — tidak perlu rebuild APK.
- Gradle wrapper di-generate Android Studio saat pertama sync.
