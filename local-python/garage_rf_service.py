"""
Smart Garage Windows Service
============================
Runs the FastAPI garage controller (server.py) as a Windows Service so it
starts automatically on boot and keeps running without a logged-in user.

This is a thin host around ``server.app``: the web UI, device whitelist and
BroadLink RF dispatch all live in server.py. Configuration comes from the
same ``.env`` file server.py uses (GARAGE_PIN, GARAGE_ADMIN_PIN,
BROADLINK_IP, BROADLINK_MAC, PORT).

Usage (elevated PowerShell, from the local-python directory):
  Install:   python garage_rf_service.py install
  Start:     python garage_rf_service.py start
  Stop:      python garage_rf_service.py stop
  Remove:    python garage_rf_service.py remove
  Debug:     python garage_rf_service.py debug   (runs in the foreground)

Requires pywin32 (installed via requirements.txt on Windows). If the service
fails to start with "module not found", run once as Administrator:
  python -m pywin32_postinstall -install

Logs are written to garage_service.log next to this file.
"""

import logging
import os
import sys
import threading
from pathlib import Path

# Services launch from C:\Windows\System32 with a bare sys.path, so make the
# project directory importable and resolve every file relative to it.
BASE_DIR = Path(__file__).resolve().parent
os.chdir(BASE_DIR)
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

import uvicorn

# Windows service support
import servicemanager
import win32event
import win32service
import win32serviceutil

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
LOG_FILE = BASE_DIR / "garage_service.log"

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("GarageService")


def build_server() -> uvicorn.Server:
    """Creates a uvicorn server for server.app that can be stopped programmatically."""
    import server  # imported lazily so import errors land in the log, not the SCM

    config = uvicorn.Config(
        server.app,
        host=HOST,
        port=PORT,
        log_config=None,   # keep uvicorn on the root logger -> garage_service.log
        reload=False,      # never hot-reload inside a service
    )
    return uvicorn.Server(config)


def run_server(stop_event: threading.Event):
    """Runs uvicorn on a worker thread and shuts it down when stop_event is set."""
    try:
        srv = build_server()
    except Exception:
        logger.exception("Failed to initialise server.app")
        return

    logger.info("Serving Smart Garage Controller on http://%s:%d", HOST, PORT)

    def watch_for_stop():
        stop_event.wait()
        srv.should_exit = True

    threading.Thread(target=watch_for_stop, daemon=True).start()

    try:
        srv.run()
    except Exception:
        logger.exception("Server crashed")
    finally:
        logger.info("Server stopped.")


class GarageService(win32serviceutil.ServiceFramework):
    _svc_name_ = "GarageRFService"
    _svc_display_name_ = "Smart Garage Controller"
    _svc_description_ = "Hosts the Smart Garage web app (FastAPI) and fires the BroadLink RM4 Pro RF signal."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self._stop_event = threading.Event()

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        logger.info("Stop requested.")
        self._stop_event.set()
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        logger.info("GarageService starting.")
        worker = threading.Thread(target=run_server, args=(self._stop_event,), daemon=True)
        worker.start()
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
        worker.join(timeout=10)
        logger.info("GarageService ended.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "debug":
        # Foreground mode: also echo the log to the console.
        logging.getLogger().addHandler(logging.StreamHandler(sys.stdout))
        print(f"DEBUG: serving on http://{HOST}:{PORT}  (Ctrl+C to stop)")
        stop = threading.Event()
        try:
            run_server(stop)
        except KeyboardInterrupt:
            stop.set()
    else:
        win32serviceutil.HandleCommandLine(GarageService)
