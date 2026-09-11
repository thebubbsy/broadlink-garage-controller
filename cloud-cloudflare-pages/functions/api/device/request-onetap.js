// POST /api/device/request-onetap
// A device that has already opened the door with the PIN asks the admin for
// PIN-less 1-tap access. A nickname is REQUIRED so the admin knows who is
// asking; it is saved as the device's friendly name (and back-filled into
// the event history). The admin approves/denies from the Admin console.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const token = body.device_token;
  if (!token || typeof token !== "string") return json({ error: "Missing device_token" }, 400);

  // Nickname is mandatory for a 1-tap request (same rules as /api/device/nickname)
  const nickname = (typeof body.nickname === "string" ? body.nickname : "").trim().substring(0, 24);
  if (nickname.length < 2) {
    return json({ error: "Please enter a nickname (at least 2 characters) so the admin knows who you are" }, 400);
  }
  if (/[<>"'\\]/.test(nickname)) {
    return json({ error: "Nickname contains invalid characters" }, 400);
  }

  const device = await env.DB.prepare(
    "SELECT is_whitelisted, has_opened_with_pin, is_blocked, one_tap_requested FROM devices WHERE device_token = ?"
  ).bind(token).first();

  if (!device) return json({ error: "Device not found — open the page first to register" }, 404);
  if (device.is_blocked) return json({ error: "This device is blocked" }, 403);
  if (device.is_whitelisted) return json({ status: "already_whitelisted", nickname });
  // Only devices that have proven they know the PIN may ask.
  if (!device.has_opened_with_pin) return json({ error: "Open the door with the PIN first" }, 403);

  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  await env.DB.prepare(
    "UPDATE devices SET friendly_name = ?, one_tap_requested = 1, one_tap_requested_at = COALESCE(NULLIF(one_tap_requested_at, ''), ?) WHERE device_token = ?"
  ).bind(nickname, now, token).run();
  await env.DB.prepare(
    "UPDATE events SET friendly_name = ? WHERE device_token = ?"
  ).bind(nickname, token).run();

  return json({ status: device.one_tap_requested ? "already_requested" : "requested", nickname });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
