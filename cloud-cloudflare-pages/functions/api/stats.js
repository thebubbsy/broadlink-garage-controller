// GET /api/stats
// Returns fun usage statistics from the events and devices tables in AEST (UTC+10).
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);

  try {
    const [totals, hourly, recent, topDevice] = await Promise.all([

      env.DB.prepare(`
        SELECT
          COUNT(*)                            AS total_triggers,
          MIN(triggered_at)                   AS first_ever,
          MAX(triggered_at)                   AS last_trigger,
          COUNT(DISTINCT device_token)        AS unique_devices,
          SUM(CASE WHEN auth_method = 'pin' THEN 1 ELSE 0 END)                    AS pin_count,
          SUM(CASE WHEN auth_method = 'whitelisted_4factor' THEN 1 ELSE 0 END)    AS whitelist_count
        FROM events
      `).first(),

      // Group by AEST hour (0–23) using SQLite '+10 hours' modifier
      env.DB.prepare(`
        SELECT
          CAST(strftime('%H', datetime(triggered_at, '+10 hours')) AS INTEGER) AS hour,
          COUNT(*) AS count
        FROM events
        GROUP BY hour
        ORDER BY hour ASC
      `).all(),

      // Recent 5 events with live nickname from devices and AEST datetime
      env.DB.prepare(`
        SELECT
          COALESCE(NULLIF(d.friendly_name,''), NULLIF(e.friendly_name,''), d.platform, 'Unknown Device') AS name,
          e.auth_method,
          datetime(e.triggered_at, '+10 hours') AS triggered_at_aest,
          e.triggered_at
        FROM events e
        LEFT JOIN devices d ON e.device_token = d.device_token
        ORDER BY e.id DESC
        LIMIT 5
      `).all(),

      // Most active device all-time with live nickname from devices
      env.DB.prepare(`
        SELECT
          COALESCE(NULLIF(d.friendly_name,''), NULLIF(e.friendly_name,''), d.platform, 'Unknown Device') AS name,
          COUNT(*) AS count
        FROM events e
        LEFT JOIN devices d ON e.device_token = d.device_token
        GROUP BY e.device_token
        ORDER BY count DESC
        LIMIT 1
      `).first(),

    ]);

    const hours = Array.from({ length: 24 }, (_, i) => 0);
    for (const row of (hourly.results || [])) {
      if (row.hour >= 0 && row.hour < 24) hours[row.hour] = row.count;
    }

    const peakHour = hours.indexOf(Math.max(...hours));
    function fmtHour(h) {
      if (h === 0)  return "12 AM";
      if (h < 12)  return h + " AM";
      if (h === 12) return "12 PM";
      return (h - 12) + " PM";
    }

    return json({
      total_triggers:   totals ? totals.total_triggers   : 0,
      unique_devices:   totals ? totals.unique_devices   : 0,
      pin_count:        totals ? totals.pin_count         : 0,
      whitelist_count:  totals ? totals.whitelist_count   : 0,
      first_ever:       totals ? totals.first_ever        : null,
      last_trigger:     totals ? totals.last_trigger      : null,
      peak_hour:        peakHour,
      peak_hour_label:  fmtHour(peakHour) + " AEST",
      peak_hour_count:  hours[peakHour] || 0,
      hours,
      recent:           recent.results || [],
      top_device:       topDevice ? topDevice.name  : null,
      top_device_count: topDevice ? topDevice.count : 0,
      timezone:         "AEST"
    });

  } catch (err) {
    console.error("[stats]", err);
    return json({ error: "Stats query failed", detail: String(err) }, 500);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
