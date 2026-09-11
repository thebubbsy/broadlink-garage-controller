import sys
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import broadlink

def discover():
    print("=" * 60)
    print("Broadlink RM4 Pro LAN Discovery")
    print("=" * 60)
    print("Scanning local 2.4GHz network for Broadlink devices...")

    try:
        devices = broadlink.discover(timeout=5)
    except Exception as e:
        print(f"Error during discovery: {e}")
        return

    if not devices:
        print("\n[!] No Broadlink devices found.")
        print("Checklist:")
        print("  1. Is the Broadlink RM4 Pro powered on and blue LED ready?")
        print("  2. Is this host connected to the same Wi-Fi subnet/router as the RM4 Pro?")
        print("  3. Does your router have AP/Client isolation turned on? (Turn it off).")
        return

    print(f"\n[OK] Found {len(devices)} device(s):")
    for i, dev in enumerate(devices):
        mac_str = ":".join(f"{b:02x}" for b in dev.mac)
        print(f"\n[{i+1}] Model: {dev.model} (Type: {hex(dev.devtype)})")
        print(f"    IP Address:  {dev.host[0]}")
        print(f"    MAC Address: {mac_str}")

        # Test auth
        try:
            dev.auth()
            print("    Status:      Unlocked & Authenticated Successfully! [OK]")
        except broadlink.exceptions.AuthenticationError:
            print("    Status:      LOCKED! Open BroadLink App -> Device Settings -> Unlock Device.")
        except Exception as err:
            print(f"    Status:      Auth check note: {err}")

    target = devices[0]
    mac_str = ":".join(f"{b:02x}" for b in target.mac)
    env_path = Path(__file__).resolve().parent / ".env"
    
    content = f"""# Garage Controller Environment Config
GARAGE_PIN=1234
GARAGE_ADMIN_PIN=0000
BROADLINK_IP={target.host[0]}
BROADLINK_MAC={mac_str}
PORT=8000
"""
    env_path.write_text(content, encoding="utf-8")
    print(f"\nSaved primary device to {env_path.name}!")

if __name__ == "__main__":
    discover()
