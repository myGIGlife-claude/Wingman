package com.wingman.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.sqrt

class WingmanWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) {
        ids.forEach { m.updateAppWidget(it, build(c)) }
        Thread { Api.refresh(c) }.start()
    }

    companion object {
        fun updateAll(c: Context) {
            val m = AppWidgetManager.getInstance(c)
            val ids = m.getAppWidgetIds(ComponentName(c, WingmanWidget::class.java))
            ids.forEach { m.updateAppWidget(it, build(c)) }
            scheduleRender(c)
        }

        private fun broadcast(c: Context, action: String, code: Int) = PendingIntent.getBroadcast(
            c, code, Intent(c, ActionReceiver::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        // Colors and the Fly lock depend on the clock, so redraw when the next one flips.
        private fun scheduleRender(c: Context) {
            val f = Model.parse(Prefs.get(c, "model"))?.facts ?: return
            val now = System.currentTimeMillis() / 1000
            val marks = listOfNotNull(
                f.optLong("flyOkUntil", 0).takeIf { it > 0 }?.let { listOf(it - 7200, it) },
                f.optLong("ocReadyAt", 0).takeIf { it > 0 }?.let { listOf(it - 1800, it, it - 7200) },
                f.optLong("leaveBy", 0).takeIf { it > 0 }?.let { listOf(it - 600, it) },
            ).flatten().filter { it > now + 1 }
            val next = marks.minOrNull() ?: return
            try {
                c.getSystemService(AlarmManager::class.java).set(AlarmManager.RTC, next * 1000 + 500, broadcast(c, ActionReceiver.ACTION_RENDER, 7))
            } catch (e: Exception) { /* the 15-minute worker still redraws */ }
        }

        private val SB = mapOf("go" to R.id.sb_go, "amber" to R.id.sb_amber, "yellow" to R.id.sb_yellow, "stop" to R.id.sb_stop)
        private val PB = mapOf("go" to R.id.pb_go, "amber" to R.id.pb_amber, "yellow" to R.id.pb_yellow, "stop" to R.id.pb_stop)
        private fun rgb(k: String) = when (k) { "go" -> GO; "yellow" -> YELLOW; "stop" -> STOP; "dim" -> DIM; else -> AMBER }
        private fun chipBg(k: String) = when (k) { "go" -> R.drawable.chip_go; "yellow" -> R.drawable.chip_yellow; "stop" -> R.drawable.chip_stop; else -> R.drawable.chip_amber }
        private fun panelBg(k: String) = when (k) { "go" -> R.drawable.panel_go; "yellow" -> R.drawable.panel_yellow; "stop" -> R.drawable.panel_stop; else -> R.drawable.panel_amber }

        private fun setBar(v: RemoteViews, ids: Map<String, Int>, color: String, pct: Int) {
            ids.forEach { (k, id) -> v.setViewVisibility(id, if (k == color) View.VISIBLE else View.GONE) }
            v.setProgressBar(ids.getValue(color), 100, pct.coerceIn(0, 100), false)
        }

        private fun countdown(v: RemoteViews, id: Int, left: Long) {
            v.setChronometerCountDown(id, true)
            v.setChronometer(id, SystemClock.elapsedRealtime() + left * 1000, null, true)
        }

        private fun header(c: Context, f: JSONObject, chip: String, color: String): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.s_header)
            v.setTextViewText(R.id.h_faction, (f.optString("faction").ifEmpty { "No faction" }).uppercase())
            v.setTextViewText(R.id.h_name, f.optString("name").ifEmpty { "Wingman" })
            v.setTextViewText(R.id.h_chip, "● $chip"); v.setTextColor(R.id.h_chip, rgb(color)); v.setInt(R.id.h_chip, "setBackgroundResource", chipBg(color))
            return v
        }

        private fun stat(c: Context, label: String, value: String, pct: Int, color: String): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.s_stat)
            v.setTextViewText(R.id.st_label, label); v.setTextViewText(R.id.st_value, value)
            setBar(v, SB, color, pct); return v
        }

        private fun chip(c: Context, text: String, color: String, timerTo: Long?, now: Long): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.s_chip)
            v.setInt(R.id.chip, "setBackgroundResource", chipBg(color))
            v.setTextViewText(R.id.c_text, "● $text"); v.setTextColor(R.id.c_text, rgb(color))
            if (timerTo != null && timerTo > now) {
                v.setViewVisibility(R.id.c_timer, View.VISIBLE); v.setTextColor(R.id.c_timer, rgb(color)); countdown(v, R.id.c_timer, timerTo - now)
            }
            return v
        }

        private class Cell(val label: String, val timerTo: Long?, val color: String, val text: String = "—", val sub: String = "")
        private class Panel(val label: String, val chip: String?, val color: String, val a: Cell, val b: Cell? = null,
                            val slackLabel: String? = null, val slackValue: String = "", val slackPct: Int = 0, val note: String? = null)

        private fun cell(v: RemoteViews, p: String, c: Cell?, now: Long, size: Float) {
            val ids = if (p == "a") intArrayOf(R.id.cellA, R.id.a_label, R.id.a_clock, R.id.a_text, R.id.a_sub) else intArrayOf(R.id.cellB, R.id.b_label, R.id.b_clock, R.id.b_text, R.id.b_sub)
            if (c == null) { v.setViewVisibility(ids[0], View.GONE); return }
            // A timer past 24h also shows days, which a 100:27:41 clock hides.
            val left = if (c.timerTo != null) c.timerTo - now else 0
            v.setTextViewText(ids[1], if (left >= 86400) "${c.label} · ${Tiles.long(left)}" else c.label)
            v.setTextViewTextSize(ids[2], android.util.TypedValue.COMPLEX_UNIT_SP, size); v.setTextViewTextSize(ids[3], android.util.TypedValue.COMPLEX_UNIT_SP, size)
            if (c.timerTo != null && left > 0) { v.setTextColor(ids[2], rgb(c.color)); countdown(v, ids[2], left) }
            else { v.setViewVisibility(ids[2], View.GONE); v.setViewVisibility(ids[3], View.VISIBLE); v.setTextViewText(ids[3], if (c.timerTo != null) "NOW" else c.text); v.setTextColor(ids[3], rgb(if (c.timerTo != null) c.color else "dim")) }
            if (c.sub.isEmpty()) v.setViewVisibility(ids[4], View.GONE) else v.setTextViewText(ids[4], c.sub)
        }

        private fun panel(c: Context, p: Panel, now: Long): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.s_panel)
            v.setInt(R.id.p_root, "setBackgroundResource", panelBg(p.color))
            v.setTextViewText(R.id.p_label, p.label)
            if (p.chip != null) { v.setTextViewText(R.id.p_chip, "● ${p.chip}"); v.setTextColor(R.id.p_chip, rgb(p.color)); v.setInt(R.id.p_chip, "setBackgroundResource", chipBg(p.color)) }
            else v.setViewVisibility(R.id.p_chip, View.GONE)
            val dual = p.b != null
            cell(v, "a", p.a, now, if (dual) 20f else 30f); cell(v, "b", p.b, now, 20f)
            if (p.slackLabel == null) v.setViewVisibility(R.id.p_slack, View.GONE) else {
                if (dual && p.slackValue.isEmpty()) v.setViewVisibility(R.id.p_slack_labels, View.GONE)
                else { v.setTextViewText(R.id.p_sl, p.slackLabel); v.setTextViewText(R.id.p_sv, p.slackValue); v.setTextColor(R.id.p_sv, rgb(p.color)) }
                setBar(v, PB, p.color, p.slackPct)
            }
            if (p.note == null) v.setViewVisibility(R.id.p_note, View.GONE) else v.setTextViewText(R.id.p_note, p.note)
            return v
        }

        private fun ocCell(f: JSONObject, now: Long): Cell {
            val at = f.optLong("ocReadyAt", 0); val name = f.optString("ocName").takeIf { it != "null" }.orEmpty()
            return if (f.optBoolean("ocNow")) Cell("OC", null, "go", "READY", name)
            else if (at > 0) Cell("OC READY IN", at, Tiles.key(Tiles.ocColor(f, at, now)), sub = name)
            else Cell("OC", null, "dim", "—", "Not in an OC")
        }

        private fun ocMini(c: Context, f: JSONObject, now: Long): RemoteViews? {
            val at = f.optLong("ocReadyAt", 0)
            if (at == 0L && !f.optBoolean("ocNow")) return null
            val v = RemoteViews(c.packageName, R.layout.s_ocmini)
            v.setTextViewText(R.id.o_label, "OC READY IN"); v.setTextViewText(R.id.o_name, f.optString("ocName"))
            if (at > now) countdown(v, R.id.o_timer, at - now)
            else { v.setViewVisibility(R.id.o_timer, View.GONE); v.setViewVisibility(R.id.o_text, View.VISIBLE); v.setTextViewText(R.id.o_text, "READY"); v.setTextColor(R.id.o_text, GO) }
            return v
        }

        private fun stockCard(c: Context, f: JSONObject, now: Long): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.s_stock)
            val st = f.optJSONObject("stock"); val rs = f.optJSONObject("restock")
            v.setTextViewText(R.id.k_label, f.optString("item").ifEmpty { "ITEM" }.uppercase())
            val q = st?.getInt("qty")
            if (st == null) { v.setTextViewText(R.id.k_qty, "?"); v.setTextColor(R.id.k_qty, DIM); v.setTextViewText(R.id.k_sub, "no stock data") }
            else {
                v.setTextViewText(R.id.k_qty, "%,d".format(q)); v.setTextColor(R.id.k_qty, if (q == 0) STOP else GO); v.setTextViewText(R.id.k_unit, "in stock")
                val seen = if (st.has("seen") && !st.isNull("seen")) "seen ${(now - st.getLong("seen")) / 60}m ago" else ""
                val gone = rs?.takeIf { q == 0 && it.has("soldOutAt") && !it.isNull("soldOutAt") }?.let { "sold out ${Tiles.dur(now - it.getLong("soldOutAt"))} ago · " } ?: ""
                v.setTextViewText(R.id.k_sub, if (q == 0) "$gone$seen" else "${Tiles.money(st.getLong("cost"))} each · $seen")
            }
            if (q == 0) {
                // Sold out: show the learned restock estimate instead of buy max.
                v.setTextViewText(R.id.k_rl, "RESTOCK ETA (EST.)")
                val eta = rs?.takeIf { it.has("eta") && !it.isNull("eta") }?.getLong("eta") ?: 0L
                val every = rs?.takeIf { it.has("everySecs") && !it.isNull("everySecs") }?.getLong("everySecs")
                if (eta > now) { v.setViewVisibility(R.id.k_rv, View.GONE); v.setViewVisibility(R.id.k_rt, View.VISIBLE); countdown(v, R.id.k_rt, eta - now) }
                else v.setTextViewText(R.id.k_rv, if (rs?.optBoolean("overdue") == true) "DUE" else "—")
                v.setTextViewText(R.id.k_rs, when {
                    every != null -> "restocks ~every ${Tiles.dur(every)}"
                    else -> "learning · ${rs?.optInt("samples") ?: 0}/1 gaps seen"
                })
            } else {
                v.setTextViewText(R.id.k_rl, "BUY MAX")
                val n = if (f.has("buyMax") && !f.isNull("buyMax")) f.getInt("buyMax") else null
                v.setTextViewText(R.id.k_rv, n?.toString() ?: "—")
                v.setTextViewText(R.id.k_rs, if (f.optString("buyWhy") == "cash") "not enough cash" else if (!f.isNull("cash")) "cash ${Tiles.money(f.getLong("cash"))}" else "")
            }
            return v
        }

        private fun tileView(c: Context, t: Tile, now: Long): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.tile)
            v.setTextViewText(R.id.t_label, t.label); v.setTextViewText(R.id.t_sub, t.sub)
            v.setTextColor(R.id.t_text, t.color); v.setTextColor(R.id.t_timer, t.color)
            val left = if (t.timerTo != null) t.timerTo - now else 0
            if (t.timerTo != null && left > 0) { v.setViewVisibility(R.id.t_text, View.GONE); v.setViewVisibility(R.id.t_timer, View.VISIBLE); countdown(v, R.id.t_timer, left) }
            else { v.setViewVisibility(R.id.t_timer, View.GONE); v.setTextViewText(R.id.t_text, if (t.timerTo != null) "NOW" else t.text) }
            return v
        }

        private fun icon(k: String, tint: String) = when ("$k:$tint") {
            "fly:ink" -> R.drawable.i_fly_ink; "fly:dim" -> R.drawable.i_fly_dim; "zap:ink" -> R.drawable.i_zap_ink; "target:ink" -> R.drawable.i_target_ink
            "box:ink" -> R.drawable.i_box_ink; "lock:dim" -> R.drawable.i_lock_dim; "cart:ink" -> R.drawable.i_cart_ink
            "check:go" -> R.drawable.i_check_go; "refresh:dim" -> R.drawable.i_refresh_dim; else -> R.drawable.i_fly_ink
        }

        private fun qbtn(c: Context, label: String, ic: String, locked: Boolean, tap: PendingIntent): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.s_qbtn)
            v.setTextViewText(R.id.q_label, if (locked) "$label ✕" else label)
            v.setImageViewResource(R.id.q_icon, if (locked) icon("lock", "dim") else icon(ic, "ink"))
            v.setInt(R.id.qb, "setBackgroundResource", if (locked) R.drawable.btn_ghost else R.drawable.btn_amber)
            v.setTextColor(R.id.q_label, if (locked) DIM else Color_INK)
            v.setOnClickPendingIntent(R.id.qb, tap); return v
        }

        private const val Color_INK = 0xFF0E0E0C.toInt()

        private fun wbtn(c: Context, label: String, ic: String, style: String, tap: PendingIntent): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.s_wbtn)
            v.setTextViewText(R.id.w_label, label)
            v.setInt(R.id.wb, "setBackgroundResource", when (style) { "amber" -> R.drawable.btn_amber; "stop" -> R.drawable.btn_stop; else -> R.drawable.btn_ghost })
            v.setTextColor(R.id.w_label, if (style == "ghost") DIM else Color_INK)
            v.setImageViewResource(R.id.w_icon, icon(ic, if (style == "ghost") "dim" else "ink"))
            v.setOnClickPendingIntent(R.id.wb, tap); return v
        }

        private fun row(c: Context, gap: Int, items: List<RemoteViews>): RemoteViews {
            val r = RemoteViews(c.packageName, if (gap == 12) R.layout.s_row12 else R.layout.s_row8)
            items.forEach { r.addView(R.id.row, it) }; return r
        }

        // Shows when the data last changed, so a refresh tap visibly does something.
        fun build(c: Context): RemoteViews {
            val v = buildBody(c)
            val at = Prefs.get(c, "model_at").toLongOrNull()
            if (at != null) v.addView(R.id.content, RemoteViews(c.packageName, R.layout.s_updated).also {
                it.setTextViewText(R.id.u_text, "UPDATED ${Tiles.clock(at)}") })
            return v
        }

        private fun buildBody(c: Context): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget)
            v.removeAllViews(R.id.content)
            val refresh = RemoteViews(c.packageName, R.layout.s_sq).also {
                it.setImageViewResource(R.id.sq_icon, icon("refresh", "dim")); it.setOnClickPendingIntent(R.id.sq, broadcast(c, ActionReceiver.ACTION_REFRESH, 0)) }
            val m = Model.parse(Prefs.get(c, "model"))
            val now = System.currentTimeMillis() / 1000
            val f = m?.facts
            if (m == null || f == null) {
                v.addView(R.id.content, panel(c, Panel("WINGMAN", null, "amber", Cell("STATUS", null, "amber", "SET UP", if (m == null) "Open the app and add your backend URL" else m.sub)), now))
                val open = PendingIntent.getActivity(c, 9, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
                v.addView(R.id.content, row(c, 8, listOf(wbtn(c, "OPEN WINGMAN", "fly", "amber", open), refresh)))
                return v
            }
            val ids = Tiles.layout(Prefs.get(c, "layout").ifEmpty { Tiles.DEFAULT })
            val add = { x: RemoteViews? -> if (x != null) v.addView(R.id.content, x) }
            val where = f.optString("where").ifEmpty { "?" }

            when (m.phase) {
                "traveling" -> {
                    val out = f.optBoolean("outbound")
                    add(header(c, f, if (out) "IN FLIGHT" else "FLYING HOME", "amber"))
                    val land = f.optLong("landAt", 0); val dep = f.optLong("departedAt", 0)
                    val pct = if (dep in 1 until land) ((now - dep) * 100 / (land - dep)).toInt() else -1
                    val lb = f.optLong("leaveBy", 0)
                    add(panel(c, Panel(if (out) "LANDS IN ${where.uppercase()}" else "LANDS HOME", if (land > 0) "at ${Tiles.clock(land)}" else null, "amber",
                        Cell("LANDS", land.takeIf { it > 0 }, "amber", sub = if (land > 0) Tiles.clock(land) else ""), if ("oc" in ids) ocCell(f, now) else null,
                        slackLabel = if (pct >= 0) f.optString("origin").takeIf { it.isNotEmpty() && it != "null" }?.uppercase() ?: if (out) "TORN" else "ABROAD" else null, slackValue = if (out) where.uppercase() else "TORN", slackPct = pct,
                        note = if (out && f.optString("item").isNotEmpty()) "Then: buy ${f.optString("item")}." + (if (lb > 0) " Must leave $where by ${Tiles.clock(lb)}." else "") else null), now))
                    add(row(c, 8, listOf(wbtn(c, "IN FLIGHT", "fly", "ghost", broadcast(c, ActionReceiver.ACTION_REFRESH, 0)), refresh)))
                }
                "abroad" -> {
                    add(header(c, f, "ABROAD · ${where.uppercase()}", "yellow"))
                    val lb = f.optLong("leaveBy", 0); val late = lb > 0 && lb - now < 600
                    add(panel(c, Panel(if (lb > 0) "LEAVE BY ${Tiles.clock(lb)}" else "LEAVE BY", "HOME ${Tiles.dur(f.optLong("flySecs"))}", if (late) "stop" else "yellow",
                        Cell("LEAVE BY", lb.takeIf { it > 0 }, if (late) "stop" else "yellow", sub = if (lb > 0) Tiles.clock(lb) else ""), if ("oc" in ids) ocCell(f, now) else null), now))
                    add(stockCard(c, f, now))
                    val main = wbtn(c, m.label, if (m.label.startsWith("BUY")) "cart" else "fly", m.style,
                        if (m.url != null) Notifier.openIntent(c, m.url, 3) else broadcast(c, ActionReceiver.ACTION_REFRESH, 0))
                    val items = mutableListOf(main)
                    if (m.showBought) items.add(RemoteViews(c.packageName, R.layout.s_wbtn_s).also {
                        it.setTextViewText(R.id.w_label, "BOUGHT"); it.setImageViewResource(R.id.w_icon, icon("check", "go")); it.setOnClickPendingIntent(R.id.wb, broadcast(c, ActionReceiver.ACTION_BOUGHT, 1)) })
                    items.add(refresh); add(row(c, 8, items))
                }
                else -> {
                    val chipText = when (m.phase) { "hospital" -> "HOSPITAL"; "jail" -> "JAIL"; "federal" -> "FEDERAL"; else -> "HOME" }
                    add(header(c, f, chipText, if (m.phase == "home") "go" else "stop"))
                    // Bars: two per row.
                    val bars = ids.filter { it in listOf("life", "energy", "nerve") }.mapNotNull { id ->
                        val b = f.optJSONObject(id) ?: return@mapNotNull null
                        val cur = b.getInt("cur"); val max = b.getInt("max"); val pct = (cur * 100 / max).coerceAtMost(100)
                        when (id) {
                            "life" -> stat(c, "HEALTH", "%,d/%,d".format(cur, max), pct, if (pct > 70) "go" else if (pct > 35) "yellow" else "stop")
                            "energy" -> stat(c, "ENERGY", "$cur/$max${if (cur >= max) " FULL" else ""}", pct, "amber")
                            else -> stat(c, "NERVE", "$cur/$max${if (cur >= max) " FULL" else ""}", pct, "yellow")
                        }
                    }
                    bars.chunked(2).forEach { add(row(c, 12, it)) }
                    // Status chips.
                    val chips = mutableListOf<RemoteViews>()
                    if ("jail" in ids) { val u = f.optLong("jailUntil", 0); chips.add(if (u > now) chip(c, "JAIL", "stop", u, now) else chip(c, "JAIL · FREE", "go", null, now)) }
                    if ("hospital" in ids) { val u = f.optLong("hospitalUntil", 0); chips.add(if (u > now) chip(c, "HOSPITAL", "stop", u, now) else chip(c, "HOSPITAL · OK", "go", null, now)) }
                    if (chips.isNotEmpty()) add(row(c, 8, chips))
                    if ("oc" in ids) add(panel(c, homeOc(f, now), now))
                    // Extra tiles, two per row.
                    ids.filter { it in Tiles.EXTRA }.mapNotNull { Tiles.build(it, f, now) }.map { tileView(c, it, now) }.chunked(2).forEach { add(row(c, 8, it)) }
                    // Quick buttons.
                    val on = Prefs.get(c, "buttons").ifEmpty { Tiles.DEFAULT_BUTTONS }.split(',')
                    val qs = Tiles.BUTTONS.filter { it.id in on }.mapIndexed { i, b ->
                        val locked = b.id == "fly" && Tiles.flyBlocked(f, now)
                        val before = if (b.id == "fly") f.optLong("flyOkUntil", 0) else 0
                        qbtn(c, b.label, when (b.id) { "fly" -> "fly"; "gym" -> "zap"; "crimes" -> "target"; else -> "box" }, locked, Notifier.openIntent(c, b.url, 20 + i, before))
                    }
                    if (qs.isNotEmpty()) add(row(c, 8, qs + refresh))
                    else add(row(c, 8, listOf(refresh)))
                }
            }
            return v
        }

        private fun homeOc(f: JSONObject, now: Long): Panel {
            val at = f.optLong("ocReadyAt", 0)
            val oc = ocCell(f, now)
            if (f.optBoolean("ocNow") || at == 0L) return Panel("OC", if (f.optBoolean("ocNow")) "OC READY" else null, if (f.optBoolean("ocNow")) "go" else "amber", oc)
            val color = Tiles.key(Tiles.ocColor(f, at, now))
            val ok = f.optLong("flyOkUntil", 0); val slack = if (ok > 0) ok - now else null
            val buf = f.optLong("flyBufferSecs") / 60
            val chip = when { slack == null -> null; slack > 7200 -> "FLY WINDOW OPEN"; slack > 0 -> "FLY WINDOW CLOSING"; else -> "FLY LOCKED" }
            val pct = if (slack == null) 0 else (sqrt((slack.coerceAtLeast(0)).toDouble() / (4 * 86400)) * 100).toInt().coerceIn(2, 100)
            val fly = when {
                slack == null -> null
                slack > 0 -> Cell("FLY LOCKS IN", ok, color, sub = "trip + ${buf}m buffer")
                else -> Cell("FLY", null, "stop", "LOCKED", "stay in Torn")
            }
            return Panel("OC", chip, color, oc, fly, slackLabel = if (slack == null) null else "", slackPct = pct,
                note = if (slack != null && slack <= 0) "A round trip plus the $buf minute buffer no longer fits before your OC." else null)
        }
    }
}
