import os
import time
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
import broadlink
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import database

# Load environment variables
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
CORRECT_PIN = os.getenv("GARAGE_PIN", "1234")
GARAGE_ADMIN_PIN = os.getenv("GARAGE_ADMIN_PIN", "0000")
BROADLINK_IP = os.getenv("BROADLINK_IP", "")
BROADLINK_MAC = os.getenv("BROADLINK_MAC", "")
SAVED_RF_CODE_FILE = BASE_DIR / "garage_rf_code.txt"

def get_real_ip(request: Request) -> str:
    """Extract real client IP address from proxy headers."""
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Smart Garage Controller", version="2.5.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cached_device = None

def get_broadlink_device():
    """Initializes and authenticates connection to the Broadlink RM4 Pro."""
    global _cached_device
    if _cached_device is not None:
        try:
            return _cached_device
        except Exception:
            _cached_device = None

    target_ip = os.getenv("BROADLINK_IP", BROADLINK_IP)
    target_mac = os.getenv("BROADLINK_MAC", BROADLINK_MAC)

    if not target_ip:
        print("[Broadlink] No IP configured, attempting local LAN discovery...")
        devices = broadlink.discover(timeout=3)
        if not devices:
            raise RuntimeError(
                "No Broadlink device discovered on local network. Ensure RM4 Pro is powered and connected to 2.4GHz Wi-Fi."
            )
        dev = devices[0]
        print(f"[Broadlink] Discovered device: {dev.model} at {dev.host[0]}")
    else:
        if target_mac:
            mac_clean = target_mac.replace(":", "").replace("-", "")
            mac_bytes = bytes.fromhex(mac_clean)
        else:
            mac_bytes = b"\x00" * 6
        dev = broadlink.hello(target_ip)
        if not dev:
            dev = broadlink.rm4pro((target_ip, 80), mac_bytes, 0x653c)

    try:
        dev.auth()
    except broadlink.exceptions.AuthenticationError:
        raise RuntimeError(
            "Broadlink authentication rejected. Device is locked in BroadLink mobile app. "
            "Open BroadLink App -> Device Settings -> Toggle 'Lock device' OFF."
        )
    except Exception as e:
        raise RuntimeError(f"Authentication failed: {e}")

    _cached_device = dev
    return dev

# --- Models ---
class RegisterRequest(BaseModel):
    device_token: str
    hardware_fingerprint: Optional[str] = ""

class TriggerRequest(BaseModel):
    pin: Optional[str] = None
    device_token: Optional[str] = None
    hardware_fingerprint: Optional[str] = ""

class AdminAuthRequest(BaseModel):
    admin_pin: str
    device_token: Optional[str] = None

class OneTapRequest(BaseModel):
    device_token: str
    nickname: str = ""

class AdminWhitelistRequest(BaseModel):
    admin_pin: str
    device_token: str
    whitelisted: bool

class AdminRenameRequest(BaseModel):
    admin_pin: str
    device_token: str
    friendly_name: str

class AdminDeleteRequest(BaseModel):
    admin_pin: str
    device_token: str

# --- Static Routes & Icons ---
@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = BASE_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html not found")
    return index_path.read_text(encoding="utf-8")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    icon_path = BASE_DIR / "favicon.ico"
    if icon_path.exists():
        return FileResponse(icon_path, media_type="image/x-icon")
    return FileResponse(BASE_DIR / "apple-touch-icon.png", media_type="image/png")

@app.get("/manifest.json", include_in_schema=False)
async def manifest():
    return FileResponse(BASE_DIR / "manifest.json", media_type="application/json")

@app.get("/apple-touch-icon{suffix:path}.png", include_in_schema=False)
async def apple_touch_icon(suffix: str = ""):
    return FileResponse(BASE_DIR / "apple-touch-icon.png", media_type="image/png")

@app.get("/api/health")
async def health_check():
    has_code = SAVED_RF_CODE_FILE.exists() and len(SAVED_RF_CODE_FILE.read_text().strip()) > 0
    device_status = "unconfigured"
    try:
        dev = get_broadlink_device()
        device_status = f"connected ({dev.model} @ {dev.host[0]})"
    except Exception as err:
        device_status = f"offline ({err})"

    return {
        "status": "online",
        "has_rf_code": has_code,
        "device": device_status
    }

# --- Device Identification & Registration ---
@app.post("/api/device/register")
async def register_device(request: Request, body: RegisterRequest):
    ua = request.headers.get("user-agent", "")
    ip = get_real_ip(request)
    device_info = database.register_or_update_device(
        body.device_token, ua, ip, body.hardware_fingerprint or ""
    )
    return device_info

# --- 1-Tap Access Request ---
@app.post("/api/device/request-onetap")
async def request_one_tap(body: OneTapRequest):
    status, error = database.request_one_tap(body.device_token, body.nickname)
    if status == "error":
        msg = error or ""
        code = 404 if "not found" in msg else (400 if "ickname" in msg else 403)
        return JSONResponse(status_code=code, content={"error": error})
    return {"status": status, "nickname": body.nickname.strip()[:24]}

