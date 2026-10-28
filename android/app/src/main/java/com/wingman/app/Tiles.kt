package com.wingman.app

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// One cell of the widget. Shows a live countdown when timerTo is in the future, otherwise the text.
data class Tile(val label: String, val text: String = "", val timerTo: Long? = null, val sub: String = "", val color: Int = AMBER)

val AMBER = 0xFFFFB627.toInt()
val GO = 0xFFB5E35C.toInt()
val STOP = 0xFFFF5F3C.toInt()
val PAPER = 0xFFEDE7D3.toInt()
val DIM = 0xFFB0A88F.toInt()
val YELLOW = 0xFFFFD23F.toInt()

class TileDef(val id: String, val title: String)

// One entry in the customizable Dashboard widget: a live tile or a shortcut button.
class DashDef(val id: String, val title: String, val button: Boolean)

object Tiles {
    val ALL = listOf(
        TileDef("life", "Health bar"), TileDef("energy", "Energy bar"), TileDef("nerve", "Nerve bar"),
        TileDef("jail", "Jail status"), TileDef("hospital", "Hospital status"), TileDef("oc", "OC timer"),
        TileDef("trip", "Trip: landing / leave by / fly by"), TileDef("stock", "Stock of your item"),
        TileDef("buymax", "Buy max"), TileDef("next", "Next step"), TileDef("cash", "Cash"),
        TileDef("drug", "Drug cooldown"), TileDef("booster", "Booster cooldown"), TileDef("medical", "Medical cooldown"),
    )
    val DASH = listOf(
        DashDef("oc", "OC countdown", false), DashDef("location", "Location: in Torn, abroad or flying, with ETA", false), DashDef("energy", "Energy bar", false), DashDef("nerve", "Nerve bar", false), DashDef("life", "Health bar", false),
        DashDef("xanax", "Xanax: cooldown, addiction, counts", false), DashDef("addiction", "Addiction watch: penalty and rehabs", false), DashDef("booster", "Booster cooldown", false), DashDef("medical", "Medical cooldown", false),
        DashDef("chain", "Chain watch: hits and time left", false), DashDef("npc", "NPC attack time (Loot Rangers)", false), DashDef("cash", "Cash", false), DashDef("hospital", "Hospital status", false), DashDef("jail", "Jail status", false),
        DashDef("gym", "Gym button", true), DashDef("fly", "Fly button (locks near your OC)", true), DashDef("crimes", "Crimes button", true),
        DashDef("items", "Items button", true), DashDef("spin", "Spin the wheel button", true),
        DashDef("c1", "Custom shortcut 1", true), DashDef("c2", "Custom shortcut 2", true), DashDef("c3", "Custom shortcut 3", true), DashDef("c4", "Custom shortcut 4", true),
    )
    // Sections of the Dashboard builder, in tab order. Every DASH id belongs to one; shortcut buttons are all in "Shortcuts".
    val GROUPS = listOf("Travel", "Bars", "Cooldowns", "OC", "Faction", "Loot", "Status", "Shortcuts")
    private val GROUP_OF = mapOf("location" to "Travel", "energy" to "Bars", "nerve" to "Bars", "life" to "Bars",
        "xanax" to "Cooldowns", "addiction" to "Cooldowns", "booster" to "Cooldowns", "medical" to "Cooldowns",
        "oc" to "OC", "chain" to "Faction", "npc" to "Loot", "hospital" to "Status", "jail" to "Status", "cash" to "Status")
    fun group(d: DashDef): String = if (d.button) "Shortcuts" else GROUP_OF[d.id] ?: "Status"
    const val ACTIONS_DEFAULT = "fly,gym,crimes,items"
    const val DASH_DEFAULT = "oc,energy,xanax,hospital,gym,fly,crimes,spin"
    val SHORTCUT_URL = mapOf("gym" to "/gym.php", "fly" to "/travelagency.php", "crimes" to "/loader.php?sid=crimes", "items" to "/item.php", "spin" to "/page.php?sid=spinTheWheel")
    fun dash(csv: String): List<String> = csv.split(',').filter { id -> DASH.any { it.id == id } }
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
    fun long(secs: Long): String = if (secs >= 365 * 86400) "${secs / (365 * 86400)}y+" else if (secs >= 86400) "${secs / 86400}d ${(secs % 86400) / 3600}h" else dur(secs)
    fun money(n: Long): String = when {
        n >= 1_000_000_000 -> "$%.2fb".format(n / 1e9); n >= 1_000_000 -> "$%.2fm".format(n / 1e6)
        n >= 1_000 -> "$${n / 1000}k"; else -> "$$n"
    }

