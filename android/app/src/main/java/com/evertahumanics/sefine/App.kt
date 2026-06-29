package com.evertahumanics.sefine

import android.app.Application
import com.google.android.gms.ads.MobileAds

/**
 * Application entry — inisialisasi Google Mobile Ads (AdMob) sekali saat app start.
 */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        MobileAds.initialize(this) {}
    }
}
