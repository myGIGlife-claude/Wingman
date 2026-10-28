plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.wingman.app"
    compileSdk = 37
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.wingman.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 26
        versionName = "1.12.0"
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
