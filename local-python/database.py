import sqlite3
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

DB_FILE = Path(__file__).resolve().parent / "devices.db"

def get_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the SQLite database table and performs automatic migrations."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_token TEXT UNIQUE NOT NULL,
                friendly_name TEXT DEFAULT '',
                platform TEXT DEFAULT 'Unknown',
                browser TEXT DEFAULT 'Unknown',
                hardware_fingerprint TEXT DEFAULT '',
                user_agent TEXT DEFAULT '',
                ip_address TEXT DEFAULT '',
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                has_opened_with_pin INTEGER DEFAULT 0,
                is_whitelisted INTEGER DEFAULT 0,
                open_count INTEGER DEFAULT 0,
                is_blocked INTEGER DEFAULT 0
            )
        """)
        conn.commit()

        # Migration: ensure hardware_fingerprint column exists if table was created previously
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(devices)")
        columns = [row["name"] for row in cursor.fetchall()]
        if "hardware_fingerprint" not in columns:
            cursor.execute("ALTER TABLE devices ADD COLUMN hardware_fingerprint TEXT DEFAULT ''")
            conn.commit()

def parse_device_traits(user_agent: str) -> Tuple[str, str]:
    """Extract friendly platform and browser names from User-Agent."""
    ua = user_agent.lower()
    
    # 1. Platform
    if "iphone" in ua:
        platform = "iPhone (iOS)"
    elif "ipad" in ua:
        platform = "iPad (iPadOS)"
    elif "android" in ua:
        platform = "Android Phone"
    elif "macintosh" in ua or "mac os" in ua:
        platform = "Mac"
    elif "windows" in ua:
        platform = "Windows PC"
    elif "linux" in ua:
        platform = "Linux"
    else:
        platform = "Unknown Device"

    # 2. Browser
    if "crios" in ua or "chrome" in ua:
        browser = "Chrome"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"
    elif "firefox" in ua or "fxios" in ua:
        browser = "Firefox"
    elif "edg" in ua:
        browser = "Edge"
    else:
        browser = "Mobile Browser"

    return platform, browser

def verify_device_signature(
    stored_device: Dict[str, Any], 
    current_ua: str, 
    current_hw_fingerprint: str
) -> Dict[str, Any]:
    """
    Validates the 4 strict conditions and reports every factor (no short-circuit)
    so the client can tell the user "3 of 4 checks matched":
    1. Cryptographic Token (matched by caller)
    2. Platform / OS Family
    3. Browser Engine Family
    4. Hardware Geometry Fingerprint

    Returns a dict: valid, reason, matched, total, failed, checks.
    """
    current_platform, current_browser = parse_device_traits(current_ua)

    checks: List[Dict[str, Any]] = [
        {"factor": "token", "label": "Device token", "ok": True},
    ]

    # Condition 2: Platform Match
    stored_platform = stored_device.get("platform")
    platform_enforced = bool(stored_platform and stored_platform != "Unknown Device")
    checks.append({
        "factor": "platform", "label": "Operating system",
        "ok": (not platform_enforced) or stored_platform == current_platform,
        "expected": stored_platform, "got": current_platform,
    })

    # Condition 3: Browser Match
    stored_browser = stored_device.get("browser")
    browser_enforced = bool(stored_browser and stored_browser != "Unknown Browser")
    checks.append({
        "factor": "browser", "label": "Browser",
        "ok": (not browser_enforced) or stored_browser == current_browser,
        "expected": stored_browser, "got": current_browser,
    })

    # Condition 4: Hardware Geometry Match
    stored_hw = stored_device.get("hardware_fingerprint")
    hw_enforced = bool(stored_hw and current_hw_fingerprint)
    checks.append({
        "factor": "display", "label": "Screen",
        "ok": (not hw_enforced) or stored_hw == current_hw_fingerprint,
    })

    failed = [c for c in checks if not c["ok"]]
    matched = len(checks) - len(failed)

    if not failed:
        return {
            "valid": True,
            "reason": "Signature verified (4/4 conditions met)",
            "matched": matched, "total": len(checks), "failed": [], "checks": checks,
        }

    def describe(c: Dict[str, Any]) -> str:
        if c["factor"] == "display":
            return "Screen changed (different resolution, scaling or colour depth)"
        return f"{c['label']} changed (expected {c['expected']}, got {c['got']})"

    return {
        "valid": False,
        "reason": "; ".join(describe(c) for c in failed),
        "matched": matched, "total": len(checks),
        "failed": [c["factor"] for c in failed], "checks": checks,
    }

def register_or_update_device(
    device_token: str, 
    user_agent: str, 
    ip_address: str, 
    hardware_fingerprint: str = ""
) -> Dict[str, Any]:
    """Registers a new device or updates last seen metadata and hardware signature."""
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    platform, browser = parse_device_traits(user_agent)

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM devices WHERE device_token = ?", (device_token,))
        row = cursor.fetchone()

        if row is None:
            cursor.execute("""
                INSERT INTO devices (
                    device_token, friendly_name, platform, browser, 
                    hardware_fingerprint, user_agent, ip_address, 
                    first_seen, last_seen, has_opened_with_pin, 
                    is_whitelisted, open_count, is_blocked
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
            """, (
                device_token, f"{platform} ({browser})", platform, browser, 
                hardware_fingerprint, user_agent, ip_address, now_str, now_str
            ))
            conn.commit()
            return {
                "device_token": device_token,
                "friendly_name": f"{platform} ({browser})",
                "platform": platform,
                "browser": browser,
                "hardware_fingerprint": hardware_fingerprint,
                "is_whitelisted": False,
                "has_opened_with_pin": False,
                "is_blocked": False
            }
        else:
            # If hardware fingerprint was missing, update it
            hw = hardware_fingerprint or row["hardware_fingerprint"]
            cursor.execute("""
                UPDATE devices 
                SET last_seen = ?, ip_address = ?, user_agent = ?, platform = ?, browser = ?, hardware_fingerprint = ?
                WHERE device_token = ?
            """, (now_str, ip_address, user_agent, platform, browser, hw, device_token))
            conn.commit()
            return {
                "device_token": row["device_token"],
                "friendly_name": row["friendly_name"] or f"{platform} ({browser})",
                "platform": platform,
                "browser": browser,
                "hardware_fingerprint": hw,
                "is_whitelisted": bool(row["is_whitelisted"]),
                "has_opened_with_pin": bool(row["has_opened_with_pin"]),
                "is_blocked": bool(row["is_blocked"])
            }

def record_pin_success(device_token: str, ip_address: str, hardware_fingerprint: str = ""):
    """Records that a device successfully entered the PIN and opened the garage, binding signature."""
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        if hardware_fingerprint:
            conn.execute("""
                UPDATE devices 
                SET has_opened_with_pin = 1, 
                    open_count = open_count + 1, 
                    last_seen = ?,
                    ip_address = ?,
                    hardware_fingerprint = ?
                WHERE device_token = ?
            """, (now_str, ip_address, hardware_fingerprint, device_token))
        else:
            conn.execute("""
                UPDATE devices 
                SET has_opened_with_pin = 1, 
                    open_count = open_count + 1, 
                    last_seen = ?,
                    ip_address = ?
                WHERE device_token = ?
            """, (now_str, ip_address, device_token))
        conn.commit()

def record_whitelist_success(device_token: str, ip_address: str):
    """Records that a verified whitelisted device opened the garage."""
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        conn.execute("""
            UPDATE devices 
            SET open_count = open_count + 1, 
                last_seen = ?,
                ip_address = ?
            WHERE device_token = ?
        """, (now_str, ip_address, device_token))
        conn.commit()

def get_device(device_token: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM devices WHERE device_token = ?", (device_token,))
        row = cursor.fetchone()
        return dict(row) if row else None

def list_all_devices() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM devices ORDER BY is_whitelisted DESC, has_opened_with_pin DESC, last_seen DESC")
        return [dict(row) for row in cursor.fetchall()]

def set_whitelist_status(device_token: str, is_whitelisted: bool):
    with get_connection() as conn:
        conn.execute("UPDATE devices SET is_whitelisted = ? WHERE device_token = ?", (1 if is_whitelisted else 0, device_token))
        conn.commit()

def set_device_name(device_token: str, friendly_name: str):
    with get_connection() as conn:
        conn.execute("UPDATE devices SET friendly_name = ? WHERE device_token = ?", (friendly_name.strip(), device_token))
        conn.commit()

def delete_device(device_token: str):
    with get_connection() as conn:
        conn.execute("DELETE FROM devices WHERE device_token = ?", (device_token,))
        conn.commit()

init_db()
