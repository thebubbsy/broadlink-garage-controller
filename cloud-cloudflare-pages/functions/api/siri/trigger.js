// GET|POST /api/siri/trigger?key=<siri_key>
// Fires the garage door for the Apple Shortcuts / "Hey Siri" integration.
// Authenticates with the device's Siri key instead of the browser signature
// (Shortcuts is not a browser), but is otherwise identical to /api/trigger:
// the device must still be whitelisted and not blocked, the open is counted
// on the device and logged as an event (auth_method "siri") so stats, peak
// hours and the weekly leaderboard all include it, and the same webhook fires.
//
// Responds with plain text by default so a 2-action Shortcut
// ("Get Contents of URL" -> "Show Result") makes Siri speak the outcome.
// Add ?format=json for a JSON body.
import { logEvent, dispatchTriggerWebhook, nowUtc } from "../_db.js";

export async function onRequestGet(ctx)  { return handle(ctx); }
export async function onRequestPost(ctx) { return handle(ctx); }

async function handle({ request, env }) {
  const url = new URL(request.url);
  const wantsJson = url.searchParams.get("format") === "json";
  const reply = (status, message, extra) => {
    const headers = { "Cache-Control": "no-store" };
    if (wantsJson) {
      headers["Content-Type"] = "application/json";
      return new Response(JSON.stringify({ status: status < 400 ? "success" : "error", message, ...(extra || {}) }), { status, headers });
    }
    headers["Content-Type"] = "text/plain; charset=utf-8";
    return new Response(message, { status, headers });
  };

  if (!env.DB) return reply(503, "Garage server is not configured.");

  let key = url.searchParams.get("key") || "";
  if (!key && request.method === "POST") {
    try { key = (await request.json()).key || ""; } catch { /* ignore */ }
  }
  if (!key || typeof key !== "string" || key.length < 32) {
    return reply(403, "Siri access denied: missing key.");
  }

  const device = await env.DB.prepare(
    "SELECT device_token, friendly_name, is_whitelisted, is_blocked FROM devices WHERE siri_key = ? AND siri_key != ''"
  ).bind(key).first();

  if (!device) return reply(403, "Siri access denied: this key is no longer valid. Open the garage app to set up Siri again.");
  if (device.is_blocked) return reply(403, "Siri access denied: this device is blocked.");
  if (!device.is_whitelisted) return reply(403, "Siri access denied: 1-Tap access has been revoked for this device.");

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = nowUtc();

  await env.DB.prepare(
    "UPDATE devices SET open_count = open_count + 1, last_seen = ?, ip_address = ? WHERE device_token = ?"
  ).bind(now, ip, device.device_token).run();

  await logEvent(env, device.device_token, device.friendly_name || "", "siri", ip, now);
  await dispatchTriggerWebhook(env);

  return reply(200, "Garage door triggered.", { auth: "siri", device: device.friendly_name });
}
