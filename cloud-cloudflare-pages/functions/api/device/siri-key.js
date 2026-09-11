// POST /api/device/siri-key   { device_token, action?: "ensure" | "regenerate" | "disable" }
// Issues (or manages) the per-device bearer key used by the "Hey Siri" Shortcut.
// Only whitelisted (1-tap) devices may hold a key; revoking 1-tap clears it.
import { generateSiriKey, siriTriggerUrl } from "../_db.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const token = body.device_token;
  if (!token || typeof token !== "string") return json({ error: "Missing device_token" }, 400);
  const action = ["ensure", "regenerate", "disable"].includes(body.action) ? body.action : "ensure";

  const device = await env.DB.prepare(
    "SELECT is_whitelisted, is_blocked, siri_key FROM devices WHERE device_token = ?"
  ).bind(token).first();

  if (!device) return json({ error: "Device not found — open the page first to register" }, 404);
  if (device.is_blocked) return json({ error: "This device is blocked" }, 403);

  if (action === "disable") {
    await env.DB.prepare("UPDATE devices SET siri_key = '' WHERE device_token = ?").bind(token).run();
    return json({ status: "disabled", siri_enabled: false });
  }

  if (!device.is_whitelisted) {
    return json({ error: "Siri access is only available for devices with 1-Tap access. Ask the admin to approve this device first." }, 403);
  }

  let key = device.siri_key || "";
  if (!key || action === "regenerate") {
    key = generateSiriKey();
    await env.DB.prepare("UPDATE devices SET siri_key = ? WHERE device_token = ?").bind(key, token).run();
  }

  return json({
    status: "ok",
    siri_enabled: true,
    siri_key: key,
    trigger_url: siriTriggerUrl(request, key),
    siri_shortcut_url: env.SIRI_SHORTCUT_URL || ""
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
