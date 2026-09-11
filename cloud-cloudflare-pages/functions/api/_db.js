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

  // Condition 2: Platform Match
  if (storedDevice.platform && storedDevice.platform !== "Unknown Device") {
    if (storedDevice.platform !== platform) {
      return { valid: false, reason: `OS mismatch: expected ${storedDevice.platform}, got ${platform}` };
    }
  }

  // Condition 3: Browser Match
  if (storedDevice.browser && storedDevice.browser !== "Unknown Browser" && storedDevice.browser !== "Mobile Browser") {
    if (storedDevice.browser !== browser) {
      return { valid: false, reason: `Browser mismatch: expected ${storedDevice.browser}, got ${browser}` };
    }
  }

  // Condition 4: Hardware Geometry Match
  const storedHw = storedDevice.hardware_fingerprint;
  if (storedHw && currentHwFingerprint) {
    if (storedHw !== currentHwFingerprint) {
      return { valid: false, reason: "Hardware display signature mismatch" };
    }
  }

  return { valid: true, reason: "Signature verified (4/4 conditions met)" };
}
