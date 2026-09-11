import { verifyDeviceSignature } from "./_db.js";

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "";
  let body = {};

  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ detail: "Invalid JSON body" }), { status: 400 });
  }

  const correctPin = env.GARAGE_PIN || "1234";
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);

  // 1. Whitelisted device check
  if (body.device_token && env.DB) {
    const device = await env.DB.prepare(
      "SELECT * FROM devices WHERE device_token = ?"
    ).bind(body.device_token).first();

    if (device && device.is_whitelisted && !device.is_blocked) {
      const verification = verifyDeviceSignature(device, ua, body.hardware_fingerprint || "");
      if (!verification.valid) {
        return new Response(JSON.stringify({
          detail: "Security Check: " + verification.reason + ". PIN required."
        }), { status: 403, headers: { "Content-Type": "application/json" } });
      }

      await env.DB.prepare(
        "UPDATE devices SET open_count = open_count + 1, last_seen = ?, ip_address = ? WHERE device_token = ?"
      ).bind(now, ip, body.device_token).run();

      await logEvent(env, body.device_token, device.friendly_name || "", "whitelisted_4factor", ip, now);
      await dispatchTriggerWebhook(env);

      return new Response(JSON.stringify({
        status: "success",
        auth: "whitelisted_4factor",
        device: device.friendly_name,
        message: "Door triggered via 4-Factor Verified Device."
      }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // 2. PIN validation
  if (!body.pin) {
    return new Response(JSON.stringify({ detail: "PIN Required: Device is not whitelisted." }), {
      status: 401, headers: { "Content-Type": "application/json" }
    });
  }
  if (body.pin !== correctPin) {
    return new Response(JSON.stringify({ detail: "Access Denied: Incorrect PIN" }), {
      status: 401, headers: { "Content-Type": "application/json" }
    });
  }

  // PIN valid
  let friendlyName = "";
  if (body.device_token && env.DB) {
    const existing = await env.DB.prepare(
      "SELECT friendly_name FROM devices WHERE device_token = ?"
    ).bind(body.device_token).first();
    friendlyName = existing ? (existing.friendly_name || "") : "";

    await env.DB.prepare(`
      UPDATE devices
      SET has_opened_with_pin = 1, open_count = open_count + 1,
          last_seen = ?, ip_address = ?,
          hardware_fingerprint = COALESCE(NULLIF(?, ''), hardware_fingerprint)
      WHERE device_token = ?
    `).bind(now, ip, body.hardware_fingerprint || "", body.device_token).run();
  }

  await logEvent(env, body.device_token || "", friendlyName, "pin", ip, now);
  await dispatchTriggerWebhook(env);

  return new Response(JSON.stringify({
    status: "success", auth: "pin",
    message: "Door triggered successfully with valid PIN."
  }), { headers: { "Content-Type": "application/json" } });
}

async function logEvent(env, deviceToken, friendlyName, authMethod, ip, now) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO events (device_token, friendly_name, auth_method, ip_address, triggered_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(deviceToken, friendlyName, authMethod, ip, now).run();
  } catch (err) {
    console.error("[trigger] logEvent failed:", err);
  }
}

async function dispatchTriggerWebhook(env) {
  const webhookUrl = env.GARAGE_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: "GET",
      headers: { "User-Agent": "SmartGarageController/1.0" }
    });
    console.log("[webhook] status " + res.status);
  } catch (err) {
    console.error("[webhook] failed: " + err);
  }
}
