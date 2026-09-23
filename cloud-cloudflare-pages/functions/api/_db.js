// Cloudflare Pages D1 Database & Signature Verification Helper

export function parseDeviceTraits(userAgent) {
  const ua = (userAgent || "").toLowerCase();
  
  // Platform
  let platform = "Unknown Device";
  if (ua.includes("iphone")) platform = "iPhone (iOS)";
  else if (ua.includes("ipad")) platform = "iPad (iPadOS)";
  else if (ua.includes("android")) platform = "Android Phone";
  else if (ua.includes("macintosh") || ua.includes("mac os")) platform = "Mac";
  else if (ua.includes("windows")) platform = "Windows PC";
  else if (ua.includes("linux")) platform = "Linux";

  // Browser
  let browser = "Mobile Browser";
  if (ua.includes("crios") || ua.includes("chrome")) browser = "Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("firefox") || ua.includes("fxios")) browser = "Firefox";
  else if (ua.includes("edg")) browser = "Edge";

  return { platform, browser };
}

export function verifyDeviceSignature(storedDevice, currentUa, currentHwFingerprint) {
  const { platform, browser } = parseDeviceTraits(currentUa);

  // Evaluate every factor (no short-circuit) so the client can report "3 of 4 matched".
  // Condition 1 (token) is already satisfied by the caller having looked the device up.
  const checks = [
    { factor: "token", label: "Device token", ok: true },
  ];

  // Condition 2: Platform Match
  const platformEnforced = storedDevice.platform && storedDevice.platform !== "Unknown Device";
  checks.push({
    factor: "platform", label: "Operating system",
    ok: !platformEnforced || storedDevice.platform === platform,
    expected: storedDevice.platform, got: platform
  });

  // Condition 3: Browser Match
  const browserEnforced = storedDevice.browser && storedDevice.browser !== "Unknown Browser" && storedDevice.browser !== "Mobile Browser";
  checks.push({
    factor: "browser", label: "Browser",
    ok: !browserEnforced || storedDevice.browser === browser,
    expected: storedDevice.browser, got: browser
  });

  // Condition 4: Hardware Geometry Match
  const storedHw = storedDevice.hardware_fingerprint;
  const hwEnforced = Boolean(storedHw && currentHwFingerprint);
  checks.push({
    factor: "display", label: "Screen",
    ok: !hwEnforced || storedHw === currentHwFingerprint
  });

  const failed = checks.filter(c => !c.ok);
  const matched = checks.length - failed.length;

  if (failed.length === 0) {
    return { valid: true, reason: "Signature verified (4/4 conditions met)", matched, total: checks.length, failed: [], checks };
  }

  const reason = failed.map(c => {
    if (c.factor === "display") return "Screen changed (different resolution, scaling or colour depth)";
    return `${c.label} changed (expected ${c.expected}, got ${c.got})`;
  }).join("; ");

  return { valid: false, reason, matched, total: checks.length, failed: failed.map(c => c.factor), checks };
}

// Number of PIN-verified devices currently asking for 1-tap access.
export async function countPendingRequests(env) {
  if (!env.DB) return 0;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM devices WHERE one_tap_requested = 1 AND is_whitelisted = 0"
  ).first();
  return row ? (row.n || 0) : 0;
}

// ── Shared trigger plumbing (used by /api/trigger and /api/siri/trigger) ──
// Every door activation, whatever authenticated it, must go through logEvent so
// stats, peak hours and the weekly leaderboard count it.

export function nowUtc() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export async function logEvent(env, deviceToken, friendlyName, authMethod, ip, now) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO events (device_token, friendly_name, auth_method, ip_address, triggered_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(deviceToken, friendlyName, authMethod, ip, now).run();
  } catch (err) {
    console.error("[trigger] logEvent failed:", err);
  }
}

export async function dispatchTriggerWebhook(env) {
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

// 256-bit random key, hex encoded (64 chars). Safe to put in a URL.
export function generateSiriKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export function siriTriggerUrl(request, key) {
  const origin = new URL(request.url).origin;
  return `${origin}/api/siri/trigger?key=${key}`;
}

// ── Viewer authorization for the stats / leaderboard endpoints ──
// This app is on public infrastructure, and usage history reveals when the
// household comes and goes. Only verified (1-tap) devices and administrators
// may read it; everyone else gets 403 with no data.

export async function readViewerCredentials(request) {
  // Credentials travel in a POST body so device tokens and admin PINs never
  // land in a URL, an edge log or browser history.
  if (request.method !== "POST") return {};
  try {
    const body = await request.json();
    return { deviceToken: body.device_token, adminPin: body.admin_pin };
  } catch {
    return {};
  }
}

export async function authorizeViewer(env, credentials) {
  const { deviceToken, adminPin } = credentials || {};

  const configuredAdminPin = env.GARAGE_ADMIN_PIN || "0000";
  if (adminPin && adminPin === configuredAdminPin) {
    return { allowed: true, isAdmin: true };
  }

  if (!env.DB || !deviceToken || typeof deviceToken !== "string") {
    return { allowed: false, isAdmin: false };
  }

  const device = await env.DB.prepare(
    "SELECT is_whitelisted, is_admin, is_blocked FROM devices WHERE device_token = ?"
  ).bind(deviceToken).first();

  if (!device || device.is_blocked) return { allowed: false, isAdmin: false };

  return {
    allowed: Boolean(device.is_whitelisted || device.is_admin),
    isAdmin: Boolean(device.is_admin)
  };
}
