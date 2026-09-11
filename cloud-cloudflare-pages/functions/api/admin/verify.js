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

  return new Response(JSON.stringify({ status: "authenticated" }), {
    headers: { "Content-Type": "application/json" }
  });
}
