// Variable-length PIN tests.
//
//   node tests/pin-length.test.mjs      (or: npm test)
//
// The PIN may be any length up to 32 digits. The server never sends the PIN to
// the client, only its length, so the keypad can render one dot per digit.
// Runs the real Pages Function handlers against an in-memory SQLite database
// through a small D1-compatible shim - no network, no Cloudflare account.
import { DatabaseSync } from "node:sqlite";
import { configuredPinLength } from "../functions/api/_db.js";
import * as register from "../functions/api/device/register.js";
import * as trigger from "../functions/api/trigger.js";

function freshDb() {
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
`);
  return {
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
}

const post = (body) => new Request("https://example.com/api/x", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (iPhone) Safari" },
  body: JSON.stringify(body),
});

let pass = 0, fail = 0;
function assert(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  ok ? pass++ : fail++;
}

console.log("── configuredPinLength ──");
for (const [pin, want] of [["1234", 4], ["4826", 4], ["123456", 6], ["1", 1], ["1234567890123", 13]]) {
  const got = configuredPinLength({ GARAGE_PIN: pin });
  assert(`PIN of ${pin.length} digits reports ${want}`, got === want, `got ${got}`);
}
assert("unset GARAGE_PIN falls back to 4", configuredPinLength({}) === 4);
assert("absurdly long PIN is capped at 32", configuredPinLength({ GARAGE_PIN: "9".repeat(100) }) === 32);

console.log("── /api/device/register reports the length (never the PIN) ──");
for (const pin of ["1234", "836251", "1122334455"]) {
  const env = { DB: freshDb(), GARAGE_PIN: pin };
  const res = await register.onRequestPost({ request: post({ device_token: "dev_a" }), env });
  const body = await res.json();
  assert(`${pin.length}-digit PIN -> pin_length ${pin.length}`, body.pin_length === pin.length, `got ${body.pin_length}`);
  assert(`  PIN value is not leaked`, !JSON.stringify(body).includes(pin));
}
{
  // A returning device gets the length too, not just a first-time registration
  const env = { DB: freshDb(), GARAGE_PIN: "836251" };
  await register.onRequestPost({ request: post({ device_token: "dev_b" }), env });
  const body = await (await register.onRequestPost({ request: post({ device_token: "dev_b" }), env })).json();
  assert("returning device also gets pin_length", body.pin_length === 6, `got ${body.pin_length}`);
}

console.log("── /api/trigger accepts a PIN of any length ──");
for (const pin of ["1234", "836251", "1122334455"]) {
  const env = { DB: freshDb(), GARAGE_PIN: pin };
  const ok = await trigger.onRequestPost({ request: post({ device_token: "dev_c", pin }), env });
  assert(`correct ${pin.length}-digit PIN opens the door`, ok.status === 200, `HTTP ${ok.status}`);

  const wrong = await trigger.onRequestPost({ request: post({ device_token: "dev_c", pin: "0".repeat(pin.length) }), env });
  assert(`  wrong ${pin.length}-digit PIN is refused`, wrong.status === 401, `HTTP ${wrong.status}`);

  // A correct-but-truncated PIN must not be accepted as a prefix
  const shortened = await trigger.onRequestPost({ request: post({ device_token: "dev_c", pin: pin.slice(0, -1) }), env });
  assert(`  truncated PIN is refused`, shortened.status === 401, `HTTP ${shortened.status}`);
}
{
  const env = { DB: freshDb(), GARAGE_PIN: "1234" };
  const huge = await trigger.onRequestPost({ request: post({ device_token: "dev_d", pin: "1".repeat(5000) }), env });
  assert("over-long PIN payload is rejected", huge.status === 401, `HTTP ${huge.status}`);
  const notString = await trigger.onRequestPost({ request: post({ device_token: "dev_d", pin: 1234 }), env });
  assert("non-string PIN is rejected", notString.status === 401, `HTTP ${notString.status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
