#!/usr/bin/env python3
"""
Change the garage PIN (or admin PIN) in one command.

    python change_pin.py              -> asks which PIN, then the new value
    python change_pin.py user
    python change_pin.py admin
    python change_pin.py admin 483920

Updates the value in .env (creating it from .env.example if missing) and
leaves every other setting untouched. The PIN is never echoed as you type.

Restart the server afterwards for it to take effect:
    python server.py          (or restart the service / systemd unit)
"""

import getpass
import re
import shutil
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"
ENV_EXAMPLE = BASE_DIR / ".env.example"
MAX_PIN = 32

WHICH = {
    "user": ("GARAGE_PIN", "user PIN (opens the door)"),
    "admin": ("GARAGE_ADMIN_PIN", "admin PIN (opens the admin console)"),
}


def validate(pin: str):
    if not pin.isdigit():
        return "PIN must be digits only."
    if not 1 <= len(pin) <= MAX_PIN:
        return f"PIN must be 1-{MAX_PIN} digits."
    return None


def set_env_value(key: str, value: str):
    """Rewrites just this key in .env, preserving comments, order and every other setting."""
    if not ENV_FILE.exists():
        if ENV_EXAMPLE.exists():
            shutil.copy(ENV_EXAMPLE, ENV_FILE)
            print(f"Created {ENV_FILE.name} from {ENV_EXAMPLE.name}.")
        else:
            ENV_FILE.write_text("", encoding="utf-8")

    lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=")
    replaced = False
    for i, line in enumerate(lines):
        if pattern.match(line):
            lines[i] = f"{key}={value}"
            replaced = True
            break
    if not replaced:
        lines.append(f"{key}={value}")

    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return replaced


def main():
    args = sys.argv[1:]

    which = args[0].lower() if args else ""
    if which not in WHICH:
        if which:
            print(f'Unknown option "{which}".')
        which = input('Which PIN? Type "user" or "admin": ').strip().lower()
        if which not in WHICH:
            print('Expected "user" or "admin".')
            return 1
    key, label = WHICH[which]

    pin = args[1] if len(args) > 1 else ""
    if not pin:
        pin = getpass.getpass(f"New {label}, 1-{MAX_PIN} digits: ").strip()
        again = getpass.getpass("Type it once more to confirm: ").strip()
        if pin != again:
            print("The two entries did not match. Nothing changed.")
            return 1

    problem = validate(pin)
    if problem:
        print(problem + " Nothing changed.")
        return 1

    set_env_value(key, pin)
    print(f"\nDone. {key} in {ENV_FILE.name} is now {len(pin)} digits.")
    print("Restart the server for it to take effect:  python server.py")
    print("The keypad will show that many dots the next time the page is loaded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
