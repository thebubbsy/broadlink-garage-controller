#!/usr/bin/env node
// Change the garage PIN (or admin PIN) in one command.
//
//   npm run pin              -> asks which PIN, then the new value
//   npm run pin -- user      -> change the user PIN
//   npm run pin -- admin     -> change the admin PIN
//   npm run pin -- admin 483920
//
// Stores the value as a Cloudflare Pages secret and redeploys, because Pages
// only picks up config changes on a new deployment. Nothing is written to disk
// and the PIN is never echoed.
//
// Project name comes from CF_PAGES_PROJECT, or edit DEFAULT_PROJECT below.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DEFAULT_PROJECT = "garage-onyachamp";
const PROJECT = process.env.CF_PAGES_PROJECT || DEFAULT_PROJECT;
const BRANCH = process.env.CF_PAGES_BRANCH || "production";
const MAX_PIN = 32;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const WHICH = {
  user:  { key: "GARAGE_PIN",       label: "user PIN (opens the door)" },
  admin: { key: "GARAGE_ADMIN_PIN", label: "admin PIN (opens the admin console)" },
};

function run(cmd, args, { input } = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    if (input !== undefined) { child.stdin.write(input); child.stdin.end(); }
    child.on("error", rej);
    child.on("close", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited with ${code}`))));
  });
}

function ask(question, { mask = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((res) => {
    rl.question(question, (answer) => { rl.close(); if (mask) process.stdout.write("\n"); res(answer.trim()); });
    if (mask) {
      rl._writeToOutput = function (s) {
        // Echo the prompt itself, mask everything the user types
        rl.output.write(s.includes(question) ? question : "*");
      };
    }
  });
}

function validate(pin) {
  if (!/^[0-9]+$/.test(pin)) return "PIN must be digits only.";
  if (pin.length < 1 || pin.length > MAX_PIN) return `PIN must be 1-${MAX_PIN} digits.`;
  return null;
}

const [argWhich, argPin] = process.argv.slice(2);

let which = (argWhich || "").toLowerCase();
if (!WHICH[which]) {
  if (argWhich) console.log(`Unknown option "${argWhich}".`);
  const answer = await ask('Which PIN? Type "user" or "admin": ');
  which = answer.toLowerCase();
  if (!WHICH[which]) { console.error('Expected "user" or "admin".'); process.exit(1); }
}
const { key, label } = WHICH[which];

let pin = argPin;
if (!pin) {
  pin = await ask(`New ${label}, 1-${MAX_PIN} digits: `, { mask: true });
  const again = await ask("Type it once more to confirm: ", { mask: true });
  if (pin !== again) { console.error("The two entries did not match. Nothing changed."); process.exit(1); }
}

const problem = validate(pin);
if (problem) { console.error(problem + " Nothing changed."); process.exit(1); }

console.log(`\nSetting ${key} (${pin.length} digits) on Pages project "${PROJECT}"...`);
await run("npx", ["--yes", "wrangler@4", "pages", "secret", "put", key, "--project-name", PROJECT], { input: pin + "\n" });

console.log("\nRedeploying so the new value takes effect...");
await run("npx", ["--yes", "wrangler@4", "pages", "deploy", "public", "--project-name", PROJECT, "--branch", BRANCH, "--commit-dirty=true"]);

console.log(`\nDone. The ${label} is now ${pin.length} digits.`);
console.log("The keypad will show that many dots the next time the page is loaded.");
if (which === "admin") console.log("Tip: check it with the admin console before closing this window.");
