import os
import sys
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import broadlink

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TARGET_IP = os.getenv("BROADLINK_IP")
TARGET_MAC = os.getenv("BROADLINK_MAC")
SAVED_FILE = BASE_DIR / "garage_rf_code.txt"

def test_trigger():
    if not SAVED_FILE.exists():
        print(f"[X] Error: {SAVED_FILE.name} does not exist. Run `python learn_rf.py` first.")
        return

    hex_data = SAVED_FILE.read_text().strip()
    if not hex_data:
        print("[X] Error: RF code file is empty.")
        return

    rf_bytes = bytes.fromhex(hex_data)

    if not TARGET_IP:
        devices = broadlink.discover(timeout=4)
        if not devices:
            print("[X] No Broadlink device discovered.")
            return
        dev = devices[0]
    else:
        dev = broadlink.hello(TARGET_IP)
        if not dev and TARGET_MAC:
            mac_clean = TARGET_MAC.replace(":", "").replace("-", "")
            mac_bytes = bytes.fromhex(mac_clean)
            dev = broadlink.rm4pro((TARGET_IP, 80), mac_bytes, 0x653c)

    dev.auth()
    print(f"Connecting to {dev.model} @ {dev.host[0]}...")
    print(">> Transmitting garage RF signal...")
    dev.send_data(rf_bytes)
    print("[OK] RF signal sent! Check if your garage door responded.")

if __name__ == "__main__":
    test_trigger()
