-- Smart Garage DB v3 — 1-Tap access requests + admin classification
-- Run this migration against your D1 database (additive, safe on live data):
--   npx wrangler d1 execute garage-db --remote --file=schema_v3.sql

ALTER TABLE devices ADD COLUMN one_tap_requested INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN one_tap_requested_at TEXT DEFAULT '';
ALTER TABLE devices ADD COLUMN is_admin INTEGER DEFAULT 0;
