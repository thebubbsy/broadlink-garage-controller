// Authorization tests for the stats / weekly leaderboard endpoints.
//
//   node tests/stats-auth.test.mjs      (or: npm test)
//
// Usage history reveals when the household comes and goes, so these endpoints
// must only ever answer verified (1-tap) devices and administrators. Runs the
// real Pages Function handlers against an in-memory SQLite database through a
// small D1-compatible shim - no network, no Cloudflare account needed.
import { DatabaseSync } from "node:sqlite";
import * as stats from "../functions/api/stats.js";
import * as weekly from "../functions/api/weekly.js";

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, device_token TEXT UNIQUE NOT NULL,
  friendly_name TEXT DEFAULT '', platform TEXT DEFAULT '', browser TEXT DEFAULT '',
  hardware_fingerprint TEXT DEFAULT '', user_agent TEXT DEFAULT '', ip_address TEXT DEFAULT '',
  first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, has_opened_with_pin INTEGER DEFAULT 0,
  is_whitelisted INTEGER DEFAULT 0, open_count INTEGER DEFAULT 0, is_blocked INTEGER DEFAULT 0,
  one_tap_requested INTEGER DEFAULT 0, one_tap_requested_at TEXT DEFAULT '', is_admin INTEGER DEFAULT 0,
  siri_key TEXT DEFAULT '');
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, device_token TEXT NOT NULL DEFAULT '',
  friendly_name TEXT NOT NULL DEFAULT '', auth_method TEXT NOT NULL DEFAULT 'pin',
  ip_address TEXT NOT NULL DEFAULT '', triggered_at TEXT NOT NULL);
INSERT INTO devices (device_token,friendly_name,platform,browser,first_seen,last_seen,has_opened_with_pin,is_whitelisted,is_blocked,is_admin) VALUES
 ('dev_wl','Whitelisted Phone','iPhone (iOS)','Safari','2026-09-20 10:00:00','2026-09-22 10:00:00',1,1,0,0),
 ('dev_pin','PIN Only Phone','Android Phone','Chrome','2026-09-20 10:00:00','2026-09-22 10:00:00',1,0,0,0),
 ('dev_adm','Admin Laptop','Windows PC','Chrome','2026-09-20 10:00:00','2026-09-22 10:00:00',1,0,0,1),
 ('dev_blk','Blocked Phone','Linux','Firefox','2026-09-20 10:00:00','2026-09-22 10:00:00',1,1,1,0);
INSERT INTO events (device_token,friendly_name,auth_method,ip_address,triggered_at) VALUES
 ('dev_wl','Whitelisted Phone','whitelisted_4factor','1.1.1.1','2026-09-22 08:15:00'),
 ('dev_wl','Whitelisted Phone','siri','1.1.1.1','2026-09-22 18:40:00'),
 ('dev_pin','PIN Only Phone','pin','1.1.1.2','2026-09-21 07:05:00');
`);

// Minimal D1 shim over node:sqlite
const DB = {
  prepare(sql) {
    const stmt = db.prepare(sql);
    let args = [];
    const api = {
      bind(...a) { args = a; return api; },
      async first() { return stmt.get(...args) ?? null; },
      async all() { return { results: stmt.all(...args) }; },
      async run() { return stmt.run(...args); },
    };
    return api;
  },
};
const env = { DB, GARAGE_ADMIN_PIN: "4321" };

const post = (body) => new Request("https://example.com/api/x", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

let pass = 0, fail = 0;
async function check(label, res, wantStatus, wantHasData) {
  const body = await res.json();
  const hasData = wantHasData === undefined ? null
    : ("total_triggers" in body ? body.total_triggers > 0 : body.top_name !== null && body.top_name !== undefined);
  const ok = res.status === wantStatus && (wantHasData === undefined || hasData === wantHasData);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${res.status} ${JSON.stringify(body).slice(0, 90)}`);
  ok ? pass++ : fail++;
}

console.log("── /api/stats ──");
await check("GET (browser visit)              denied", await stats.onRequestGet(), 403, false);
await check("POST no credentials              denied", await stats.onRequestPost({ request: post({}), env }), 403, false);
await check("POST unknown token               denied", await stats.onRequestPost({ request: post({ device_token: "dev_nope" }), env }), 403, false);
await check("POST PIN-only device             denied", await stats.onRequestPost({ request: post({ device_token: "dev_pin" }), env }), 403, false);
await check("POST blocked (was whitelisted)   denied", await stats.onRequestPost({ request: post({ device_token: "dev_blk" }), env }), 403, false);
await check("POST wrong admin pin             denied", await stats.onRequestPost({ request: post({ admin_pin: "0000" }), env }), 403, false);
await check("POST whitelisted device         ALLOWED", await stats.onRequestPost({ request: post({ device_token: "dev_wl" }), env }), 200, true);
await check("POST admin-flagged device       ALLOWED", await stats.onRequestPost({ request: post({ device_token: "dev_adm" }), env }), 200, true);
await check("POST correct admin pin          ALLOWED", await stats.onRequestPost({ request: post({ admin_pin: "4321" }), env }), 200, true);

console.log("── /api/weekly ──");
await check("GET (browser visit)              denied", await weekly.onRequestGet(), 403, false);
await check("POST no credentials              denied", await weekly.onRequestPost({ request: post({}), env }), 403, false);
await check("POST PIN-only device             denied", await weekly.onRequestPost({ request: post({ device_token: "dev_pin" }), env }), 403, false);
await check("POST whitelisted device         ALLOWED", await weekly.onRequestPost({ request: post({ device_token: "dev_wl" }), env }), 200, true);
await check("POST correct admin pin          ALLOWED", await weekly.onRequestPost({ request: post({ admin_pin: "4321" }), env }), 200, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
