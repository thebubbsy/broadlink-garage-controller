export async function onRequestGet({ request, env }) {
  const adminPin = env.GARAGE_ADMIN_PIN || "0000";
  const url = new URL(request.url);
  const pin = url.searchParams.get("admin_pin");

  if (pin !== adminPin) {
    return new Response(JSON.stringify({ detail: "Invalid Admin PIN" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ devices: [] }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const results = await env.DB.prepare(`
    SELECT * FROM devices
    ORDER BY (one_tap_requested = 1 AND is_whitelisted = 0) DESC, is_whitelisted DESC, has_opened_with_pin DESC, last_seen DESC
  `).all();

  // Expose whether a Siri key exists, never the key itself.
  const devices = (results.results || []).map(d => {
    const { siri_key, ...rest } = d;
    return { ...rest, siri_enabled: Boolean(siri_key) };
  });
  const pending = devices.filter(d => d.one_tap_requested && !d.is_whitelisted).length;

  return new Response(JSON.stringify({ devices, pending_requests: pending }), {
    headers: { "Content-Type": "application/json" }
  });
}
