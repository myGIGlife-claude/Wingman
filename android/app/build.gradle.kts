plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.wingman.app"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.wingman.app"
        minSdk = 26
        targetSdk = 36
        versionCode = (System.getenv("WINGMAN_VERSION_CODE") ?: "1").toInt()
        versionName = "1.0.0"
    }
}

dependencies {
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.work)
    implementation(libs.core.ktx)
}
