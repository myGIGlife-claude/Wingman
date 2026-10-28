package com.wingman.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject

// Settings screen, built in code (departure-board look). Sections collapse so only what you need is open.
class MainActivity : Activity() {
    private val dests = listOf("mex" to "Mexico", "cay" to "Cayman Islands", "can" to "Canada", "haw" to "Hawaii", "uni" to "United Kingdom",
        "arg" to "Argentina", "swi" to "Switzerland", "jap" to "Japan", "chi" to "China", "uae" to "UAE", "sou" to "South Africa")
    private val methods = listOf("standard" to "Standard", "airstrip" to "Airstrip (x0.7)", "wlt" to "WLT benefit (x0.5)", "business" to "Business class (x0.3)")

    // key, title, what it does, group. The backend holds the defaults and sends each one's current value.
    private class AlertDef(val key: String, val title: String, val desc: String, val group: String, val on: Boolean = true)
    private val alertDefs = listOf(
        AlertDef("ready_to_fly", "Ready to fly", "A trip to your destination fits before your OC", "TRAVEL"),
        AlertDef("landed_in_stock", "Landed, item in stock", "You landed and can buy now", "TRAVEL"),
        AlertDef("landed_sold_out", "Landed, item sold out", "You landed but the shelf is empty", "TRAVEL"),
        AlertDef("restock", "Item back in stock", "Your item restocked while you wait", "TRAVEL"),
        AlertDef("leave_soon", "Leave within 5 minutes", "Last warning to make your OC", "TRAVEL"),
        AlertDef("leave_now", "Leave now", "Fly home now to make your OC", "TRAVEL"),
        AlertDef("landed_home", "Back in Torn", "You landed at home", "TRAVEL"),
        AlertDef("oc_ready", "OC ready", "Stay in Torn, your OC is ready", "YOUR STATUS"),
        AlertDef("hospital_out", "Out of hospital", "You were released", "YOUR STATUS"),
        AlertDef("jail_out", "Out of jail", "You were released", "YOUR STATUS"),
        AlertDef("addiction_up", "Addiction increased", "Your drug addiction penalty went up", "YOUR STATUS"),
        AlertDef("life_full", "Health full", "Your life bar is full", "YOUR STATUS", false),
        AlertDef("step_ready", "Xanax, gym or crimes ready", "Your next home step is ready", "BARS AND COOLDOWNS"),
        AlertDef("energy_full", "Energy full", "Your energy bar is full", "BARS AND COOLDOWNS", false),
        AlertDef("nerve_full", "Nerve full", "Your nerve bar is full", "BARS AND COOLDOWNS", false),
        AlertDef("drug_ready", "Drug cooldown over", "You can take a drug again", "BARS AND COOLDOWNS", false),
        AlertDef("booster_ready", "Booster cooldown over", "You can use a booster again", "BARS AND COOLDOWNS", false),
        AlertDef("medical_ready", "Medical cooldown over", "You can use a medical item again", "BARS AND COOLDOWNS", false),
    )
    private val alertState = mutableMapOf<String, Boolean>().also { m -> alertDefs.forEach { m[it.key] = it.on } }
    private var alertsBody: LinearLayout? = null

    private val amber = Color.parseColor("#FFB627")
    private val paper = Color.parseColor("#EDE7D3")
    private val dim = Color.parseColor("#B0A88F")
    private val go = Color.parseColor("#B5E35C")
    private val border = Color.parseColor("#2D2B22")
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    private lateinit var url: EditText; private lateinit var secret: EditText
    private lateinit var dest: Picker; private lateinit var item: Picker; private lateinit var method: Picker
    private lateinit var tgAbove: EditText; private lateinit var tgOff: EditText; private lateinit var tgFF: EditText; private lateinit var ffOn: Ui.Pill
    private lateinit var shop: EditText; private lateinit var safety: EditText; private lateinit var cap: EditText; private lateinit var buf: EditText
    private lateinit var xanax: Ui.Pill; private lateinit var status: TextView
    private var connected = false
    private val summaries = mutableListOf<Pair<TextView, () -> String>>()

