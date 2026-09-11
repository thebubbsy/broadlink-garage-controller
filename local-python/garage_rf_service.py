"""
Smart Garage RF Service
=======================
A Windows service that listens for HTTP trigger requests and fires the
BroadLink RM4 Pro RF signal to open/close the garage door.

Architecture:
  Web Interface (auth) -> Tunnel/LAN -> localhost:8765 -> RF

Usage:
  Install:   python garage_rf_service.py install
  Start:     python garage_rf_service.py start
  Stop:      python garage_rf_service.py stop
  Remove:    python garage_rf_service.py remove
  Debug:     python garage_rf_service.py debug   (runs in foreground)
"""

import os
import sys
import time
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import logging
from dotenv import load_dotenv
import broadlink

# Windows service support
import win32serviceutil
import win32service
import win32event
import servicemanager

# Configuration
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SERVICE_PORT  = int(os.getenv("GARAGE_SERVICE_PORT", "8765"))
SERVICE_TOKEN = os.getenv("GARAGE_SERVICE_TOKEN", "change-this-secret-token")
BROADLINK_IP  = os.getenv("BROADLINK_IP", "192.168.1.50")
BROADLINK_MAC = os.getenv("BROADLINK_MAC", "34:ea:34:00:00:00")
RF_CODE_FILE  = BASE_DIR / "garage_rf_code.txt"
LOG_FILE      = BASE_DIR / "garage_service.log"

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("GarageRFService")


def load_rf_code() -> bytes:
    hex_str = RF_CODE_FILE.read_text().strip()
    return bytes.fromhex(hex_str)


def fire_rf(repeat: int = 3) -> bool:
    try:
        mac_bytes = bytes.fromhex(BROADLINK_MAC.replace(":", ""))
        dev = broadlink.rm4pro(host=(BROADLINK_IP, 80), mac=mac_bytes, devtype=0x6539)
        dev.auth()
        rf_data = load_rf_code()
        for _ in range(repeat):
            dev.send_data(rf_data)
            time.sleep(0.15)
        logger.info("RF signal fired successfully (x%d)", repeat)
        return True
    except Exception as exc:
        logger.error("RF fire failed: %s", exc)
        return False


class TriggerHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logger.debug("HTTP: " + format % args)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/trigger":
            self._respond(404, '{"status":"not_found"}')
            return

        params = parse_qs(parsed.query)
        token = params.get("token", [None])[0]

        expected = SERVICE_TOKEN.encode()
        provided = (token or "").encode()
        if len(expected) != len(provided) or not all(a == b for a, b in zip(expected, provided)):
            logger.warning("Unauthorised trigger from %s", self.client_address[0])
            self._respond(401, '{"status":"unauthorized"}')
            return

        logger.info("Trigger from %s", self.client_address[0])
        ok = fire_rf()
        if ok:
            self._respond(200, '{"status":"ok","message":"RF fired"}')
        else:
            self._respond(500, '{"status":"error","message":"RF failed - check log"}')

    def _respond(self, code, body):
        b = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b)


def run_http_server(stop_event):
    server = HTTPServer(("127.0.0.1", SERVICE_PORT), TriggerHandler)
    server.timeout = 1.0
    logger.info("Listening on 127.0.0.1:%d", SERVICE_PORT)
    while not stop_event.is_set():
        server.handle_request()
    server.server_close()
    logger.info("Server stopped.")


class GarageRFService(win32serviceutil.ServiceFramework):
    _svc_name_         = "GarageRFService"
    _svc_display_name_ = "Smart Garage RF Service"
    _svc_description_  = "Fires BroadLink RM4 Pro RF via HTTP trigger. Part of smart garage system."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop   = win32event.CreateEvent(None, 0, 0, None)
        self._stop_event = threading.Event()

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        logger.info("Stop requested.")
        self._stop_event.set()
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED, (self._svc_name_, ""))
        logger.info("GarageRFService started.")
        t = threading.Thread(target=run_http_server, args=(self._stop_event,), daemon=True)
        t.start()
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
        t.join(timeout=5)
        logger.info("GarageRFService ended.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "debug":
        print(f"DEBUG: 127.0.0.1:{SERVICE_PORT}  token={SERVICE_TOKEN}")
        stop = threading.Event()
        try:
            run_http_server(stop)
        except KeyboardInterrupt:
            stop.set()
    else:
        win32serviceutil.HandleCommandLine(GarageRFService)
