export async function onRequestPost({ request, env }) {
  const adminPin = env.GARAGE_ADMIN_PIN || "0000";
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ detail: "Invalid JSON" }), { status: 400 });
  }

  if (body.admin_pin !== adminPin) {
    return new Response(JSON.stringify({ detail: "Invalid Admin PIN" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
  }

  // Approving or denying either way resolves any outstanding 1-tap request.
  await env.DB.prepare("UPDATE devices SET is_whitelisted = ?, one_tap_requested = 0 WHERE device_token = ?")
    .bind(body.whitelisted ? 1 : 0, body.device_token)
    .run();

  return new Response(JSON.stringify({ status: "success", whitelisted: body.whitelisted }), {
    headers: { "Content-Type": "application/json" }
  });
}
