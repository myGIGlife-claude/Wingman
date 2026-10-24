package com.wingman.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The fly lock is the safety feature that stops you leaving when a trip no longer fits before your OC.
class TilesTest {
    private val now = 1_000_000L

    @Test fun flyIsAllowedBeforeTheLockTimeAndBlockedAfter() {
        val f = JSONObject().put("flyOkUntil", now + 100).put("ocNow", false)
        assertFalse(Tiles.flyBlocked(f, now))
        assertFalse(Tiles.flyBlocked(f, now + 100))   // exactly at the limit is still allowed
        assertTrue(Tiles.flyBlocked(f, now + 101))
    }

    @Test fun flyIsBlockedWhenTheOcIsReady() {
        assertTrue(Tiles.flyBlocked(JSONObject().put("ocNow", true), now))
    }

    @Test fun flyIsAllowedWithNoOcAtAll() {
        assertFalse(Tiles.flyBlocked(JSONObject(), now))
    }

    @Test fun ocColorGoesGreenYellowRed() {
        val home = { slack: Long, left: Long -> JSONObject().put("phase", "home").put("flyOkUntil", now + slack) to (now + left) }
        fun color(slack: Long, left: Long) = home(slack, left).let { (f, ready) -> Tiles.key(Tiles.ocColor(f, ready, now)) }
        assertEquals("go", color(slack = 10_000, left = 20_000))      // plenty of room to fly
        assertEquals("yellow", color(slack = 3_600, left = 10_000))   // fly window closing
        assertEquals("stop", color(slack = -1, left = 10_000))        // fly locked
        assertEquals("stop", color(slack = 10_000, left = 1_000))     // OC under 30 minutes away
    }

    @Test fun layoutKeepsOnlyKnownTiles() {
        assertEquals(listOf("life", "oc"), Tiles.layout("life,bogus,,oc"))
    }
}
