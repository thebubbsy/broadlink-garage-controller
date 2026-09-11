// POST /api/device/nickname
// Lets a user set their own friendly nickname for their device.
// Updates both devices table and existing events table history.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { device_token, nickname } = body;

  if (!device_token || typeof device_token !== "string") {
    return json({ error: "Missing device_token" }, 400);
  }

  // Validate nickname
  const trimmed = (nickname || "").trim().substring(0, 24);
  if (trimmed.length < 1) {
    return json({ error: "Nickname must be at least 1 character" }, 400);
  }

  // Reject control characters and obvious injection attempts
  if (/[<>"'\\]/.test(trimmed)) {
    return json({ error: "Nickname contains invalid characters" }, 400);
  }

  try {
    const existing = await env.DB.prepare(
      "SELECT id FROM devices WHERE device_token = ?"
    ).bind(device_token).first();

    if (!existing) {
      return json({ error: "Device not found — open the page first to register" }, 404);
    }

    // Update current device nickname
    await env.DB.prepare(
      "UPDATE devices SET friendly_name = ? WHERE device_token = ?"
    ).bind(trimmed, device_token).run();

    // Also update events history so all analytics reflect the new nickname
    await env.DB.prepare(
      "UPDATE events SET friendly_name = ? WHERE device_token = ?"
    ).bind(trimmed, device_token).run();

    return json({ status: "ok", nickname: trimmed });
  } catch (err) {
    console.error("[nickname]", err);
    return json({ error: "Database error", detail: String(err) }, 500);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
