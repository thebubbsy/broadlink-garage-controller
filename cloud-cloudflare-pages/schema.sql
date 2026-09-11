-- Cloudflare D1 Schema for Smart Garage Devices
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_token TEXT UNIQUE NOT NULL,
    friendly_name TEXT DEFAULT '',
    platform TEXT DEFAULT 'Unknown',
    browser TEXT DEFAULT 'Unknown',
    hardware_fingerprint TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    has_opened_with_pin INTEGER DEFAULT 0,
    is_whitelisted INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    is_blocked INTEGER DEFAULT 0
);