    private fun mono(t: TextView, size: Float, color: Int, bold: Boolean = false) = t.apply {
        textSize = size; setTextColor(color); typeface = if (bold) Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) else Typeface.MONOSPACE
    }
    private fun label(t: String) = mono(TextView(this).apply { text = t.uppercase(); letterSpacing = 0.08f; setPadding(0, dp(12), 0, dp(4)) }, 11f, dim)
    private fun field(hint: String, num: Boolean = false) = EditText(this).apply {
        setHint(hint); setHintTextColor(dim); setSingleLine(); mono(this, 15f, paper)
        if (num) inputType = InputType.TYPE_CLASS_NUMBER
    }
    private fun button(t: String, primary: Boolean, click: () -> Unit) = mono(Button(this).apply {
        text = t.uppercase(); letterSpacing = 0.08f; setBackgroundResource(if (primary) R.drawable.btn_amber else R.drawable.btn_ghost_amber); setOnClickListener { click() }
    }, 13f, if (primary) Color.parseColor("#0E0E0C") else amber, true).also {
        it.layoutParams = LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(10) }
    }

    // Button that opens a plain dialog list; avoids Spinner theming problems.
    inner class Picker(private var list: List<Pair<String, String>>) : Button(this@MainActivity) {
        var index = 0
            private set
        var onPick: (() -> Unit)? = null
        val key get() = list.getOrNull(index)?.first ?: ""
        val shown get() = list.getOrNull(index)?.second ?: ""
        fun setList(l: List<Pair<String, String>>, selectKey: String) { list = l; set(l.indexOfFirst { it.first == selectKey }) }
        init {
            mono(this, 14f, paper); isAllCaps = false; gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setBackgroundResource(R.drawable.btn_ghost); set(0)
            setOnClickListener {
                AlertDialog.Builder(this@MainActivity).setItems(list.map { it.second }.toTypedArray()) { _, i -> set(i); onPick?.invoke() }.show()
            }
        }
        fun set(i: Int) { index = i; text = (list.getOrNull(i)?.second ?: if (list.isEmpty()) "No stock data yet" else "Choose an item") + "  ▾"; summaries.forEach { (t, f) -> t.text = f() } }
    }

    // A card with a title, a one-line summary and a body that opens on tap.
    private fun section(parent: LinearLayout, title: String, summary: () -> String, open: Boolean, build: LinearLayout.() -> Unit) {
        val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundResource(R.drawable.card_bg); setPadding(dp(16), dp(14), dp(16), dp(14)) }
        card.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) }
        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val names = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        names.addView(mono(TextView(this).apply { text = title; letterSpacing = 0.1f }, 13f, amber, true))
        val sum = mono(TextView(this).apply { text = summary(); setPadding(0, dp(3), 0, 0) }, 12f, dim)
        names.addView(sum); summaries.add(sum to summary)
        head.addView(names, LinearLayout.LayoutParams(0, -2, 1f))
        val chev = mono(TextView(this).apply { text = if (open) "▴" else "▾" }, 18f, dim)
        head.addView(chev)
        val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = if (open) View.VISIBLE else View.GONE; setPadding(0, dp(6), 0, 0) }
        body.build()
        head.setOnClickListener { val o = body.visibility != View.VISIBLE; body.visibility = if (o) View.VISIBLE else View.GONE; chev.text = if (o) "▴" else "▾" }
        card.addView(head); card.addView(body); parent.addView(card)
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(24)) }
        val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        top.addView(mono(TextView(this).apply { text = "WINGMAN"; letterSpacing = 0.2f }, 26f, amber, true), LinearLayout.LayoutParams(0, -2, 1f))
        top.addView(mono(TextView(this).apply { text = "v" + BuildConfig.VERSION_NAME }, 12f, dim))
        col.addView(top)
        col.addView(mono(TextView(this).apply { text = "Read-only Torn helper. You tap every action." }, 12f, dim))
        status = mono(TextView(this).apply { setPadding(0, dp(8), 0, 0) }, 12f, go); col.addView(status)

        url = field("https://…run.app"); secret = field("app secret"); secret.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        url.setText(Prefs.get(this, "url")); secret.setText(Prefs.get(this, "secret"))
        dest = Picker(dests); method = Picker(methods); item = Picker(emptyList())
        dest.onPick = { bg { loadItems(dests[dest.index].first, ""); save() } }; item.onPick = { save() }
        tgAbove = field("0").apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_SIGNED }; tgOff = field("60", true); tgFF = field("2.0").apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }; ffOn = Ui.pill(this, false) { save() }
        shop = field("3", true); safety = field("10", true); cap = field("29", true); buf = field("90", true)
        xanax = Ui.pill(this, true) { }

        val hasUrl = Prefs.get(this, "url").isNotEmpty()
        section(col, "CONNECTION", { if (connected) "Connected" else if (hasUrl) "Connecting…" else "Not connected" }, !hasUrl) {
            addView(label("Backend URL")); addView(url); addView(label("App secret")); addView(secret)
            addView(button("Connect and load", true) { connect() })
        }
        section(col, "TRIP", { "${dest.shown.ifEmpty { "—" }} · ${if (item.key.isEmpty()) "no item" else item.key} · ${method.shown.substringBefore(" (")}" }, false) {
            addView(label("Destination")); addView(dest); addView(label("Item to buy")); addView(item); addView(label("Flight type")); addView(method)
        }
        section(col, "TIMING", { "shop ${shop.text}m · safety ${safety.text}m · carry ${cap.text} · lock ${buf.text}m" }, false) {
            addView(label("Shopping minutes")); addView(shop); addView(label("Safety minutes")); addView(safety)
            addView(label("Items you can carry")); addView(cap); addView(label("Fly lock buffer (minutes before OC)")); addView(buf)
            addView(mono(TextView(this@MainActivity).apply { text = "The Fly button locks when a round trip plus this buffer no longer fits before your OC."; setPadding(0, dp(6), 0, 0) }, 12f, dim))
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(14), 0, 0)
                addView(mono(TextView(this@MainActivity).apply { text = "Xanax step when the drug cooldown is up" }, 14f, paper), LinearLayout.LayoutParams(0, -2, 1f))
                addView(xanax)
            })
            addView(button("Save settings", true) { save() })
        }
        section(col, "ALERTS", { "${alertDefs.count { alertState[it.key] ?: it.on }} of ${alertDefs.size} on" }, false) { alertsBody = this; buildAlerts(this) }
        section(col, "TARGETS", { if (ffOn.on) "FF Scouter · FF ≤ ${tgFF.text} · offline ≥ ${tgOff.text}m" else "level ≤ mine ${tgAbove.text.toString().toIntOrNull()?.let { if (it >= 0) "+$it" else "$it" } ?: "+0"} · offline ≥ ${tgOff.text}m" }, false) {
            addView(mono(TextView(this@MainActivity).apply { text = "The attack widget lists players from your in-game Target list that are offline and not too strong. Other players' stats are private, so strength is judged by level." }, 12f, dim))
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(14), 0, 0)
                addView(mono(TextView(this@MainActivity).apply { text = "Use FF Scouter (all offline players, with difficulty)" }, 14f, paper), LinearLayout.LayoutParams(0, -2, 1f))
                addView(ffOn)
            })
            addView(mono(TextView(this@MainActivity).apply { text = "When on, your server sends the FFSCOUTER_KEY you set up to ffscouter.com to fetch players by difficulty. Use a separate Public key registered at ffscouter.com, not your main key."; setPadding(0, dp(6), 0, 0) }, 12f, dim))
            addView(label("Difficulty to show (fair fight 1.0 to 3.0; lower means weaker targets)")); addView(tgFF)
            addView(label("Without FF Scouter: highest level vs yours (0 = your level or lower)")); addView(tgAbove)
            addView(label("Offline for at least (minutes)")); addView(tgOff)
            addView(button("Save settings", true) { save() })
        }
        section(col, "WIDGET", { "Choose what the widget shows" }, false) {
            addView(button("All-in-one widget layout", false) { startActivity(Intent(this@MainActivity, LayoutActivity::class.java)) })
            addView(button("Dashboard widget builder", false) { startActivity(Intent(this@MainActivity, DashActivity::class.java)) })
        }
        section(col, "TOOLS", { "Tests and battery" }, false) {
            addView(button("Test notification (this phone)", false) { localTest() })
            addView(button("Test push from backend", false) { say("Push requested. Wait a few seconds."); bg { Api.call(this@MainActivity, "POST", "/test") } })
            addView(button("Battery: set Unrestricted", false) { batteryHelp() })
        }

        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col); Ui.fitSystemBars(this) })
        Prefs.get(this, "crash").takeIf { it.isNotEmpty() }?.let { status.text = "LAST CRASH:\n$it"; Prefs.put(this, "crash", "") }
        if (hasUrl) load()
    }

    private fun buildAlerts(body: LinearLayout) {
        body.addView(mono(TextView(this).apply { text = "Choose which alerts you get. Changes save right away." }, 12f, dim))
        var group = ""
        alertDefs.forEach { d ->
            if (d.group != group) { group = d.group; body.addView(mono(TextView(this).apply { text = group; letterSpacing = 0.1f; setPadding(0, dp(16), 0, dp(4)) }, 11f, dim, true)) }
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(8), 0, dp(8)) }
            val txt = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            txt.addView(mono(TextView(this).apply { text = d.title }, 14f, paper)); txt.addView(mono(TextView(this).apply { text = d.desc }, 12f, dim))
            row.addView(txt, LinearLayout.LayoutParams(0, -2, 1f))
            val title = txt.getChildAt(0) as TextView
            val sw = Ui.pill(this, alertState[d.key] ?: d.on) { v ->
                alertState[d.key] = v; title.setTextColor(if (v) paper else dim); summaries.forEach { (t, f) -> t.text = f() }; save()
            }
            sw.tag = d.key
            title.setTextColor(if (alertState[d.key] ?: d.on) paper else dim)
            row.addView(sw); body.addView(row)
        }
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
        val al = j.optJSONObject("alerts")
        runOnUiThread {
            dest.set(dests.indexOfFirst { it.first == j.optString("dest") }.coerceAtLeast(0))
            method.set(methods.indexOfFirst { it.first == j.optString("method") }.coerceAtLeast(0))
            shop.setText(j.optInt("shopMin", 3).toString()); safety.setText(j.optInt("safetyMin", 10).toString())
            cap.setText(j.optInt("capacity", 29).toString()); buf.setText(j.optInt("flyBufferMin", 90).toString()); tgAbove.setText(j.optInt("targetMaxLevelAbove", 0).toString()); tgOff.setText(j.optInt("targetMinOfflineMin", 60).toString()); tgFF.setText(j.optDouble("ffMaxFF", 2.0).toString()); ffOn.set(j.optBoolean("ffEnabled", false)); xanax.set(j.optBoolean("xanax", true))
            if (al != null) alertDefs.forEach { d -> if (al.has(d.key)) alertState[d.key] = al.getBoolean(d.key) }
            document()
        }
        loadItems(j.optString("dest", "mex"), j.optString("item")); Api.refresh(this)
        Api.call(this, "PUT", "/settings", JSONObject().put("tz", java.util.TimeZone.getDefault().id).toString()) // alerts quote times in your zone
        connected = true; runOnUiThread { document() }; say("Connected.")
    }

    // Rebuild the alert rows and summaries after settings arrive.
    private fun document() {
        alertsBody?.let { it.removeAllViews(); buildAlerts(it) }
        summaries.forEach { (t, f) -> t.text = f() }
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
        val alerts = JSONObject().also { o -> alertDefs.forEach { d -> alertState[d.key]?.let { o.put(d.key, it) } } }
        val j = JSONObject().put("dest", dests[dest.index].first).put("method", methods[method.index].first)
            .put("item", item.key).put("shopMin", shop.text.toString().toIntOrNull() ?: 3)
            .put("safetyMin", safety.text.toString().toIntOrNull() ?: 10).put("capacity", cap.text.toString().toIntOrNull() ?: 29).put("flyBufferMin", buf.text.toString().toIntOrNull() ?: 90).put("targetMaxLevelAbove", tgAbove.text.toString().toIntOrNull() ?: 0).put("targetMinOfflineMin", tgOff.text.toString().toIntOrNull() ?: 60).put("ffMaxFF", tgFF.text.toString().toDoubleOrNull() ?: 2.0).put("ffEnabled", ffOn.on)
            .put("xanax", xanax.on).put("alerts", alerts).put("tz", java.util.TimeZone.getDefault().id)
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
