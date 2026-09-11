# BroadLink RM4 Pro Smart Garage Door Controller

An open-source, mobile-friendly smart garage door controller designed for the **BroadLink RM4 Pro**. 

Provides secure, convenient 1-tap door access for family and trusted neighbors without requiring dedicated app installations or accounts, backed by a **4-factor cryptographic device verification gate** and an **interactive admin console**.

---

## 🌟 Why This Project?

Most smart garage solutions require expensive proprietary hardware, subscription fees, or forcing every family member and neighbor to download a clunky 150MB mobile app and create an account.

This project uses an affordable **BroadLink RM4 Pro** to capture and transmit the RF remote signal of your existing garage door motor, paired with a sleek, installable web PWA that works on any phone. 

To cater to different home setups, the project provides **two distinct, production-ready architectures**:

1. **Cloud Architecture (`cloud-cloudflare-pages/`)**:
   - 100% serverless on Cloudflare's free tier.
   - Hosted on **Cloudflare Pages** + **Cloudflare D1 SQL Database**.
   - Bridges to the RM4 Pro via Alexa Routine / Webhook.
   - **Zero home PC or server needs to be powered on 24/7**.

2. **Local Architecture (`local-python/`)**:
   - 100% self-hosted with zero external cloud dependencies.
   - Built on **Python (FastAPI)** + **SQLite**.
   - Directly controls the RM4 Pro via UDP sockets on your local 2.4GHz Wi-Fi network.
   - Can run on Windows, Linux, Raspberry Pi, or **an old repurposed Android smartphone (via Termux)**!

---

---

## 📸 Screenshots & UI Tour

<div align="center">

| Mobile Keypad & Weekly Leaderboard | Admin Device Console |
| :---: | :---: |
| <img src="docs/screenshots/01-keypad-main.png" width="320" alt="Mobile Keypad Interface" /> | <img src="docs/screenshots/02-admin-device-manager.png" width="320" alt="Admin Device Manager" /> |

### Live Usage Statistics & Peak Hour Analytics
<img src="docs/screenshots/03-stats-analytics-drawer.png" width="100%" alt="Live Statistics Drawer" />

</div>

---

## ⚖️ Architecture Comparison

| Feature | Cloud (`cloud-cloudflare-pages/`) | Local (`local-python/`) |
| :--- | :--- | :--- |
| **Hosting Platform** | Cloudflare Pages + D1 Database | FastAPI / Uvicorn + SQLite |
| **Home Hardware Required** | RM4 Pro only | RM4 Pro + Host (PC / Pi / Android) |
| **PC Powered On 24/7?** | ❌ **No** (Completely serverless) | ✅ Yes (or low-power Android / Pi) |
| **External Cloud Dependency** | Cloudflare + Alexa / Webhook | ❌ **Zero** (100% local LAN) |
| **4-Factor Device Verification** | ✅ Yes (D1 edge database) | ✅ Yes (SQLite database) |
| **Admin Whitelist & Nicknames** | ✅ Yes | ✅ Yes |
| **Weekly Top User Leaderboard** | ✅ Yes (Sunday 11:59 PM reset) | Optional |
| **Mobile PWA Support** | ✅ Yes | ✅ Yes |
| **Cost** | $0.00 / month (Cloudflare Free Tier) | $0.00 (Self-hosted) |

---

## 🛡️ Strict 4-Factor Security Gate

Both solutions feature an intelligent security gate that allows whitelisted devices to trigger the garage door with **1 tap** (no PIN required) while maintaining rock-solid defense against unauthorized access:

1. **Cryptographic Device Token**: A unique, high-entropy UUID stored in the client\'s persistent browser storage.
2. **Platform / OS Family**: Enforces matching operating system family (e.g., iOS vs Android vs Windows).
3. **Browser Engine Family**: Enforces matching browser engine signatures (Safari vs Chrome vs Firefox).
4. **Hardware Display Geometry**: Verifies display resolution, pixel ratio, and color depth fingerprint.

If an unapproved device attempts access, or if any of the 4 conditions mismatch, the gate drops back to requiring the master numeric PIN with automated delay against brute-force probing.

---

## 🏆 Key Features

- **PWA Mobile App**: Install to your iOS or Android home screen with a single tap. Features dark modern UI, responsive haptic feedback, and audio cues.
- **Master Admin Drawer**: Whitelist trusted neighbors, assign custom nicknames (e.g., "Dad", "Sarah\'s Phone"), or revoke access in real time.
- **Weekly Leaderboard**: Displays the top user of the week with access counts, resetting automatically every Sunday at 11:59 PM.
- **Usage Statistics**: Visualizes peak trigger times throughout the day and all-time access counts.
- **Automated RF Learning Tool**: Built-in CLI tool to sweep carrier frequencies and lock onto your physical remote\'s RF code packet.

---

## 📁 Repository Structure

```text
.
├── cloud-cloudflare-pages/     # Serverless Cloudflare Pages + D1 implementation
│   ├── functions/api/          # Edge API routes (verify, trigger, stats, weekly)
│   ├── public/                 # Client PWA (HTML, CSS, JS, manifest, icons)
│   ├── schema.sql              # D1 devices table schema
│   ├── schema_v2.sql           # D1 events & weekly stats schema
│   ├── wrangler.toml.example   # Example Cloudflare Wrangler config
│   └── README.md               # Detailed Cloudflare deployment instructions
│
├── local-python/               # Self-hosted FastAPI + BroadLink LAN implementation
│   ├── database.py             # SQLite device repository & 4-factor signature engine
│   ├── discover.py             # Automatic RM4 Pro LAN discovery script
│   ├── learn_rf.py             # Interactive RF frequency sweep and code grabber
│   ├── test_trigger.py         # Signal test utility
│   ├── server.py               # FastAPI web server and admin API
│   ├── garage_rf_service.py    # Background Windows Service daemon
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment template
│   └── README.md               # Detailed local, Windows service & Android guide
│
├── LICENSE                     # MIT License
└── README.md                   # Project overview & documentation
```

---

## 🚀 Getting Started

Choose the path that best suits your setup:

- **Want 24/7 cloud access with no PC or server turned on?**  
  👉 Follow the [Cloudflare Pages Deployment Guide](cloud-cloudflare-pages/README.md).

- **Want a 100% offline/local solution on a Raspberry Pi, Windows PC, or an old Android phone?**  
  👉 Follow the [Local Python Server Guide](local-python/README.md).

---

## ⚠️ Security Notice & Best Practices

- Always change the default `GARAGE_PIN` and `GARAGE_ADMIN_PIN` values before deploying.
- Never commit your captured `garage_rf_code.txt`, Cloudflare D1 UUIDs, or private webhook URLs to public repositories.
- Keep the admin PIN strictly restricted to household administrators.

---

## 📄 License

Distributed under the [MIT License](LICENSE).


