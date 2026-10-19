// POST /api/weekly  { device_token, admin_pin? }
// Returns the top user for the current week based on AEST (Monday 00:00:00 to Sunday 23:59:59 AEST).
// Resets every Sunday at 11:59:59 PM AEST.
// Restricted: names and open counts reveal household movement, so only
// verified (1-tap) devices and administrators may read it.
import { authorizeViewer, readViewerCredentials } from "./_db.js";

// A plain browser visit must never return data.
export async function onRequestGet() {
  return jsonStatus({ error: "Usage history is only visible to verified devices and the admin." }, 403);
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ top_name: null, top_count: 0 });

  const auth = await authorizeViewer(env, await readViewerCredentials(request));
  if (!auth.allowed) return jsonStatus({ error: "Usage history is only visible to verified devices and the admin." }, 403);

  try {
    // Current time in AEST (UTC+10)
    const now = new Date();
    const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;
    const aestNow = new Date(now.getTime() + AEST_OFFSET_MS);

    // Day of week in AEST: 0=Sun, 1=Mon, ..., 6=Sat
    const dow = aestNow.getUTCDay();
    const daysFromMonday = (dow + 6) % 7;

    // Monday 00:00:00 AEST
    const mondayAestYear = aestNow.getUTCFullYear();
    const mondayAestMonth = aestNow.getUTCMonth();
    const mondayAestDate = aestNow.getUTCDate() - daysFromMonday;

    const mondayAest = new Date(Date.UTC(mondayAestYear, mondayAestMonth, mondayAestDate, 0, 0, 0));
    // Convert Monday 00:00:00 AEST back to UTC for querying events.triggered_at (stored in UTC)
    const weekStartUtc = new Date(mondayAest.getTime() - AEST_OFFSET_MS);
    const weekStartUtcStr = weekStartUtc.toISOString().replace("T", " ").substring(0, 19);

    // Sunday 23:59:59 AEST
    const sundayAest = new Date(Date.UTC(mondayAestYear, mondayAestMonth, mondayAestDate + 6, 23, 59, 59));
    const weekEndStr = sundayAest.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

    // Live nickname prioritized from devices table
    const top = await env.DB.prepare(
      "SELECT " +
      "  COALESCE(NULLIF(d.friendly_name, ''), NULLIF(e.friendly_name, ''), d.platform, 'Unknown Device') AS name, " +
      "  COUNT(*) AS count " +
      "FROM events e " +
      "LEFT JOIN devices d ON e.device_token = d.device_token " +
      "WHERE e.triggered_at >= ? " +
      "GROUP BY e.device_token " +
      "ORDER BY count DESC LIMIT 1"
    ).bind(weekStartUtcStr).first();

    return json({
      top_name:   top ? top.name  : null,
      top_count:  top ? top.count : 0,
      week_end:   weekEndStr,
      timezone:   "AEST"
    });
  } catch (err) {
    console.error("[weekly]", err);
    return json({ top_name: null, top_count: 0 });
  }
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

function jsonStatus(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
