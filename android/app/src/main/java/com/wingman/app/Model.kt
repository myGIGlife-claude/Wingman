package com.wingman.app

import org.json.JSONObject

// Widget model from the backend (GET /state or FCM data "model").
data class Model(
    val phase: String, val title: String, val countdownTo: Long?, val countdownLabel: String,
    val sub: String, val label: String, val url: String?, val style: String, val showBought: Boolean,
) {
    companion object {
        fun parse(json: String): Model? = try {
            val j = JSONObject(json)
            val p = j.getJSONObject("primary")
            Model(
                j.optString("phase"), j.optString("title"),
                if (j.isNull("countdownTo")) null else j.getLong("countdownTo"),
                j.optString("countdownLabel"), j.optString("sub"),
                p.optString("label"), if (p.isNull("url")) null else p.getString("url"),
                p.optString("style", "ghost"), j.optBoolean("showBought"),
            )
        } catch (e: Exception) { null }
    }
}
