package com.wingman.app

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.widget.*
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

// Sign up with an invite code, check what your Torn key can do, change it, or delete the account.
class AccountActivity : Activity() {
    private lateinit var col: LinearLayout
    private lateinit var report: LinearLayout
    private lateinit var status: TextView
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
    private fun ui(f: () -> Unit) = runOnUiThread(f)
    private fun bg(f: () -> Unit) = Thread { try { f() } catch (e: Throwable) { say("Error: $e", STOP) } }.start()
    private fun say(t: String, c: Int = DIM) = ui { status.text = t; status.setTextColor(c) }

    private fun txt(t: String, c: Int, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = t; setTextColor(c); textSize = size; typeface = if (bold) Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) else Typeface.MONOSPACE
    }
    private fun field(hint: String, secret: Boolean = false) = EditText(this).apply {
        setHint(hint); setHintTextColor(DIM); setTextColor(PAPER); typeface = Typeface.MONOSPACE; setSingleLine(); textSize = 15f
        if (secret) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
    }
    private fun button(t: String, primary: Boolean, click: () -> Unit) = Button(this).apply {
        text = t.uppercase(); typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); textSize = 13f; letterSpacing = 0.08f
        setTextColor(if (primary) Color.parseColor("#0E0E0C") else AMBER); setBackgroundResource(if (primary) R.drawable.btn_amber else R.drawable.btn_ghost_amber)
        setOnClickListener { click() }
    }.also { col.addView(it, LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(10) }) }
    private fun label(t: String) = col.addView(txt(t.uppercase(), DIM, 11f).apply { letterSpacing = 0.08f; setPadding(0, dp(14), 0, dp(4)) })

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(24)) }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col); Ui.fitSystemBars(this) })
        draw()
    }

    private fun draw() {
        col.removeAllViews()
        col.addView(txt("ACCOUNT", AMBER, 24f, true).apply { letterSpacing = 0.1f })
        status = txt("", DIM, 12f).apply { setPadding(0, dp(8), 0, 0) }; col.addView(status)
        report = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(8), 0, 0) }
        if (Prefs.get(this, "url").isEmpty() || Prefs.get(this, "secret").isEmpty()) signedOut() else { say("Loading…"); bg { loadMe() } }
    }

    // ---- Not signed in: invite code and Torn key ----
    private fun signedOut() {
        col.addView(txt("Create an account to use Wingman. You need an invite code and a Torn API key.", DIM, 13f).apply { setPadding(0, dp(6), 0, 0) })
        col.addView(txt("Which key? Make a Limited Access key in Torn (Settings, API Keys). Wingman only reads your data. Full access is not needed and is less safe.", AMBER, 12f).apply { setPadding(0, dp(8), 0, 0) })
        val url = field("https://…run.app").apply { setText(Prefs.get(this@AccountActivity, "url").ifEmpty { DEFAULT_URL }) }
        val invite = field("invite code", true); val key = field("Torn API key (16 characters)", true)
        label("Server"); col.addView(url); label("Invite code"); col.addView(invite); label("Torn API key"); col.addView(key)
        col.addView(report)
        fun hdr() = mapOf("X-Invite-Code" to invite.text.toString().trim())
        fun body() = JSONObject().put("tornKey", key.text.toString().trim()).toString()
        button("Check my key", false) { say("Checking…"); bg { val (c, t) = Api.send(this, "POST", "/keycheck", body(), hdr(), false, url.text.toString().trim()); showResult(c, t) } }
        button("Create account", true) {
            say("Creating account…")
            bg {
                val (c, t) = Api.send(this, "POST", "/signup", body(), hdr(), false, url.text.toString().trim())
                if (c != 200) { say(errorOf(c, t), STOP); return@bg }
                Prefs.put(this, "url", url.text.toString().trim()); Prefs.put(this, "secret", JSONObject(t).getString("token"))
                FirebaseMessaging.getInstance().token.addOnSuccessListener { tk -> Prefs.put(this, "token", tk); bg { Api.register(this, tk); Api.refresh(this, true) } }
                ui { draw() }
            }
        }
    }

    // ---- Signed in ----
    private fun loadMe() {
        val (c, t) = Api.send(this, "GET", "/me")
        if (c == 401) { Prefs.put(this, "secret", ""); ui { draw() }; return }
        if (c != 200) { say("Could not reach the server (${if (c == 0) "offline" else c}).", STOP); return }
        val me = JSONObject(t); val owner = me.optString("id") == "owner"
        ui {
            say("")
            col.addView(txt(if (owner) "Server owner" else "Signed in as ${me.optString("name").ifEmpty { me.optString("id") }}", PAPER, 15f, true).apply { setPadding(0, dp(8), 0, 0) })
            col.addView(txt(if (owner) "Your Torn key is set on the server." else "Torn key ending ${me.optString("keyLast4", "••••")}${me.optString("keyLevel").takeIf { it.isNotEmpty() && it != "null" }?.let { " · $it access" } ?: ""}", DIM, 13f))
            col.addView(report)
            button("Check my key", true) { say("Checking…"); bg { val (c2, t2) = Api.send(this, "POST", "/keycheck", "{}"); showResult(c2, t2) } }
            if (!owner) {
                label("Change Torn key")
                val nk = field("new Torn API key", true); col.addView(nk)
                button("Check and save new key", false) {
                    say("Checking…")
                    bg { val (c2, t2) = Api.send(this, "PUT", "/key", JSONObject().put("tornKey", nk.text.toString().trim()).toString()); showResult(c2, t2, saved = c2 == 200) }
                }
                button("Delete my account", false) {
                    AlertDialog.Builder(this).setTitle("Delete account?").setMessage("This removes your key, settings and devices from the server.")
                        .setPositiveButton("Delete") { _, _ -> bg { val (c2, t2) = Api.send(this, "DELETE", "/account"); if (c2 == 200) { Prefs.put(this, "secret", ""); ui { draw() } } else say(errorOf(c2, t2), STOP) } }
                        .setNegativeButton("Cancel", null).show()
                }
            }
            button("Sign out of this phone", false) { Prefs.put(this, "secret", ""); draw() }
        }
    }

    private fun errorOf(code: Int, body: String) = if (code == 0) "No connection to the server." else try { JSONObject(body).optString("error", "Error $code") } catch (e: Exception) { "Error $code" }

    // Draws a key report: what works, what does not, and what to do about it.
    private fun showResult(code: Int, body: String, saved: Boolean = false) {
        val j = try { JSONObject(body) } catch (e: Exception) { null }
        val r = j?.optJSONObject("report") ?: j?.takeIf { it.has("features") }
        if (r == null) { say(errorOf(code, body), STOP); return }
        ui {
            report.removeAllViews()
            val core = r.optBoolean("ok")
            say(if (saved) "Key saved." else if (code in 200..299) (if (core) "Key works." else "This key cannot be used.") else errorOf(code, body), if (code in 200..299 && core) GO else STOP)
            report.addView(txt("Access level: ${r.optString("level").uppercase()}", PAPER, 13f, true))
            val fs = r.optJSONArray("features")
            for (i in 0 until (fs?.length() ?: 0)) {
                val f = fs!!.getJSONObject(i)
                report.addView(if (f.optBoolean("ok")) txt("✓ ${f.optString("label")}", GO, 13f) else txt("✗ ${f.optString("label")}: ${f.optString("why")}", if (f.optBoolean("core")) STOP else YELLOW, 13f))
            }
            val ad = r.optJSONArray("advice")
            for (i in 0 until (ad?.length() ?: 0)) report.addView(txt(ad!!.getString(i), AMBER, 12f).apply { setPadding(0, dp(8), 0, 0) })
        }
    }

    companion object { const val DEFAULT_URL = "https://wingman-backend-6aw2bbejsa-ue.a.run.app" }
}
