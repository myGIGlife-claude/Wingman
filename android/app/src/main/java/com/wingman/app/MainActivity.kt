package com.wingman.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.*
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject

// Settings screen, built in code (departure-board look, see colors in res/values).
class MainActivity : Activity() {
    private val dests = listOf("mex" to "Mexico", "cay" to "Cayman Islands", "can" to "Canada", "haw" to "Hawaii", "uni" to "United Kingdom",
        "arg" to "Argentina", "swi" to "Switzerland", "jap" to "Japan", "chi" to "China", "uae" to "UAE", "sou" to "South Africa")
    private val methods = listOf("standard" to "Standard", "airstrip" to "Airstrip (x0.7)", "wlt" to "WLT benefit (x0.5)", "business" to "Business class (x0.3)")
    private val amber = Color.parseColor("#FFB627")
    private val paper = Color.parseColor("#EDE7D3")
    private val dim = Color.parseColor("#908975")

    private lateinit var url: EditText; private lateinit var secret: EditText
    private lateinit var dest: Picker; private lateinit var item: Picker; private lateinit var method: Picker
    private lateinit var shop: EditText; private lateinit var safety: EditText; private lateinit var cap: EditText
    private lateinit var xanax: CheckBox; private lateinit var status: TextView

    private fun label(t: String) = TextView(this).apply { text = t.uppercase(); setTextColor(dim); textSize = 11f; letterSpacing = 0.12f; typeface = Typeface.MONOSPACE; setPadding(0, 28, 0, 4) }
    private fun field(hint: String, num: Boolean = false) = EditText(this).apply {
        setHint(hint); setTextColor(paper); setHintTextColor(dim); typeface = Typeface.MONOSPACE; setSingleLine()
        if (num) inputType = InputType.TYPE_CLASS_NUMBER
    }
    private fun button(t: String, primary: Boolean, click: () -> Unit) = Button(this).apply {
        text = t.uppercase(); typeface = Typeface.MONOSPACE; letterSpacing = 0.1f
        setTextColor(if (primary) Color.parseColor("#0E0E0C") else amber)
        setBackgroundResource(if (primary) R.drawable.btn_amber else R.drawable.btn_ghost_amber)
        setOnClickListener { click() }
    }
    // Button that opens a plain dialog list; avoids Spinner theming problems.
    inner class Picker(private var list: List<Pair<String, String>>) : Button(this@MainActivity) {
        var index = 0
            private set
        var onPick: (() -> Unit)? = null
        val key get() = list.getOrNull(index)?.first ?: ""
        fun setList(l: List<Pair<String, String>>, selectKey: String) { list = l; set(l.indexOfFirst { it.first == selectKey }) }
        init {
            typeface = Typeface.MONOSPACE; setTextColor(paper); isAllCaps = false; gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setBackgroundResource(R.drawable.btn_ghost); set(0)
            setOnClickListener {
                AlertDialog.Builder(this@MainActivity).setItems(list.map { it.second }.toTypedArray()) { _, i -> set(i); onPick?.invoke() }.show()
            }
        }
        fun set(i: Int) { index = i; text = (list.getOrNull(i)?.second ?: if (list.isEmpty()) "No stock data yet" else "Choose an item") + "  ▾" }
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 80, 40, 80) }
        col.addView(TextView(this).apply { text = "WINGMAN"; setTextColor(amber); textSize = 26f; typeface = Typeface.MONOSPACE; letterSpacing = 0.2f })
        col.addView(TextView(this).apply { text = "v" + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"; setTextColor(amber); textSize = 12f; typeface = Typeface.MONOSPACE })
        col.addView(TextView(this).apply { text = "Read-only Torn helper. You tap every action. Foreign stock data: YATA."; setTextColor(dim); textSize = 12f; typeface = Typeface.MONOSPACE })

        url = field("https://…run.app"); secret = field("app secret"); secret.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        url.setText(Prefs.get(this, "url")); secret.setText(Prefs.get(this, "secret"))
        col.addView(label("Backend URL")); col.addView(url); col.addView(label("App secret")); col.addView(secret)
        col.addView(button("Connect and load", true) { connect() })

        dest = Picker(dests); method = Picker(methods)
        item = Picker(emptyList()); dest.onPick = { bg { loadItems(dests[dest.index].first, ""); save() } }; item.onPick = { save() }
        shop = field("3", true); safety = field("10", true); cap = field("29", true)
        xanax = CheckBox(this).apply { text = "Xanax step when drug cooldown is up"; setTextColor(paper); typeface = Typeface.MONOSPACE; isChecked = true }
        col.addView(label("Destination")); col.addView(dest)
        col.addView(label("Item to buy")); col.addView(item)
        col.addView(label("Flight type")); col.addView(method)
        col.addView(label("Shopping minutes")); col.addView(shop)
        col.addView(label("Safety minutes")); col.addView(safety)
        col.addView(label("Items you can carry")); col.addView(cap)
        col.addView(xanax)
        col.addView(button("Save settings", true) { save() })
        col.addView(button("Test notification (this phone)", false) { localTest() })
        col.addView(button("Test push from backend", false) { say("Push requested. Wait a few seconds."); bg { Api.call(this, "POST", "/test") } })
        col.addView(button("Battery: set Unrestricted", false) { batteryHelp() })
        status = TextView(this).apply { setTextColor(dim); typeface = Typeface.MONOSPACE; textSize = 12f; setPadding(0, 24, 0, 0); gravity = Gravity.START }
        col.addView(status)

        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col) })
        Prefs.get(this, "crash").takeIf { it.isNotEmpty() }?.let { status.text = "LAST CRASH:\n$it"; Prefs.put(this, "crash", "") }
        if (Prefs.get(this, "url").isNotEmpty()) load()
    }

    private fun bg(f: () -> Unit) = Thread { try { f() } catch (e: Throwable) { say("Error: " + e.toString()) } }.start()
    private fun say(t: String) = runOnUiThread { status.text = t }

    private fun connect() {
        Prefs.put(this, "url", url.text.toString().trim()); Prefs.put(this, "secret", secret.text.toString().trim())
        say("Connecting…")
        FirebaseMessaging.getInstance().token.addOnSuccessListener { t -> Prefs.put(this, "token", t); bg { Api.register(this, t) } }
        load()
    }

    private fun load() = bg {
        val s = Api.call(this, "GET", "/settings") ?: return@bg say("Could not reach backend. Check URL and secret.")
        val j = JSONObject(s)
        runOnUiThread {
            dest.set(dests.indexOfFirst { it.first == j.optString("dest") }.coerceAtLeast(0))
            method.set(methods.indexOfFirst { it.first == j.optString("method") }.coerceAtLeast(0))
            shop.setText(j.optInt("shopMin", 3).toString()); safety.setText(j.optInt("safetyMin", 10).toString())
            cap.setText(j.optInt("capacity", 29).toString()); xanax.isChecked = j.optBoolean("xanax", true)
        }
        loadItems(j.optString("dest", "mex"), j.optString("item")); Api.refresh(this); say("Connected.")
    }

    // Items sold in the chosen country with stock and price (YATA, player-reported).
    private fun loadItems(d: String, want: String) {
        val r = Api.call(this, "GET", "/items?dest=$d") ?: return
        val a = JSONArray(r)
        val rows = (0 until a.length()).map { a.getJSONObject(it) }.map {
            val n = it.getString("name"); val c = it.optLong("cost"); val q = it.optInt("qty", -1)
            n to "$n · ${if (q >= 0) "$q in stock" else "stock ?"} · $" + "%,d".format(c)
        }
        runOnUiThread { item.setList(if (rows.isEmpty() && want.isNotEmpty()) listOf(want to want) else rows, want) }
    }

    private fun save() = bg {
        val j = JSONObject().put("dest", dests[dest.index].first).put("method", methods[method.index].first)
            .put("item", item.key).put("shopMin", shop.text.toString().toIntOrNull() ?: 3)
            .put("safetyMin", safety.text.toString().toIntOrNull() ?: 10).put("capacity", cap.text.toString().toIntOrNull() ?: 29)
            .put("xanax", xanax.isChecked)
        say(if (Api.call(this, "PUT", "/settings", j.toString()) != null) "Saved." else "Save failed.")
        Api.refresh(this)
    }

    private fun localTest() {
        val on = getSystemService(NotificationManager::class.java).areNotificationsEnabled()
        if (!on) { say("Notifications are BLOCKED for Wingman. Turn them on in Android settings."); startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)); return }
        try { Notifier.alert(this, "Wingman local test", "https://www.torn.com/"); say("Local notification sent.") } catch (e: Throwable) { say("Notify error: $e") }
    }

    private fun batteryHelp() {
        Toast.makeText(this, "Set Battery to Unrestricted, then add Wingman to Never sleeping apps.", Toast.LENGTH_LONG).show()
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }
}
