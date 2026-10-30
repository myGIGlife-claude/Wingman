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
        // Every widget type with the part of the model it draws.
        private val KINDS = listOf(WingmanWidget::class.java to "all", StatusWidget::class.java to "status", OcWidget::class.java to "oc",
            TripWidget::class.java to "trip", StockWidget::class.java to "stock", ActionsWidget::class.java to "actions", TargetsWidget::class.java to "targets", DashWidget::class.java to "dash", SingleWidget::class.java to "single")

        fun updateAll(c: Context) {
            val m = AppWidgetManager.getInstance(c)
            for ((cls, kind) in KINDS) {
                val ids = m.getAppWidgetIds(ComponentName(c, cls))
                ids.forEach { m.updateAppWidget(it, build(c, kind, it)) }
                if (kind == "targets" && ids.isNotEmpty()) m.notifyAppWidgetViewDataChanged(ids, R.id.tgt_list)
            }
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
            "check:go" -> R.drawable.i_check_go; "spin:ink" -> R.drawable.i_spin_ink; "link:ink" -> R.drawable.i_link_ink; "refresh:dim" -> R.drawable.i_refresh_dim; else -> R.drawable.i_fly_ink
        }

        private fun qbtn(c: Context, label: String, ic: String, locked: Boolean, tap: PendingIntent, layout: Int = R.layout.s_qbtn): RemoteViews {
            val v = RemoteViews(c.packageName, layout)
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
        fun build(c: Context, kind: String = "all", id: Int = 0): RemoteViews {
            if (kind == "targets") return buildTargets(c, id)
            if (kind == "single") return buildSingle(c, id)
            if (kind == "actions") return buildActions(c, id)
            val v = buildBody(c, kind)
            val at = Prefs.get(c, "model_at").toLongOrNull()
            if (at != null && kind != "actions" && kind != "stock") v.addView(R.id.content, RemoteViews(c.packageName, R.layout.s_updated).also {
                it.setTextViewText(R.id.u_text, "UPDATED ${Tiles.clock(at)}") })
            return v
        }

        private fun buildBody(c: Context, kind: String): RemoteViews {
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

            if (kind == "status") {
                statusSections(c, m, f, listOf("life", "energy", "nerve", "jail", "hospital"), now, refresh, add)
                return v
            }
            if (kind == "dash") { dashSections(c, f, now, refresh, add); return v }
            if (kind == "oc") { add(panel(c, homeOc(f, now), now)); return v }
            if (kind == "stock") { add(stockCard(c, f, now)); return v }
            if (kind == "trip") {
                val one = listOf("oc")
                when (m.phase) { "traveling" -> travelingSections(c, m, f, one, now, refresh, add); "abroad" -> abroadSections(c, m, f, one, now, refresh, add); else -> homeTripSections(c, m, f, one, now, refresh, add) }
                return v
            }
            when (m.phase) {
                "traveling" -> travelingSections(c, m, f, ids, now, refresh, add)
                "abroad" -> abroadSections(c, m, f, ids, now, refresh, add)
                else -> { statusSections(c, m, f, ids, now, refresh, add); homeRestSections(c, m, f, ids, now, refresh, add) }
            }
            return v
        }


        private fun travelingSections(c: Context, m: Model, f: JSONObject, ids: List<String>, now: Long, refresh: RemoteViews, add: (RemoteViews?) -> Unit) {
            val where = f.optString("where").ifEmpty { "?" }

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

        private fun abroadSections(c: Context, m: Model, f: JSONObject, ids: List<String>, now: Long, refresh: RemoteViews, add: (RemoteViews?) -> Unit) {
            val where = f.optString("where").ifEmpty { "?" }

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

        // Header, bars and status chips for the home phase (also the Status widget).
        private fun statusSections(c: Context, m: Model, f: JSONObject, ids: List<String>, now: Long, refresh: RemoteViews, add: (RemoteViews?) -> Unit) {

                    val chipText = when (m.phase) { "hospital" -> "HOSPITAL"; "jail" -> "JAIL"; "federal" -> "FEDERAL"; "abroad" -> "ABROAD"; "traveling" -> "IN FLIGHT"; else -> "HOME" }
                    add(header(c, f, chipText, when (m.phase) { "home" -> "go"; "abroad" -> "yellow"; "traveling" -> "amber"; else -> "stop" }))
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
        }

        // Next trip from home: round trip, fly lock countdown and the Fly button.
        private fun homeTripSections(c: Context, m: Model, f: JSONObject, ids: List<String>, now: Long, refresh: RemoteViews, add: (RemoteViews?) -> Unit) {
            add(header(c, f, if (m.phase == "home") "HOME" else m.phase.uppercase(), if (m.phase == "home") "go" else "stop"))
            val dest = f.optString("target"); val fly = f.optLong("flySecs"); val ok = f.optLong("flyOkUntil", 0)
            val slack = if (ok > 0) ok - now else null; val locked = Tiles.flyBlocked(f, now)
            val color = if (slack == null) "amber" else if (slack > 7200) "go" else if (slack > 0) "yellow" else "stop"
            val a = Cell("ROUND TRIP", null, "amber", Tiles.dur(fly * 2), "to $dest and back")
            val b = when { slack == null -> Cell("FLY WINDOW", null, "go", "OPEN", "no OC clock"); slack > 0 -> Cell("FLY LOCKS IN", ok, color, sub = "trip + ${f.optLong("flyBufferSecs") / 60}m buffer"); else -> Cell("FLY", null, "stop", "LOCKED", "stay in Torn") }
            add(panel(c, Panel("NEXT TRIP · ${dest.uppercase()}", null, color, a, b), now))
            val tap = Notifier.openIntent(c, "https://www.torn.com/travelagency.php", 30, if (ok > 0) ok else 0)
            add(row(c, 8, listOf(wbtn(c, if (locked) "FLY LOCKED" else "FLY TO ${dest.uppercase()}", if (locked) "lock" else "fly", if (locked) "ghost" else "amber", tap), refresh)))
        }

        // The rest of the combined home view: OC panel, extra tiles and quick buttons.
        private fun homeRestSections(c: Context, m: Model, f: JSONObject, ids: List<String>, now: Long, refresh: RemoteViews, add: (RemoteViews?) -> Unit) {
                    if ("oc" in ids) add(panel(c, homeOc(f, now), now))
                    // Extra tiles, two per row.
                    ids.filter { it in Tiles.EXTRA }.mapNotNull { Tiles.build(it, f, now) }.map { tileView(c, it, now) }.chunked(2).forEach { add(row(c, 8, it)) }
                    quickButtons(c, f, now, refresh, add)
        }

        // The attack list lives in Prefs "targets" (saved by Api.refresh) because the push message is too small to carry it.
        private fun targetsData(c: Context): JSONObject? = try { JSONObject(Prefs.get(c, "targets")) } catch (e: Exception) { null }

        fun targetItems(c: Context): List<JSONObject> {
            val a = targetsData(c)?.optJSONArray("matches") ?: return emptyList()
            return (0 until a.length()).map { a.getJSONObject(it) }
        }

        // One row of the attack list. Tapping it opens that player's attack page; you press Torn's own Attack button.
        // A widget narrower than this (a foldable's cover screen, or a small slot) gets the compact layout.
        const val COMPACT_DP = 260
        // The narrowest width the launcher reports for this widget (the minimum, and every size on Android 12+), in dp. 250 when it reports nothing.
        fun widgetWidthDp(c: Context, id: Int): Int {
            val o = AppWidgetManager.getInstance(c).getAppWidgetOptions(id)
            val all = mutableListOf(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0))
            if (android.os.Build.VERSION.SDK_INT >= 31) @Suppress("DEPRECATION") o.getParcelableArrayList<android.util.SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)?.forEach { all.add(it.width.toInt()) }
            return all.filter { it > 0 }.minOrNull() ?: 250
        }
        // Settings: "auto" decides by width, "on" always uses the compact rows, "off" never does.
        fun isCompact(c: Context, id: Int): Boolean = when (Prefs.get(c, "compact")) { "on" -> true; "off" -> false; else -> widgetWidthDp(c, id) < COMPACT_DP }

        fun targetRow(c: Context, t: JSONObject, now: Long, compact: Boolean = false): RemoteViews {
            val v = RemoteViews(c.packageName, if (compact) R.layout.s_target_c else R.layout.s_target)
            v.setTextViewText(R.id.tg_name, t.optString("name"))
            val bs = t.optString("bs").takeIf { it.isNotEmpty() && it != "null" }
            v.setTextViewText(R.id.tg_sub, "Lv ${t.optInt("level")}${if (bs != null) " · ~$bs" else ""}${if (compact) "\n" else " · "}offline ${Tiles.long(now - t.optLong("lastAction"))}")
            // Difficulty badge from FF Scouter: green is easy, yellow is fair, red is hard.
            if (!t.isNull("ff")) {
                val ff = t.optDouble("ff"); val k = if (ff <= 2.0) "go" else if (ff <= 2.6) "yellow" else "stop"
                v.setViewVisibility(R.id.tg_ff, View.VISIBLE); v.setTextViewText(R.id.tg_ff, "FF\n%.1f".format(ff))
                v.setTextColor(R.id.tg_ff, rgb(k)); v.setInt(R.id.tg_ff, "setBackgroundResource", chipBg(k))
            }
            if (!compact) { v.setTextViewText(R.id.tg_pill, "● ATTACK"); v.setTextColor(R.id.tg_pill, GO); v.setInt(R.id.tg_pill, "setBackgroundResource", R.drawable.chip_go) }
            v.setOnClickFillInIntent(R.id.tg_row, Intent().putExtra("url", "https://www.torn.com/loader.php?sid=attack&user2ID=${t.optLong("id")}"))
            return v
        }

        // One item per widget, chosen when you add it. It fills the whole widget with large text.
        // Where tapping a Single widget goes: the Torn page for what it shows. Null means just refresh.
        fun singlePath(item: String, f: JSONObject): String? = when (item) {
            "location", "trip", "stock", "buymax" -> if (f.optString("phase") == "abroad") "/index.php" else "/travelagency.php"
            "energy", "trains" -> "/gym.php"
            "nerve" -> "/loader.php?sid=crimes"
            "life", "xanax", "drug", "booster", "medical", "addiction" -> "/item.php"
            "hospital" -> "/hospitalview.php"
            "jail" -> "/jailview.php"
            "oc" -> "/factions.php?step=your#/tab=crimes"
            "cash" -> "/bank.php"
            "next" -> when (f.optString("next")) { "fly" -> "/travelagency.php"; "gym" -> "/gym.php"; "crimes" -> "/loader.php?sid=crimes"; else -> "/item.php" }
            "targets" -> "/page.php?sid=list&type=targets"
            "chain", "chainhits", "chainresp", "chainlast" -> "/factions.php?step=your#/tab=main"
            "war" -> "/factions.php?step=your#/tab=wars"
            "npc" -> f.optJSONObject("npc")?.optLong("targetId")?.takeIf { it > 0 }?.let { "/loader.php?sid=attack&user2ID=$it" } ?: "/page.php?sid=list&type=targets"
            "events" -> "/events.php#/step=all"
            "education" -> "/page.php?sid=education"
            "refills" -> "/page.php?sid=points"
            "casino" -> "/page.php?sid=spinTheWheel"
            "calendar" -> "/calendar.php"
            "bounty" -> "/bounties.php"
            "stocks" -> "/page.php?sid=stocks"
            "networth" -> "/index.php"
            else -> null
        }

        private fun buildSingle(c: Context, wid: Int): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.w_single)
            val item = Prefs.get(c, "single_$wid")
            val m = Model.parse(Prefs.get(c, "model")); val f = m?.facts; val now = System.currentTimeMillis() / 1000
            val pick = PendingIntent.getActivity(c, 800 + wid, Intent(c, SingleActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val refresh = broadcast(c, ActionReceiver.ACTION_REFRESH, 0)
            fun text(label: String, value: String, sub: String, color: Int, tap: PendingIntent) {
                v.setTextViewText(R.id.ss_label, label); v.setTextViewText(R.id.ss_value, value); v.setTextColor(R.id.ss_value, color); v.setTextViewText(R.id.ss_sub, sub); v.setOnClickPendingIntent(R.id.ss_root, tap)
            }
            if (item.isEmpty()) { text("WINGMAN", "TAP", "to choose what this widget shows", AMBER, pick); return v }
            if (f == null) { text(item.uppercase(), "…", "waiting for data. Tap to refresh.", DIM, refresh); return v }
            // Tapping opens the Torn page for what is shown (refreshing happens on its own schedule).
            val open = singlePath(item, f)?.let { Notifier.openIntent(c, "https://www.torn.com$it", 900 + wid, 0) } ?: refresh
            // Shortcut buttons: the whole widget is the button.
            val custom = try { org.json.JSONArray(Prefs.get(c, "custom")) } catch (e: Exception) { org.json.JSONArray() }
            val shortcut: Triple<String, String, String>? = when (item) {   // label, icon, path
                "gym" -> Triple("GYM", "zap", "/gym.php"); "fly" -> Triple("FLY", "fly", "/travelagency.php"); "crimes" -> Triple("CRIMES", "target", "/loader.php?sid=crimes")
                "items" -> Triple("ITEMS", "box", "/item.php"); "spin" -> Triple("SPIN THE WHEEL", "spin", "/page.php?sid=spinTheWheel")
                "c1", "c2", "c3", "c4" -> custom.optJSONObject(item.removePrefix("c").toInt() - 1)?.takeIf { it.optString("path").startsWith("/") }
                    ?.let { Triple(it.optString("name").ifEmpty { "LINK" }.uppercase().take(14), "link", it.optString("path")) }
                else -> null
            }
            if (shortcut != null) {
                val locked = item == "fly" && Tiles.flyBlocked(f, now)
                v.setViewVisibility(R.id.ss_value, View.GONE); v.setViewVisibility(R.id.ss_icon, View.VISIBLE)
                v.setImageViewResource(R.id.ss_icon, if (locked) icon("lock", "dim") else icon(shortcut.second, "ink"))
                v.setInt(R.id.ss_root, "setBackgroundResource", if (locked) R.drawable.widget_bg else R.drawable.btn_amber_big)
                v.setTextViewText(R.id.ss_label, if (locked) "FLY LOCKED" else shortcut.first); v.setTextColor(R.id.ss_label, if (locked) DIM else Color_INK)
                v.setTextViewTextSize(R.id.ss_label, android.util.TypedValue.COMPLEX_UNIT_SP, 15f)
                v.setTextViewText(R.id.ss_sub, if (locked) "too close to your OC" else "")
                v.setOnClickPendingIntent(R.id.ss_root, Notifier.openIntent(c, "https://www.torn.com${shortcut.third}", 900 + wid, if (item == "fly") f.optLong("flyOkUntil", 0) else 0))
                return v
            }
            // Bars: big number with a bar underneath.
            if (item in listOf("energy", "nerve", "life")) {
                val b = f.optJSONObject(item); if (b == null) { text(item.uppercase(), "—", "no data", DIM, refresh); return v }
                val cur = b.getInt("cur"); val max = b.getInt("max"); val pct = (cur * 100 / max).coerceIn(0, 100)
                val k = when (item) { "life" -> if (pct > 70) "go" else if (pct > 35) "yellow" else "stop"; "energy" -> "amber"; else -> "yellow" }
                val at = if (b.has("fullAt") && !b.isNull("fullAt")) b.getLong("fullAt") else 0L
                text(item.uppercase(), "$cur/$max", if (cur >= max) "FULL" else if (at > now) "full at ${Tiles.clock(at)}" else "", rgb(k), open)
                v.setViewVisibility(R.id.ss_bars, View.VISIBLE)
                listOf("go", "amber", "yellow", "stop").forEach { kk -> v.setViewVisibility(resBar(kk), if (kk == k) View.VISIBLE else View.GONE) }
                v.setProgressBar(resBar(k), 100, pct, false)
                return v
            }
            // Status and everything else is a tile: a live timer or a value.
            val tile: Tile? = when (item) {
                "hospital" -> f.optLong("hospitalUntil", 0).let { u -> if (u > now) Tile("HOSPITAL", timerTo = u, sub = "until released", color = STOP) else Tile("HOSPITAL", "OK", sub = "not in hospital", color = GO) }
                "jail" -> f.optLong("jailUntil", 0).let { u -> if (u > now) Tile("JAIL", timerTo = u, sub = "until released", color = STOP) else Tile("JAIL", "FREE", sub = "not in jail", color = GO) }
                else -> Tiles.build(item, f, now)
            }
            if (tile == null) { text(item.uppercase(), "—", "nothing to show", DIM, refresh); return v }
            text(tile.label, tile.text, tile.sub, tile.color, open)
            if (tile.timerTo != null && tile.timerTo > now) {
                v.setViewVisibility(R.id.ss_value, View.GONE); v.setViewVisibility(R.id.ss_timer, View.VISIBLE)
                v.setTextColor(R.id.ss_timer, tile.color); countdown(v, R.id.ss_timer, tile.timerTo - now)
            } else if (tile.timerTo != null) v.setTextViewText(R.id.ss_value, "NOW")
            return v
        }

        private fun resBar(k: String) = when (k) { "go" -> R.id.ss_b_go; "amber" -> R.id.ss_b_amber; "yellow" -> R.id.ss_b_yellow; else -> R.id.ss_b_stop }

        // The scrollable attack list widget.
        private fun buildTargets(c: Context, id: Int): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.w_targets)
            val compact = isCompact(c, id)
            val d = targetsData(c)
            val total = d?.optInt("total") ?: 0
            val err = d?.optString("error")?.takeIf { it.isNotEmpty() && it != "null" }
            // Your energy and hospital status stay visible above the list.
            val f = Model.parse(Prefs.get(c, "model"))?.facts; val now = System.currentTimeMillis() / 1000
            f?.optJSONObject("energy")?.let { e ->
                val cur = e.getInt("cur"); val max = e.getInt("max")
                v.setTextViewText(R.id.tgt_en_value, "$cur/$max${if (cur >= max) " FULL" else ""}"); v.setProgressBar(R.id.tgt_en_bar, 100, (cur * 100 / max).coerceIn(0, 100), false)
            }
            val hu = f?.optLong("hospitalUntil", 0) ?: 0
            if (hu > now) {
                v.setInt(R.id.tgt_hosp_box, "setBackgroundResource", R.drawable.chip_stop); v.setTextViewText(R.id.tgt_hosp, "● HOSPITAL"); v.setTextColor(R.id.tgt_hosp, STOP)
                v.setViewVisibility(R.id.tgt_hosp_t, View.VISIBLE); countdown(v, R.id.tgt_hosp_t, hu - now)
            } else { v.setInt(R.id.tgt_hosp_box, "setBackgroundResource", R.drawable.chip_go); v.setTextViewText(R.id.tgt_hosp, "● HOSPITAL · OK"); v.setTextColor(R.id.tgt_hosp, GO) }
            v.setTextViewText(R.id.tgt_label, "ATTACK LIST")
            v.setTextViewText(R.id.tgt_count, if (d == null) "No data yet" else if (compact) "$total targets" else "$total can be hit")
            if (compact) { // narrow: keep the title, the list and the refresh button; drop the badges and the energy line
                v.setViewVisibility(R.id.tgt_chip, View.GONE); v.setViewVisibility(R.id.tgt_status_row, View.GONE)
                v.setTextViewTextSize(R.id.tgt_count, android.util.TypedValue.COMPLEX_UNIT_SP, 18f)
            }
            if (!compact) v.setTextViewText(R.id.tgt_chip, if (d?.optString("source") == "ff") "● FF SCOUTER" else "● OFFLINE")
            v.setRemoteAdapter(R.id.tgt_list, Intent(c, TargetsService::class.java).apply { putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id); data = android.net.Uri.parse(toUri(Intent.URI_INTENT_SCHEME)) })
            v.setPendingIntentTemplate(R.id.tgt_list, PendingIntent.getActivity(c, 60, Intent(c, OpenActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE))
            v.setEmptyView(R.id.tgt_list, R.id.tgt_empty)
            v.setTextViewText(R.id.tgt_empty, err ?: if (d == null) "Waiting for the backend. Tap ⟳." else "No matches. Loosen the filters in Wingman → Targets.")
            v.setTextColor(R.id.tgt_empty, if (err != null) STOP else DIM)
            v.setOnClickPendingIntent(R.id.tgt_refresh, broadcast(c, ActionReceiver.ACTION_REFRESH, 0))
            Prefs.get(c, "model_at").toLongOrNull()?.let { v.setTextViewText(R.id.tgt_updated, "UPDATED ${Tiles.clock(it)}") }
            return v
        }

        // Shortcut buttons for the given ids. Fly greys out and locks near your OC; your own shortcuts come from the Dashboard editor.
        private fun buttonViews(c: Context, f: JSONObject, now: Long, ids: List<String>, vertical: Boolean): List<RemoteViews> {
            val custom = try { org.json.JSONArray(Prefs.get(c, "custom")) } catch (e: Exception) { org.json.JSONArray() }
            val lay = if (vertical) R.layout.s_qbtn_v else R.layout.s_qbtn
            return ids.mapIndexedNotNull { i, id ->
                val tap = { path: String, before: Long -> Notifier.openIntent(c, "https://www.torn.com$path", 70 + i, before) }
                when (id) {
                    "fly" -> qbtn(c, "FLY", "fly", Tiles.flyBlocked(f, now), tap("/travelagency.php", f.optLong("flyOkUntil", 0)), lay)
                    "gym" -> qbtn(c, "GYM", "zap", false, tap("/gym.php", 0), lay); "crimes" -> qbtn(c, "CRIMES", "target", false, tap("/loader.php?sid=crimes", 0), lay)
                    "items" -> qbtn(c, "ITEMS", "box", false, tap("/item.php", 0), lay); "spin" -> qbtn(c, "SPIN", "spin", false, tap("/page.php?sid=spinTheWheel", 0), lay)
                    else -> custom.optJSONObject(id.removePrefix("c").toIntOrNull()?.minus(1) ?: -1)?.let { o ->
                        val path = o.optString("path"); if (!path.startsWith("/")) null else qbtn(c, o.optString("name").ifEmpty { "LINK" }.uppercase().take(8), "link", false, tap(path, 0), lay)
                    }
                }
            }
        }

        // The Actions widget: your chosen buttons in a row, or stacked when the widget is one column wide.
        private fun buildActions(c: Context, wid: Int): RemoteViews {
            val f = Model.parse(Prefs.get(c, "model"))?.facts ?: JSONObject()
            val now = System.currentTimeMillis() / 1000
            val ids = Tiles.dash(Prefs.get(c, "actions_$wid").ifEmpty { Tiles.ACTIONS_DEFAULT }).filter { id -> Tiles.DASH.first { it.id == id }.button }
            val width = AppWidgetManager.getInstance(c).getAppWidgetOptions(wid).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
            if (width in 1..139) {
                val v = RemoteViews(c.packageName, R.layout.w_actions_v)
                v.removeAllViews(R.id.av_list) // redraws reuse the old view, so clear it or the buttons pile up
                buttonViews(c, f, now, ids, true).forEach { v.addView(R.id.av_list, it) }
                return v
            }
            val v = RemoteViews(c.packageName, R.layout.widget); v.removeAllViews(R.id.content)
            buttonViews(c, f, now, ids, false).chunked(4).forEach { r -> v.addView(R.id.content, row(c, 8, r)) }
            return v
        }

        // The customizable Dashboard: live tiles first, then shortcut buttons, both in the order you chose.
        private fun dashSections(c: Context, f: JSONObject, now: Long, refresh: RemoteViews, add: (RemoteViews?) -> Unit) {
            val ids = Tiles.dash(Prefs.get(c, "dash").ifEmpty { Tiles.DASH_DEFAULT })
            val bars = ids.filter { it in listOf("life", "energy", "nerve") }.mapNotNull { id ->
                val b = f.optJSONObject(id) ?: return@mapNotNull null
                val cur = b.getInt("cur"); val max = b.getInt("max"); val pct = (cur * 100 / max).coerceAtMost(100)
                when (id) {
                    "life" -> stat(c, "HEALTH", "%,d/%,d".format(cur, max), pct, if (pct > 70) "go" else if (pct > 35) "yellow" else "stop")
                    "energy" -> stat(c, "ENERGY", "$cur/$max${if (cur >= max) " FULL" else ""}", pct, "amber")
                    else -> stat(c, "NERVE", "$cur/$max${if (cur >= max) " FULL" else ""}", pct, "yellow")
                }
            }
            val chips = mutableListOf<RemoteViews>()
            if ("hospital" in ids) { val u = f.optLong("hospitalUntil", 0); chips.add(if (u > now) chip(c, "HOSPITAL", "stop", u, now) else chip(c, "HOSPITAL · OK", "go", null, now)) }
            if ("jail" in ids) { val u = f.optLong("jailUntil", 0); chips.add(if (u > now) chip(c, "JAIL", "stop", u, now) else chip(c, "JAIL · FREE", "go", null, now)) }
            if (chips.isNotEmpty()) add(row(c, 8, chips))
            // The OC countdown gets a full-width card; other tiles pair up.
            if ("oc" in ids) Tiles.build("oc", f, now)?.let { add(row(c, 8, listOf(tileView(c, it, now)))) }
            bars.chunked(2).forEach { add(row(c, 12, it)) }
            ids.filter { it in listOf("location", "xanax", "addiction", "booster", "medical", "chain", "chainhits", "chainresp", "chainlast", "npc", "events", "education", "refills", "casino", "calendar", "trains", "war", "networth", "bounty", "stocks", "cash") }.mapNotNull { Tiles.build(it, f, now) }.map { tileView(c, it, now) }.chunked(2).forEach { add(row(c, 8, it)) }
            val btns = buttonViews(c, f, now, ids.filter { id -> Tiles.DASH.first { it.id == id }.button }, false)
            btns.chunked(3).forEachIndexed { i, r -> add(row(c, 8, if (i == btns.chunked(3).lastIndex) r + refresh else r)) }
            if (btns.isEmpty()) add(row(c, 8, listOf(refresh)))
        }

        private fun quickButtons(c: Context, f: JSONObject, now: Long, refresh: RemoteViews, add: (RemoteViews?) -> Unit) {
            val on = Prefs.get(c, "buttons").ifEmpty { Tiles.DEFAULT_BUTTONS }.split(',')
            val qs = Tiles.BUTTONS.filter { it.id in on }.mapIndexed { i, b ->
                val locked = b.id == "fly" && Tiles.flyBlocked(f, now)
                val before = if (b.id == "fly") f.optLong("flyOkUntil", 0) else 0
                qbtn(c, b.label, when (b.id) { "fly" -> "fly"; "gym" -> "zap"; "crimes" -> "target"; else -> "box" }, locked, Notifier.openIntent(c, b.url, 20 + i, before))
            }
            add(row(c, 8, if (qs.isNotEmpty()) qs + refresh else listOf(refresh)))
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
