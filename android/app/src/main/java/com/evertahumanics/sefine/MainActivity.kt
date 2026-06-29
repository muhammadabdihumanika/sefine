package com.evertahumanics.sefine

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.evertahumanics.sefine.databinding.ActivityMainBinding

/**
 * Memuat app web Sefine (WebView) + AdMob (banner & interstitial).
 * UI identik 100% dengan web. AdMob berjalan native (lebih baik daripada iklan web,
 * dan AdMob butuh native Android).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    // ====== KONFIGURASI ======
    /** URL app web Sefine (HTTPS produksi). Untuk dev di emulator Android: "http://10.0.2.2:3000" */
    private val webUrl = "https://sefine.vercel.app"

    /** ID unit iklan AdMob TEST. Ganti dengan ID Anda (buat di AdMob console). */
    private val bannerUnitId = "ca-app-pub-3940256099942544/6300970111"
    private val interstitialUnitId = "ca-app-pub-3940256099942544/1033173712"
    // =========================

    private var interstitialAd: InterstitialAd? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()
        setupBannerAd()
        setupTopBanner()
        loadInterstitial()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        binding.webview.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true            // localStorage (tema, dll.)
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                setSupportZoom(false)
                userAgentString = (userAgentString ?: "") + " SefineAndroid/1.0"
            }
            // Cookie penting untuk sesi login Supabase
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webViewClient = WebViewClient()
            addJavascriptInterface(WebBridge(), "Android")
            loadUrl(webUrl)
        }
    }

    private fun setupBannerAd() {
        binding.adView.apply {
            adUnitId = bannerUnitId
            setAdSize(AdSize.BANNER)
            loadAd(AdRequest.Builder().build())
        }
    }

    private fun setupTopBanner() {
        binding.topAdView.apply {
            adUnitId = bannerUnitId
            setAdSize(AdSize.BANNER)
        }
    }

    /** Show the top banner (called from web via JS bridge). */
    fun showTopBanner() {
        binding.topAdView.apply {
            visibility = android.view.View.VISIBLE
            loadAd(AdRequest.Builder().build())
        }
    }

    /** Hide the top banner (called from web via JS bridge). */
    fun hideTopBanner() {
        binding.topAdView.visibility = android.view.View.GONE
    }

    private fun loadInterstitial() {
        InterstitialAd.load(
            this,
            interstitialUnitId,
            AdRequest.Builder().build(),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) { interstitialAd = ad }
                override fun onAdFailedToLoad(error: LoadAdError) { interstitialAd = null }
            }
        )
    }

    /** Tampilkan interstitial bila sudah termuat, kalau tidak muat ulang. */
    fun showInterstitial() {
        val ad = interstitialAd
        if (ad != null) {
            ad.show(this)
            interstitialAd = null
            loadInterstitial()
        } else {
            loadInterstitial()
        }
    }

    /**
     * Bridge JS <-> Kotlin. Web bisa panggil:
     *   window.Android.isNativeApp()        // deteksi sedang di app Android
     *   window.Android.showInterstitial()   // picu iklan interstitial native
     */
    inner class WebBridge {
        @JavascriptInterface
        fun isNativeApp(): Boolean = true

        @JavascriptInterface
        fun showInterstitial() {
            runOnUiThread { this@MainActivity.showInterstitial() }
        }

        @JavascriptInterface
        fun showTopBanner() {
            runOnUiThread { this@MainActivity.showTopBanner() }
        }

        @JavascriptInterface
        fun hideTopBanner() {
            runOnUiThread { this@MainActivity.hideTopBanner() }
        }
    }

    /** Tombol back: mundur dulu di riwayat WebView, baru keluar app. */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && binding.webview.canGoBack()) {
            binding.webview.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onPause() {
        binding.webview.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        binding.webview.onResume()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        binding.webview.destroy()
        super.onDestroy()
    }
}
