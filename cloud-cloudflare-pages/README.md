# Cloud Architecture: Cloudflare Pages + D1 + BroadLink Cloud / Alexa

A 100% serverless, zero-maintenance smart garage door controller hosted on **Cloudflare Pages** with an edge **Cloudflare D1 SQL database**.

This setup allows you to control your garage door 24/7 with **zero local servers or home PCs turned on**.

---

## 🏗️ Architecture Overview

```text
[Mobile PWA / Web Browser]
           │
           │ (HTTPS + 4-Factor Device Verification)
           ▼
[Cloudflare Pages Edge Network]
           │
      ┌────┴───────────────────────────┐
      ▼                                ▼
[Cloudflare D1 Database]    [Cloudflare Pages Functions (API)]
(Devices, Whitelist, Stats)            │
                                       │ (Authenticated HTTPS Webhook)
                                       ▼
                       [Virtual Smart Home / Alexa Routine / Home Assistant]
                                       │
                                       ▼
                             [BroadLink Cloud API]
                                       │
                                       ▼
                            [BroadLink RM4 Pro (LAN)]
                                       │ (RF Signal: 315/433 MHz)
                                       ▼
                              [Physical Garage Door]
```

---

## ✨ Features

- **No Home Server Required**: Runs entirely on Cloudflare's global free tier. Home PC can be completely powered off.
- **4-Factor Device Verification**: Once an authorized user enters the PIN once and you whitelist them from the Admin console, they can trigger the door with **1 tap** (no PIN re-entry). The edge worker cryptographically verifies:
  1. High-entropy UUID device token stored in browser storage.
  2. Operating system / platform family (iOS, Android, Windows, Mac).
  3. Browser engine family (Safari, Chrome, Firefox).
  4. Hardware display geometry & color depth fingerprint.
- **Interactive Admin Drawer**:
  - Whitelist or revoke access with 1 toggle.
  - Assign friendly nicknames to family/neighbors.
  - Delete stale devices.
- **Fun Stats & Weekly Leaderboard**:
  - Tracks total door triggers.
  - Real-time weekly leaderboard ("Top User") with automatic reset every Sunday at 11:59 PM (AEST).
  - Displays personalized user nicknames instead of raw device strings.
  - Shows peak trigger times of day.
- **Mobile PWA Ready**: Installable to iOS and Android home screens as a native full-screen app with custom icons and splash screen.

---

## 🚀 Setup & Deployment Guide

### Prerequisites
- A free [Cloudflare Account](https://dash.cloudflare.com/)
- Node.js 18+ installed locally
- A [BroadLink RM4 Pro](https://www.ibroadlink.com/) set up on your 2.4GHz Wi-Fi network and paired in the BroadLink mobile app.
- An Alexa Echo device or the Amazon Alexa app.

---

### Step 1: Clone and Install Dependencies

```bash
cd cloud-cloudflare-pages
npm install
```

---

### Step 2: Create Cloudflare D1 Database

Log in to Wrangler:
```bash
npx wrangler login
```

Create your D1 database:
```bash
npx wrangler d1 create garage-db
```

Wrangler will output something like:
```toml
[[d1_databases]]
binding = "DB"
database_name = "garage-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy `wrangler.toml.example` to `wrangler.toml` and paste your `database_id`:
```bash
cp wrangler.toml.example wrangler.toml
```

---

### Step 3: Run Database Migrations

Apply the database schemas to your remote Cloudflare D1 database:

```bash
# Apply devices schema
npx wrangler d1 execute garage-db --remote --file=schema.sql

# Apply events and stats schema
npx wrangler d1 execute garage-db --remote --file=schema_v2.sql
```

---

### Step 4: Configure Webhook Trigger

To bridge Cloudflare Pages to your physical BroadLink RM4 Pro without running local servers, use a cloud webhook bridge such as **Virtual Smart Home (URL Routine Trigger)** or **Home Assistant Cloud**:

1. Visit [Virtual Smart Home](https://www.virtualsmarthome.xyz/url_routine_trigger/) and log in with your Amazon account.
2. Create a new trigger button (e.g., `Garage Door Trigger`).
3. Note the generated unique webhook URL.
4. In the **Amazon Alexa app**:
   - Install the **URL Routine Trigger** skill.
   - Create an Alexa Routine:
     - **When**: Smart Home -> `Garage Door Trigger` opens/triggers.
     - **Action**: Smart Home -> Control your BroadLink garage door device/scene.
5. Add the webhook URL to your `wrangler.toml` under `[vars]` as `GARAGE_WEBHOOK_URL`.

---

### Step 5: Configure Environment Variables

Edit `wrangler.toml`:

```toml
[vars]
GARAGE_PIN = "1234"        # Fallback 4-digit PIN for unwhitelisted devices
GARAGE_ADMIN_PIN = "0000"  # Master Admin PIN to open Admin console
GARAGE_WEBHOOK_URL = "https://www.virtualsmarthome.xyz/url_routine_trigger/activate.php?trigger=YOUR_ID&token=YOUR_TOKEN"
```

---

### Step 6: Deploy to Cloudflare Pages

```bash
npx wrangler pages deploy public
```

Your smart garage portal is now live at `https://<your-project-name>.pages.dev`!

---

## 📱 Mobile Installation (PWA)

1. Open your Cloudflare Pages URL in **Safari** (iOS) or **Chrome** (Android).
2. iOS: Tap **Share** -> **Add to Home Screen**.
3. Android: Tap the **three dots menu** -> **Add to Home screen** or **Install app**.
4. The controller runs as a standalone full-screen app with haptic feedback.
