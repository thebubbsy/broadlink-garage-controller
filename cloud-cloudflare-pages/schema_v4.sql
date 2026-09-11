-- Smart Garage DB v4 — per-device Siri / Shortcuts key
-- Run this migration against your D1 database (additive, safe on live data):
--   npx wrangler d1 execute garage-db --remote --file=schema_v4.sql

ALTER TABLE devices ADD COLUMN siri_key TEXT DEFAULT '';