# --- Garage Trigger (PIN or Strict 4-Factor Whitelist) ---
@app.post("/api/trigger")
@limiter.limit("10/minute")
async def trigger_garage(request: Request, body: TriggerRequest):
    ip = get_real_ip(request)
    ua = request.headers.get("user-agent", "")

    if not SAVED_RF_CODE_FILE.exists():
        raise HTTPException(
            status_code=500,
            detail="Garage RF code has not been learned yet. Run python learn_rf.py on your machine."
        )

    hex_data = SAVED_RF_CODE_FILE.read_text(encoding="utf-8").strip()
    if not hex_data:
        raise HTTPException(status_code=500, detail="RF code file is empty.")

    # 1. Check if device claims whitelisted PIN-less authorization
    if body.device_token:
        device = database.get_device(body.device_token)
        if device and device["is_whitelisted"] and not device["is_blocked"]:
            # ENFORCE STRICT 4-FACTOR SIGNATURE GATE:
            # Condition 1: Cryptographic Token (Matched)
            # Condition 2: Platform Family (iPhone / Android / etc.)
            # Condition 3: Browser Family (Safari / Chrome / etc.)
            # Condition 4: Hardware Geometry & Traits Fingerprint
            verification = database.verify_device_signature(
                device, ua, body.hardware_fingerprint or ""
            )

            # Signature mismatch with a PIN supplied: skip 1-tap and fall through to
            # PIN validation below, which rebinds the signature on success.
            if not verification["valid"] and not body.pin:
                time.sleep(0.6)  # Defense against automated probing
                # Partial match: tell the client exactly which factor changed so it can
                # drop into re-verify mode. A correct PIN rebinds the signature below.
                return JSONResponse(status_code=403, content={
                    "detail": f"Security Alert: {verification['reason']}. Manual PIN verification required.",
                    "requires_pin": True,
                    "reason": verification["reason"],
                    "matched": verification["matched"],
                    "total": verification["total"],
                    "failed": verification["failed"],
                    "checks": verification["checks"],
                })

            # All 4 conditions satisfied!
            if verification["valid"]:
                try:
                    rf_bytes = bytes.fromhex(hex_data)
                    dev = get_broadlink_device()
                    dev.send_data(rf_bytes)
                    database.record_whitelist_success(body.device_token, ip)
                    return {
                        "status": "success",
                        "auth": "whitelisted_4factor",
                        "device": device["friendly_name"],
                        "conditions_met": "4 of 4 verified",
                        "message": "Door triggered via 4-Factor Verified Device."
                    }
                except Exception as e:
                    global _cached_device
                    _cached_device = None
                    raise HTTPException(status_code=500, detail=f"Broadlink error: {str(e)}")

    # 2. Check PIN if not whitelisted or if signature check failed
    if not body.pin:
        raise HTTPException(status_code=401, detail="PIN Required: Device signature not whitelisted.")

    if body.pin != CORRECT_PIN:
        time.sleep(0.8)  # Delay against brute-force timing
        raise HTTPException(status_code=401, detail="Access Denied: Incorrect PIN")

    # PIN correct! Transmit signal and record/bind signature
    try:
        rf_bytes = bytes.fromhex(hex_data)
        dev = get_broadlink_device()
        dev.send_data(rf_bytes)

        if body.device_token:
            database.register_or_update_device(
                body.device_token, ua, ip, body.hardware_fingerprint or ""
            )
            database.record_pin_success(
                body.device_token, ip, body.hardware_fingerprint or ""
            )

        return {
            "status": "success",
            "auth": "pin",
            "message": "Door triggered successfully with valid PIN."
        }
    except Exception as e:
        _cached_device = None
        raise HTTPException(status_code=500, detail=f"Broadlink dispatch failed: {str(e)}")

# --- Admin Endpoints ---
def verify_admin(pin: str):
    if pin != GARAGE_ADMIN_PIN:
        time.sleep(0.5)
        raise HTTPException(status_code=403, detail="Invalid Admin PIN")

@app.post("/api/admin/verify")
async def admin_verify(body: AdminAuthRequest):
    verify_admin(body.admin_pin)
    # Anyone who unlocks the admin panel is an administrator: remember it on
    # their device so the home page can show them pending 1-tap requests.
    if body.device_token:
        database.mark_admin(body.device_token)
    return {"status": "authenticated", "pending_requests": database.count_pending_requests()}

@app.get("/api/admin/devices")
async def admin_get_devices(admin_pin: str):
    verify_admin(admin_pin)
    devices = database.list_all_devices()
    pending = sum(1 for d in devices if d.get("one_tap_requested") and not d.get("is_whitelisted"))
    return {"devices": devices, "pending_requests": pending}

@app.post("/api/admin/whitelist")
async def admin_set_whitelist(body: AdminWhitelistRequest):
    verify_admin(body.admin_pin)
    database.set_whitelist_status(body.device_token, body.whitelisted)
    return {"status": "success", "whitelisted": body.whitelisted}

@app.post("/api/admin/rename")
async def admin_rename_device(body: AdminRenameRequest):
    verify_admin(body.admin_pin)
    database.set_device_name(body.device_token, body.friendly_name)
    return {"status": "success"}

@app.post("/api/admin/delete")
async def admin_delete_device(body: AdminDeleteRequest):
    verify_admin(body.admin_pin)
    database.delete_device(body.device_token)
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    print(f"Starting Smart Garage Server on http://localhost:{port}")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
