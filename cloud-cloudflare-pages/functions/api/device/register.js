import { parseDeviceTraits, countPendingRequests } from "../_db.js";

export async function onRequestPost({ request, env }) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const ua = request.headers.get("user-agent") || "";
    let body = {};
    
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    const token = body.device_token;
    const hw = body.hardware_fingerprint || "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing device_token" }), { status: 400 });
    }

    const { platform, browser } = parseDeviceTraits(ua);
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);

    if (!env.DB) {
      return new Response(JSON.stringify({
        device_token: token,
        friendly_name: `${platform} (${browser})`,
        platform,
        browser,
        hardware_fingerprint: hw,
        is_whitelisted: false,
        has_opened_with_pin: false
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Check if exists
    const existing = await env.DB.prepare("SELECT * FROM devices WHERE device_token = ?").bind(token).first();

    if (!existing) {
      const friendly = `${platform} (${browser})`;
      await env.DB.prepare(`
        INSERT INTO devices (
          device_token, friendly_name, platform, browser, hardware_fingerprint,
          user_agent, ip_address, first_seen, last_seen, has_opened_with_pin,
          is_whitelisted, open_count, is_blocked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
      `).bind(token, friendly, platform, browser, hw, ua, ip, now, now).run();

      return new Response(JSON.stringify({
        device_token: token,
        friendly_name: friendly,
        platform,
        browser,
        hardware_fingerprint: hw,
        is_whitelisted: false,
        has_opened_with_pin: false
      }), { headers: { "Content-Type": "application/json" } });
    } else {
      const updatedHw = hw || existing.hardware_fingerprint;
      await env.DB.prepare(`
        UPDATE devices 
        SET last_seen = ?, ip_address = ?, user_agent = ?, platform = ?, browser = ?, hardware_fingerprint = ?
        WHERE device_token = ?
      `).bind(now, ip, ua, platform, browser, updatedHw, token).run();

      const isAdmin = Boolean(existing.is_admin);
      return new Response(JSON.stringify({
        device_token: existing.device_token,
        friendly_name: existing.friendly_name || `${platform} (${browser})`,
        platform,
        browser,
        hardware_fingerprint: updatedHw,
        is_whitelisted: Boolean(existing.is_whitelisted),
        has_opened_with_pin: Boolean(existing.has_opened_with_pin),
        is_blocked: Boolean(existing.is_blocked),
        one_tap_requested: Boolean(existing.one_tap_requested),
        is_admin: isAdmin,
        // Only admins get the call-to-action count
        pending_requests: isAdmin ? await countPendingRequests(env) : 0,
        siri_enabled: Boolean(existing.siri_key),
        // Optional iCloud-shared Shortcut link (set SIRI_SHORTCUT_URL in Pages env vars)
        siri_shortcut_url: env.SIRI_SHORTCUT_URL || ""
      }), { headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      stack: err.stack
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
