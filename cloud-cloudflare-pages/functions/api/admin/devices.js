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
    ORDER BY is_whitelisted DESC, has_opened_with_pin DESC, last_seen DESC
  `).all();

  return new Response(JSON.stringify({ devices: results.results || [] }), {
    headers: { "Content-Type": "application/json" }
  });
}
