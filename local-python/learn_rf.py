import os
import sys
import time
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

def learn_rf():
    print("=" * 60)
    print("Broadlink RM4 Pro RF Remote Learning Tool")
    print("=" * 60)

    if not TARGET_IP:
        print("Searching for Broadlink RM4 Pro on network...")
        devices = broadlink.discover(timeout=5)
        if not devices:
            print("[X] No Broadlink device found. Run `python discover.py` first.")
            return
        dev = devices[0]
    else:
        print(f"Connecting to configured device at {TARGET_IP}...")
        dev = broadlink.hello(TARGET_IP)
        if not dev and TARGET_MAC:
            mac_clean = TARGET_MAC.replace(":", "").replace("-", "")
            mac_bytes = bytes.fromhex(mac_clean)
            dev = broadlink.rm4pro((TARGET_IP, 80), mac_bytes, 0x653c)

    try:
        dev.auth()
    except broadlink.exceptions.AuthenticationError:
        print("[X] Device is locked in BroadLink mobile app.")
        print("Go to BroadLink App -> Device Settings -> Turn OFF 'Lock device'.")
        return
    except Exception as e:
        print(f"[X] Authentication failed: {e}")
        return

    print(f"Connected to: {dev.model} @ {dev.host[0]}")
    print("\n--- STEP 1: RF Frequency Sweep ---")
    print(">> PRESS AND HOLD the garage door button on your physical remote now...")
    
    try:
        dev.sweep_frequency()
    except AttributeError:
        print("[X] This Broadlink model does not appear to support RF frequency sweep.")
        return

    found = False
    frequency = None
    for i in range(30):
        time.sleep(1)
        sys.stdout.write(f"\rScanning frequencies... [{i+1}/30s]")
        sys.stdout.flush()
        try:
            res = dev.check_frequency()
            if isinstance(res, tuple):
                is_found, freq = res
            else:
                is_found, freq = bool(res), None
            if is_found:
                found = True
                frequency = freq
                break
        except Exception:
            continue

    print("")
    if not found:
        dev.cancel_sweep_frequency()
        print("\n[X] Failed to detect RF frequency. Try holding remote closer (3-5 cm from RM4 Pro).")
        return

    freq_str = f" ({frequency:.2f} MHz)" if frequency else ""
    print(f"\n[OK] Frequency locked successfully!{freq_str}")
    print("\n--- STEP 2: Capture RF Code Packet ---")
    print(">> RELEASE the button, then CLICK the button repeatedly every second...")
    
    try:
        if frequency:
            dev.find_rf_packet(frequency)
        else:
            dev.find_rf_packet()
    except Exception as e:
        print(f"Warning initiating packet capture: {e}")
        dev.find_rf_packet()

    captured_data = None
    for i in range(30):
        time.sleep(1)
        sys.stdout.write(f"\rWaiting for button presses... [{i+1}/30s]")
        sys.stdout.flush()
        try:
            data = dev.check_data()
            if data:
                captured_data = data
                break
        except (broadlink.exceptions.ReadError, broadlink.exceptions.StorageError):
            # Normal: device buffer has not received a complete RF packet yet, keep waiting
            continue
        except Exception as e:
            # If another unexpected exception occurs, keep polling until timeout
            continue

    print("")
    if captured_data:
        hex_code = captured_data.hex()
        SAVED_FILE.write_text(hex_code, encoding="utf-8")
        print(f"\n[SUCCESS] Captured {len(captured_data)} bytes of RF data!")
        print(f"Saved to: {SAVED_FILE.name}")
        print("\nYou can now test it by running:")
        print("    python test_trigger.py")
    else:
        print("\n[X] Timed out waiting for RF packet. Please run `python learn_rf.py` again and click firmly.")

if __name__ == "__main__":
    learn_rf()
