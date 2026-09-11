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