    fun build(id: String, f: JSONObject, now: Long): Tile? = when (id) {
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
        "location" -> when (f.optString("phase")) {
            "traveling" -> {
                val to = f.l("landAt"); val where = f.s("where")?.uppercase() ?: "?"
                Tile(if (f.optBoolean("outbound")) "FLYING TO $where" else "FLYING HOME", timerTo = to, sub = to?.let { "lands ${clock(it)}" } ?: "", color = AMBER)
            }
            "abroad" -> Tile("YOU ARE IN", f.s("where")?.uppercase() ?: "ABROAD", sub = f.l("leaveBy")?.let { "leave by ${clock(it)}" } ?: "abroad", color = YELLOW)
            "hospital" -> Tile("YOU ARE IN", "TORN", sub = "in hospital", color = STOP)
            "jail", "federal" -> Tile("YOU ARE IN", "TORN", sub = "in jail", color = STOP)
            else -> Tile("YOU ARE IN", "TORN", sub = "at home", color = GO)
        }
        "oc" -> {
            val at = f.l("ocReadyAt"); val name = f.s("ocName") ?: "Not in an OC"
            if (f.optBoolean("ocNow")) Tile("OC", "READY", sub = name, color = GO)
            else if (at != null) Tile("OC READY IN", timerTo = at, sub = name, color = ocColor(f, at, now))
            else Tile("OC", "—", sub = name, color = DIM)
        }
        "addiction" -> {
            val d = f.optJSONObject("drugs")
            if (d == null || !d.has("addiction") || d.isNull("addiction")) Tile("ADDICTION", "?", sub = "no data yet", color = DIM)
            else {
                val pct = d.getInt("addiction")
                val label = d.optString("addictionLabel").takeIf { it.isNotEmpty() && it != "null" } ?: if (pct == 0) "No addiction penalty" else "Addiction"
                val rehabs = d.takeIf { it.has("rehabs") && !it.isNull("rehabs") }?.let { " · ${it.getInt("rehabs")} rehabs" } ?: ""
                // Torn can kick you from education at roughly a 6-7% penalty, so red starts well before that.
                Tile("ADDICTION", if (pct == 0) "NONE" else "$pct%", sub = label + rehabs, color = if (pct == 0) GO else if (pct > -4) YELLOW else STOP)
            }
        }
        "xanax" -> {
            val at = f.optJSONObject("cooldowns")?.l("drug"); val d = f.optJSONObject("drugs")
            val parts = listOfNotNull(
                d?.takeIf { it.has("addiction") && !it.isNull("addiction") }?.let { "addiction ${it.getInt("addiction")}%" },
                d?.takeIf { it.has("xanTaken") && !it.isNull("xanTaken") }?.let { "${it.getInt("xanTaken")} taken" },
                d?.takeIf { it.has("overdoses") && !it.isNull("overdoses") }?.let { "${it.getInt("overdoses")} OD" })
            val sub = parts.joinToString(" · ")
            if (at != null && at > now) Tile("XANAX COOLDOWN", timerTo = at, sub = sub, color = STOP) else Tile("XANAX", "READY", sub = sub, color = GO)
        }
        "npc" -> {
            val n = f.optJSONObject("npc"); val at = n?.l("at")
            when (n?.optString("state")) {
                null -> Tile("NPC ATTACK", "—", sub = "no data yet", color = DIM)
                "live" -> Tile("NPC ATTACK", "LIVE", sub = (n.s("targetName")?.let { "hit $it first · " } ?: "") + "via Loot Rangers", color = GO)
                "set" -> {
                    val order = n.optJSONArray("order")?.let { a -> (0 until a.length()).joinToString(", ") { a.getString(it) } } ?: ""
                    if (at != null && at > now) Tile("NPC ATTACK IN", timerTo = at, sub = if (order.isNotEmpty()) order else "via Loot Rangers", color = AMBER)
                    else Tile("NPC ATTACK", "SOON", sub = "via Loot Rangers", color = AMBER)
                }
                else -> Tile("NPC ATTACK", "NONE", sub = n.s("reason")?.let { "$it · Loot Rangers" } ?: "none set · Loot Rangers", color = DIM)
            }
        }
        "chain" -> {
            val c = f.optJSONObject("chain"); val end = c?.l("endAt"); val cur = c?.optInt("current") ?: 0; val max = c?.optInt("max") ?: 0
            when {
                c == null -> Tile("CHAIN", "—", sub = "no data yet", color = DIM)
                c.optBoolean("noAccess") -> Tile("CHAIN", "—", sub = "needs faction access on your key", color = DIM)
                cur <= 0 || end == null -> Tile("CHAIN", "NONE", sub = "no active chain", color = DIM)
                end <= now -> Tile("CHAIN $cur", "ENDED", sub = "chain broke", color = STOP)
                else -> Tile(if (max > 0) "CHAIN $cur/$max" else "CHAIN $cur", timerTo = end, sub = "until it breaks", color = if (end - now < 60) STOP else if (end - now < 180) YELLOW else GO)
            }
        }
        "targets" -> {
            val t = f.optJSONObject("targets")
            if (t == null) Tile("TARGETS", "—", sub = "turn targets on in settings", color = DIM)
            else if (t.has("error") && !t.isNull("error")) Tile("TARGETS", "!", sub = t.optString("error"), color = STOP)
            else Tile("TARGETS", t.optInt("total").toString(), sub = "match your filters", color = if (t.optInt("total") > 0) GO else DIM)
        }
        "next" -> Tile("NEXT", if (f.optBoolean("ocNow")) "HOLD" else f.s("next")?.uppercase() ?: "WAIT", color = if (f.optBoolean("ocNow")) STOP else AMBER)
        "cash" -> Tile("CASH", f.l("cash")?.let { money(it) } ?: "—", color = PAPER)
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
