package com.wingman.app

import android.Manifest
import android.app.Activity
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
    private lateinit var dest: Spinner; private lateinit var item: AutoCompleteTextView; private lateinit var method: Spinner
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
    private fun spinner(list: List<Pair<String, String>>) = Spinner(this).apply {
        adapter = object : ArrayAdapter<String>(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, list.map { it.second }) {
            override fun getView(p: Int, v: View?, g: android.view.ViewGroup) = (super.getView(p, v, g) as TextView).also { it.setTextColor(paper); it.typeface = Typeface.MONOSPACE }
            override fun getDropDownView(p: Int, v: View?, g: android.view.ViewGroup) = (super.getDropDownView(p, v, g) as TextView).also { it.setTextColor(Color.BLACK) }
        }
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 80, 40, 80) }
        col.addView(TextView(this).apply { text = "WINGMAN"; setTextColor(amber); textSize = 26f; typeface = Typeface.MONOSPACE; letterSpacing = 0.2f })
        col.addView(TextView(this).apply { text = "Read-only Torn helper. You tap every action. Foreign stock data: YATA."; setTextColor(dim); textSize = 12f; typeface = Typeface.MONOSPACE })

        url = field("https://…run.app"); secret = field("app secret"); secret.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        url.setText(Prefs.get(this, "url")); secret.setText(Prefs.get(this, "secret"))
        col.addView(label("Backend URL")); col.addView(url); col.addView(label("App secret")); col.addView(secret)
        col.addView(button("Connect and load", true) { connect() })

        dest = spinner(dests); method = spinner(methods)
        item = AutoCompleteTextView(this).apply { hint = "e.g. Xanax"; setTextColor(paper); setHintTextColor(dim); typeface = Typeface.MONOSPACE; setSingleLine(); threshold = 1 }
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
        col.addView(button("Send test notification", false) { bg { Api.call(this, "POST", "/test") } })
        col.addView(button("Battery: set Unrestricted", false) { batteryHelp() })
        status = TextView(this).apply { setTextColor(dim); typeface = Typeface.MONOSPACE; textSize = 12f; setPadding(0, 24, 0, 0); gravity = Gravity.START }
        col.addView(status)

        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col) })
        if (Prefs.get(this, "url").isNotEmpty()) load()
    }

    private fun bg(f: () -> Unit) = Thread(f).start()
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
            dest.setSelection(dests.indexOfFirst { it.first == j.optString("dest") }.coerceAtLeast(0))
            method.setSelection(methods.indexOfFirst { it.first == j.optString("method") }.coerceAtLeast(0))
            item.setText(j.optString("item")); shop.setText(j.optInt("shopMin", 3).toString()); safety.setText(j.optInt("safetyMin", 10).toString())
            cap.setText(j.optInt("capacity", 29).toString()); xanax.isChecked = j.optBoolean("xanax", true)
        }
        loadItems(); Api.refresh(this); say("Connected.")
    }

    private fun loadItems() {
        val d = dests[dest.selectedItemPosition].first
        val r = Api.call(this, "GET", "/items?dest=$d") ?: return
        val names = JSONArray(r).let { a -> (0 until a.length()).map { a.getJSONObject(it).getString("name") } }
        runOnUiThread { item.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, names)) }
    }

    private fun save() = bg {
        val j = JSONObject().put("dest", dests[dest.selectedItemPosition].first).put("method", methods[method.selectedItemPosition].first)
            .put("item", item.text.toString().trim()).put("shopMin", shop.text.toString().toIntOrNull() ?: 3)
            .put("safetyMin", safety.text.toString().toIntOrNull() ?: 10).put("capacity", cap.text.toString().toIntOrNull() ?: 29)
            .put("xanax", xanax.isChecked)
        say(if (Api.call(this, "PUT", "/settings", j.toString()) != null) "Saved." else "Save failed.")
        Api.refresh(this); loadItems()
    }

    private fun batteryHelp() {
        Toast.makeText(this, "Set Battery to Unrestricted, then add Wingman to Never sleeping apps.", Toast.LENGTH_LONG).show()
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }
}
