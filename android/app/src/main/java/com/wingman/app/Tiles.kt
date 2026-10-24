package com.wingman.app

import android.graphics.Color
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// One cell of the widget. Shows a live countdown when timerTo is in the future, otherwise the text.
data class Tile(val label: String, val text: String = "", val timerTo: Long? = null, val sub: String = "", val color: Int = AMBER, val full: Boolean = false)

val AMBER = Color.parseColor("#FFB627")
val GO = Color.parseColor("#B5E35C")
val STOP = Color.parseColor("#FF5F3C")
val PAPER = Color.parseColor("#EDE7D3")
val DIM = Color.parseColor("#B0A88F")
val YELLOW = Color.parseColor("#FFD23F")

class TileDef(val id: String, val title: String)

object Tiles {
    val ALL = listOf(
        TileDef("life", "Health bar"), TileDef("energy", "Energy bar"), TileDef("nerve", "Nerve bar"),
        TileDef("jail", "Jail status"), TileDef("hospital", "Hospital status"), TileDef("oc", "OC timer"),
        TileDef("trip", "Trip: landing / leave by / fly by"), TileDef("stock", "Stock of your item"),
        TileDef("buymax", "Buy max"), TileDef("next", "Next step"), TileDef("cash", "Cash"),
        TileDef("drug", "Drug cooldown"), TileDef("booster", "Booster cooldown"), TileDef("medical", "Medical cooldown"),
    )
    val EXTRA = setOf("trip", "stock", "buymax", "next", "cash", "drug", "booster", "medical")
    const val DEFAULT = "life,energy,jail,hospital,oc"

    private fun JSONObject.l(k: String): Long? = if (has(k) && !isNull(k)) getLong(k) else null
    private fun JSONObject.s(k: String): String? = if (has(k) && !isNull(k)) getString(k) else null

    // Green with plenty of time, yellow as the fly window closes, red once flying is locked or the OC is close.
    fun ocColor(f: JSONObject, ready: Long, now: Long): Int {
        val left = ready - now
        val slack = f.l("flyOkUntil")?.let { it - now }
        return when {
            left < 1800 -> STOP
            f.optString("phase") == "home" && slack != null -> if (slack > 7200) GO else if (slack > 0) YELLOW else STOP
            else -> if (left > 7200) GO else YELLOW
        }
    }

    fun key(color: Int) = when (color) { GO -> "go"; YELLOW -> "yellow"; STOP -> "stop"; else -> "amber" }

    // Fly is blocked when the round trip plus the buffer no longer fits before the OC.
    fun flyBlocked(f: JSONObject, now: Long): Boolean = f.optBoolean("ocNow") || (f.l("flyOkUntil")?.let { now > it } ?: false)

    fun clock(epoch: Long): String = SimpleDateFormat("h:mm a", Locale.US).format(Date(epoch * 1000))
    fun dur(secs: Long): String { val h = secs / 3600; val m = (secs % 3600) / 60; return if (h > 0) "${h}h ${m.toString().padStart(2, '0')}m" else "${m}m" }
    fun long(secs: Long): String = if (secs >= 86400) "${secs / 86400}d ${(secs % 86400) / 3600}h" else dur(secs)
    fun money(n: Long): String = when {
        n >= 1_000_000_000 -> "$%.2fb".format(n / 1e9); n >= 1_000_000 -> "$%.2fm".format(n / 1e6)
        n >= 1_000 -> "$${n / 1000}k"; else -> "$$n"
    }

