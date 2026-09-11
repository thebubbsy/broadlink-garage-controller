# Local Architecture: Python (FastAPI) + BroadLink LAN Control

A lightweight, self-hosted smart garage door controller powered by **Python**, **FastAPI**, and **SQLite**.

Communicates directly with your **BroadLink RM4 Pro** over local Wi-Fi UDP sockets, eliminating third-party cloud dependencies.

Can run on **Windows**, **Linux**, a **Raspberry Pi**, or even an **old Android smartphone** running Termux.

---

## 🏗️ Architecture Overview

```text
[Mobile PWA / Browser]
           │
           │ (LAN / Reverse Proxy / Cloudflare Tunnel)
           ▼
[FastAPI Python Server] (Port 8000)
    ├── SQLite Database (devices.db - 4-factor signatures & whitelist)
    ├── Rate Limiting & Admin Console
    └── BroadLink RM4 Pro Python Driver (broadlink)
           │
           │ (Direct UDP socket on local 2.4GHz Wi-Fi)
           ▼
[BroadLink RM4 Pro Hub]
           │
           │ (RF Signal: 315/433 MHz)
           ▼
[Physical Garage Door Motor]
```

---

## ✨ Features

- **Direct LAN Communication**: Millisecond response time with zero external cloud dependencies.
- **Automated RF Learning**: Interactive script sweeps radio frequencies, locks onto your physical garage remote's signal, and saves the binary packet.
- **4-Factor Device Verification Gate**:
  1. Cryptographic Device Token
  2. Operating System Family (iOS / Android / Windows / Linux / macOS)
  3. Browser Engine Family (Safari / Chrome / Firefox)
  4. Hardware Display Geometry Fingerprint
- **Admin Management Panel**: Whitelist devices, assign friendly names, view access logs, and delete stale devices.
- **Ultra Low Power Consumption**: Can run 24/7 on an unused spare Android phone drawing under 2 Watts.

---

## 🛠️ Hardware Requirements

1. **BroadLink RM4 Pro** (must be the Pro model which includes RF 315/433 MHz transmitter and IR).
2. **Physical Garage Door Remote Control** (fixed code or compatible multi-frequency remote).
3. **Host Device on the Same Local Wi-Fi Network**:
   - Spare Android phone (via Termux)
   - Raspberry Pi / Linux mini PC
   - Windows PC

> **Important Note on BroadLink Setup**:
> When setting up the RM4 Pro in the official BroadLink mobile app:
> 1. Complete the standard Wi-Fi onboarding.
> 2. Go to **Device Settings** in the BroadLink app.
> 3. Turn **OFF** the toggle for **"Lock device"**. (If locked, local third-party SDK connections will be rejected).

---

## 📦 Quickstart Installation

### 1. Set Up Python Environment

Python 3.9+ is recommended:

```bash
# Clone the repository and navigate to local-python
cd local-python

# Create a virtual environment (optional but recommended)
python -m venv venv

# Activate virtual environment
# On Windows:
.\venv\Scripts\activate
# On Linux / macOS / Android:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Discover RM4 Pro on Local Network

Ensure your computer/host is connected to the same Wi-Fi subnet as the BroadLink RM4 Pro:

```bash
python discover.py
```

This will discover the RM4 Pro, authenticate with it, and automatically generate your `.env` configuration with its IP and MAC address.

### 3. Learn RF Remote Signal

Run the interactive frequency sweep and packet capture tool:

```bash
python learn_rf.py
```

Follow the on-screen prompts:
1. **Step 1**: Press and hold your garage remote button until the RM4 Pro locks onto the RF carrier frequency.
2. **Step 2**: Release the button, then click the remote button repeatedly every second until the RF packet is captured.
3. The captured binary hex code is automatically saved to `garage_rf_code.txt`.

### 4. Test RF Transmission

Verify that your RM4 Pro can trigger your physical garage door:

```bash
python test_trigger.py
```

If your door activates, you are ready to start the web server!

### 5. Start the Web Server

```bash
python server.py
# Or on Windows PowerShell:
.\start.ps1
```

Access the web interface in your browser at `http://<your-host-ip>:8000`.

---

## 📱 Running on an Android Phone (Termux)

You can repurpose an old Android smartphone as a dedicated, silent, 24/7 smart garage server:

### 1. Install Termux
- Download and install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/) or GitHub Releases (do not use the deprecated Google Play version).

### 2. Prevent Android from Sleeping
Open Termux and run:
```bash
termux-wake-lock
```
Also go to Android Settings -> Apps -> Termux -> **Battery** -> set to **Unrestricted** (turn off battery optimization).

### 3. Install Python & Git
Inside Termux, run:
```bash
pkg update -y
pkg install -y python git clang
```

### 4. Clone & Set Up Project
```bash
git clone https://github.com/thebubbsy/broadlink-garage-controller.git
cd broadlink-garage-controller/local-python
pip install -r requirements.txt
```

### 5. Discover & Learn or Copy RF Code
- Run `python discover.py` to link to your BroadLink RM4 Pro on your home Wi-Fi.
- Either run `python learn_rf.py` or paste your pre-captured `garage_rf_code.txt`.
- Copy `.env.example` to `.env` and set your desired `GARAGE_PIN` and `GARAGE_ADMIN_PIN`.

### 6. Run Server in Background
```bash
nohup python server.py > server.log 2>&1 &
```
Find your Android phone\'s local IP address (Settings -> Wi-Fi or run `ip route` in Termux). You can now access your garage portal from any device on your Wi-Fi network at `http://<android-ip>:8000`!

*(Optional: Install `Termux:Boot` from F-Droid to automatically launch `server.py` whenever the phone reboots).*

---

## 🪟 Windows Background Service Setup

If running on a Windows PC or home server, you can install the standalone trigger daemon as a Windows Service that starts automatically on boot:

```powershell
# In an elevated PowerShell prompt (Run as Administrator):
python garage_rf_service.py install
python garage_rf_service.py start

# To stop or remove:
python garage_rf_service.py stop
python garage_rf_service.py remove
```

---

## 🐧 Linux / Raspberry Pi systemd Service

To run as a systemd service on Ubuntu, Debian, or Raspberry Pi OS:

Create `/etc/systemd/system/smart-garage.service`:

```ini
[Unit]
Description=Smart Garage Controller
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/broadlink-garage-controller/local-python
ExecStart=/home/pi/broadlink-garage-controller/local-python/venv/bin/python server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now smart-garage
```
