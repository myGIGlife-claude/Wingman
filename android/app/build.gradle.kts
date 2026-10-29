import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.google.services)
}

// The permanent release key lives outside the repo (see README, "Release signing"). Without it, release builds come out unsigned and debug builds still work.
val signing = Properties().apply {
    val f = file(System.getenv("WINGMAN_SIGNING") ?: "${System.getProperty("user.home")}/.config/wingman/signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.wingman.app"
    compileSdk = 37
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.wingman.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 39
        versionName = "1.19.0"
    }
    lint { checkReleaseBuilds = false } // the release lint needs extra downloads; the debug build and tests already run on every change
    signingConfigs {
        if (signing.getProperty("storeFile") != null) create("release") {
            storeFile = file(signing.getProperty("storeFile")); storePassword = signing.getProperty("storePassword")
            keyAlias = signing.getProperty("keyAlias"); keyPassword = signing.getProperty("keyPassword")
        }
    }
    buildTypes {
        release { signingConfig = signingConfigs.findByName("release") }
    }
}

dependencies {
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.work)
    implementation(libs.core.ktx)
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