    fun build(id: String, f: JSONObject, now: Long): Tile? = when (id) {
        "oc" -> {
            val at = f.l("ocReadyAt"); val name = f.s("ocName"); val sub = listOfNotNull(name, f.s("ocStatus")).joinToString(" · ").ifEmpty { "No OC" }
            if (f.optBoolean("ocNow")) Tile("OC", "READY", sub = sub, color = GO, full = true)
            else if (at != null) Tile("OC READY IN", timerTo = at, sub = sub, color = ocColor(f, at, now), full = true)
            else Tile("OC", "—", sub = if (name != null) "$sub · no time yet" else sub, color = DIM, full = true)
        }
        "trip" -> when (f.optString("phase")) {
            "traveling" -> {
                val to = f.l("landAt"); val where = f.s("where")
                Tile(if (f.optBoolean("outbound")) "LANDS IN ${where?.uppercase() ?: "?"}" else "LANDS HOME", timerTo = to, sub = to?.let { "at ${clock(it)}" } ?: "")
            }
            "abroad" -> {
                val lb = f.l("leaveBy"); val fly = f.optLong("flySecs")
                val sub = "in ${f.s("where") ?: "?"} · home ${dur(fly)}"
                if (lb == null) Tile("LEAVE BY", "—", sub = sub, color = DIM)
                else Tile("LEAVE BY ${clock(lb)}", timerTo = lb, sub = sub, color = if (lb - now < 600) STOP else AMBER)
            }
            "home" -> {
                val fb = f.l("flyBy"); val fly = f.optLong("flySecs"); val tgt = f.optString("target")
                val sub = "$tgt · ${dur(fly)} each way"
                if (!f.optBoolean("fits", true)) Tile("TRIP", "NO FIT", sub = sub, color = STOP)
                else if (fb != null) Tile("FLY WITHIN", timerTo = fb, sub = sub)
                else Tile("TRIP", dur(fly), sub = "$tgt each way, no OC clock", color = PAPER)
            }
            else -> Tile("TRIP", f.optString("phase").uppercase(), color = DIM)
        }
        "stock" -> {
            val item = f.optString("item").ifEmpty { "STOCK" }; val st = f.optJSONObject("stock")
            if (st == null) Tile(item.uppercase(), "?", sub = "no stock data", color = DIM)
            else {
                val seen = if (st.has("seen") && !st.isNull("seen")) " · seen ${(now - st.getLong("seen")) / 60}m ago" else ""
                Tile(item.uppercase(), st.getInt("qty").toString(), sub = "${money(st.getLong("cost"))}$seen", color = if (st.getInt("qty") == 0) STOP else GO)
            }
        }
        "buymax" -> {
            val n = if (f.has("buyMax") && !f.isNull("buyMax")) f.getInt("buyMax") else null
            val cash = f.l("cash")?.let { "cash ${money(it)}" } ?: ""
            if (n == null) Tile("BUY MAX", "—", sub = "when abroad", color = DIM)
            else Tile("BUY MAX", n.toString(), sub = if (f.s("buyWhy") == "cash") "not enough cash" else cash, color = if (n > 0) GO else STOP)
        }
        "name" -> Tile(f.s("faction")?.uppercase() ?: "NO FACTION", f.s("name") ?: "—", color = PAPER, full = true)
        "life" -> f.optJSONObject("life")?.let {
            val cur = it.getInt("cur"); val max = it.getInt("max"); val pct = cur * 100 / max; val at = it.l("fullAt")
            Tile("HEALTH", "$cur/$max", sub = if (cur >= max) "full" else at?.let { a -> "full ${clock(a)}" } ?: "", color = if (pct > 70) GO else if (pct > 35) YELLOW else STOP)
        }
        "jail" -> f.l("jailUntil").let { u -> if (u != null && u > now) Tile("JAIL", timerTo = u, sub = "released", color = STOP) else Tile("JAIL", "FREE", color = GO) }
        "hospital" -> f.l("hospitalUntil").let { u -> if (u != null && u > now) Tile("HOSPITAL", timerTo = u, sub = "released", color = STOP) else Tile("HOSPITAL", "OK", color = GO) }
        "next" -> Tile("NEXT", if (f.optBoolean("ocNow")) "HOLD" else f.s("next")?.uppercase() ?: "WAIT", color = if (f.optBoolean("ocNow")) STOP else AMBER)
        "cash" -> Tile("CASH", f.l("cash")?.let { money(it) } ?: "—", color = PAPER)
        "energy", "nerve" -> f.optJSONObject(id)?.let {
            val full = it.getInt("cur") >= it.getInt("max"); val at = it.l("fullAt")
            Tile(id.uppercase(), "${it.getInt("cur")}/${it.getInt("max")}", sub = if (full) "full" else at?.let { a -> "full ${clock(a)}" } ?: "", color = if (full) GO else PAPER)
        }
        "drug", "booster", "medical" -> {
            val at = f.optJSONObject("cooldowns")?.l(id)
            if (at != null && at > now) Tile("${id.uppercase()} CD", timerTo = at) else Tile("${id.uppercase()} CD", "READY", color = GO)
        }
        else -> null
    }

    // Quick buttons that open the right Torn page. Fly can lock itself.
    class Btn(val id: String, val label: String, val url: String)
    val BUTTONS = listOf(
        Btn("fly", "FLY", "https://www.torn.com/travelagency.php"), Btn("gym", "GYM", "https://www.torn.com/gym.php"),
        Btn("crimes", "CRIMES", "https://www.torn.com/loader.php?sid=crimes"), Btn("items", "ITEMS", "https://www.torn.com/item.php"),
    )
    const val DEFAULT_BUTTONS = "fly,gym,crimes"

    fun layout(csv: String): List<String> = csv.split(',').filter { it.isNotBlank() && ALL.any { d -> d.id == it } }
}
