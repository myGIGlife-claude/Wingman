package com.wingman.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

// Updates come from our own server, only to signed-in users. The app checks, shows "Update available", downloads, and hands the file to Android's installer.
// Android always asks you to tap Install, and the new APK must be signed with the same release key as the installed one.
object Update {
    class Info(val code: Int, val name: String, val size: Long, val sha: String, val notes: String)

    // Blocking. Returns the newer release, or null when you are up to date, signed out, or offline.
    fun check(c: Context): Info? {
        val (code, body) = Api.send(c, "GET", "/update")
        if (code != 200) return null
        return try {
            val j = JSONObject(body)
            if (!j.has("code")) null else Info(j.getInt("code"), j.optString("name"), j.optLong("size"), j.optString("sha"), j.optString("notes")).takeIf { it.code > BuildConfig.VERSION_CODE }
        } catch (e: Exception) { null }
    }

    // Blocking. Saves the APK in the app's cache, checks its fingerprint, and returns the file (null if anything is off).
    fun download(c: Context, i: Info, progress: (Int) -> Unit): File? {
        val base = Prefs.get(c, "url").trimEnd('/'); val key = Prefs.get(c, "secret")
        if (base.isEmpty() || key.isEmpty()) return null
        return try {
            val dir = File(c.cacheDir, "updates").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
            val out = File(dir, "wingman-${i.code}.apk")
            val h = URL("$base/update/apk").openConnection() as HttpURLConnection
            h.setRequestProperty("X-Wingman-Key", key); h.connectTimeout = 15000; h.readTimeout = 60000
            if (h.responseCode != 200) return null
            val md = MessageDigest.getInstance("SHA-256"); var got = 0L; val total = if (i.size > 0) i.size else h.contentLengthLong
            h.inputStream.use { ins -> out.outputStream().use { os ->
                val buf = ByteArray(32768)
                while (true) { val n = ins.read(buf); if (n < 0) break; os.write(buf, 0, n); md.update(buf, 0, n); got += n; if (total > 0) progress((got * 100 / total).toInt()) }
            } }
            val sha = md.digest().joinToString("") { "%02x".format(it) }
            if (i.sha.isNotEmpty() && !sha.equals(i.sha, true)) { out.delete(); null } else out
        } catch (e: Exception) { null }
    }

    // Opens the system installer. If installs from this app are not allowed yet, opens that setting first (once).
    fun install(a: Activity, f: File) {
        if (!a.packageManager.canRequestPackageInstalls()) {
            a.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.packageName))); return
        }
        val uri = FileProvider.getUriForFile(a, a.packageName + ".files", f)
        a.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
