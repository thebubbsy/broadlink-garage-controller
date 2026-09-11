-- Smart Garage DB v2 — adds event log table
-- Run this migration against your D1 database:
--   npx wrangler d1 execute garage-db --remote --file=schema_v2.sql

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_token TEXT NOT NULL DEFAULT '',
    friendly_name TEXT NOT NULL DEFAULT '',
    auth_method  TEXT NOT NULL DEFAULT 'pin',   -- 'pin' | 'whitelisted_4factor' | 'siri'
    ip_address   TEXT NOT NULL DEFAULT '',
    triggered_at TEXT NOT NULL                  -- ISO-8601 UTC e.g. '2026-09-10 12:34:56'
);

-- Index to make the stats queries fast
CREATE INDEX IF NOT EXISTS idx_events_triggered_at ON events(triggered_at);
CREATE INDEX IF NOT EXISTS idx_events_device_token  ON events(device_token);

