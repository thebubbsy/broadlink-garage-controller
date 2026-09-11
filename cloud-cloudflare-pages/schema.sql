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
    is_blocked INTEGER DEFAULT 0,
    one_tap_requested INTEGER DEFAULT 0,
    one_tap_requested_at TEXT DEFAULT '',
    is_admin INTEGER DEFAULT 0
);

-- Event log (see schema_v2.sql for the migration on existing databases)
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_token TEXT NOT NULL DEFAULT '',
    friendly_name TEXT NOT NULL DEFAULT '',
    auth_method  TEXT NOT NULL DEFAULT 'pin',
    ip_address   TEXT NOT NULL DEFAULT '',
    triggered_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_triggered_at ON events(triggered_at);
CREATE INDEX IF NOT EXISTS idx_events_device_token  ON events(device_token);

