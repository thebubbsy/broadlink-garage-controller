import { countPendingRequests } from "../_db.js";

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

  // Anyone who unlocks the admin panel is an administrator: remember it on
  // their device so the home page can show them pending 1-tap requests.
  if (env.DB && body.device_token && typeof body.device_token === "string") {
    await env.DB.prepare("UPDATE devices SET is_admin = 1 WHERE device_token = ?")
      .bind(body.device_token).run();
  }

  return new Response(JSON.stringify({
    status: "authenticated",
    pending_requests: await countPendingRequests(env)
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
