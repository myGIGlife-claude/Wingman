package com.wingman.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.*
import org.json.JSONArray

// Opens when you add a Single widget (or reconfigure it): pick the one thing it shows.
class SingleActivity : Activity() {
    private var wid = AppWidgetManager.INVALID_APPWIDGET_ID
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    private class Item(val id: String, val title: String, val note: String)

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setResult(RESULT_CANCELED)
        wid = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        val custom = try { JSONArray(Prefs.get(this, "custom")) } catch (e: Exception) { JSONArray() }
        // Same sections as the Dashboard builder. Anything the app can show is on this list.
        val items = listOf(
            "TRAVEL" to listOf(Item("location", "Location and ETA", "in Torn, abroad or flying, with landing time"), Item("trip", "Trip", "landing time, leave by, or fly within"),
                Item("stock", "Stock of your item", "quantity and price at your destination"), Item("buymax", "Buy max", "how many you can buy now")),
            "BARS" to listOf(Item("energy", "Energy", "number and bar"), Item("nerve", "Nerve", "number and bar"), Item("life", "Health", "number and bar")),
            "COOLDOWNS" to listOf(Item("xanax", "Xanax cooldown", "with addiction and counts"), Item("drug", "Drug cooldown", ""), Item("booster", "Booster cooldown", ""),
                Item("medical", "Medical cooldown", ""), Item("addiction", "Addiction watch", "penalty and rehabs")),
            "FACTION" to listOf(Item("chain", "Chain watch", "chain count and time before it breaks"), Item("chainme", "Your chain hits", "your hits and respect in the running chain"), Item("chainlast", "Last chain rank", "your rank among the faction in the last finished chain")),
            "LOOT" to listOf(Item("npc", "NPC attack time", "when the next NPC attack starts (from Loot Rangers)")),
            "OC AND STATUS" to listOf(Item("oc", "OC countdown", "colored by how long you have"), Item("hospital", "Hospital status", "countdown if you are in"), Item("jail", "Jail status", "countdown if you are in"),
                Item("cash", "Cash", ""), Item("next", "Next step", "Xanax, gym, crimes or fly"), Item("targets", "Targets", "how many players match your filters")),
            "BUTTONS" to listOf(Item("gym", "Gym", "opens the gym"), Item("fly", "Fly", "locks near your OC"), Item("crimes", "Crimes", "opens crimes"), Item("items", "Items", "opens your items"),
                Item("spin", "Spin the wheel", "opens the casino wheel"))
                + (1..4).mapNotNull { n -> custom.optJSONObject(n - 1)?.takeIf { it.optString("path").startsWith("/") }?.let { Item("c$n", "Shortcut: ${it.optString("name")}", it.optString("path")) } },
        )
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(24)) }
        col.addView(TextView(this).apply { text = "WHAT SHOULD THIS WIDGET SHOW?"; setTextColor(AMBER); textSize = 20f; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); letterSpacing = 0.06f })
        col.addView(TextView(this).apply { text = "Pick one. You can add as many widgets as you like and set each one differently."; setTextColor(DIM); textSize = 13f; typeface = Typeface.MONOSPACE; setPadding(0, dp(6), 0, dp(8)) })
        val current = Prefs.get(this, "single_$wid")
        for ((group, list) in items) {
            col.addView(TextView(this).apply { text = group; setTextColor(DIM); textSize = 12f; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); letterSpacing = 0.1f; setPadding(0, dp(18), 0, dp(6)) })
            for (it in list) {
                val r = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundResource(if (it.id == current) R.drawable.btn_ghost_amber else R.drawable.card_bg); setPadding(dp(14), dp(12), dp(14), dp(12)) }
                r.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) }
                r.addView(TextView(this).apply { text = it.title; setTextColor(PAPER); textSize = 15f; typeface = Typeface.MONOSPACE })
                if (it.note.isNotEmpty()) r.addView(TextView(this).apply { text = it.note; setTextColor(DIM); textSize = 12f; typeface = Typeface.MONOSPACE })
                r.setOnClickListener { _ -> choose(it.id) }
                col.addView(r)
            }
        }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col); Ui.fitSystemBars(this) })
    }

    private fun choose(id: String) {
        Prefs.put(this, "single_$wid", id)
        WingmanWidget.updateAll(this)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid))
        finish()
    }
}
