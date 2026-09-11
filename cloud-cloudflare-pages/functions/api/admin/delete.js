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

  await env.DB.prepare("DELETE FROM devices WHERE device_token = ?")
    .bind(body.device_token)
    .run();

  return new Response(JSON.stringify({ status: "success" }), {
    headers: { "Content-Type": "application/json" }
  });
}
