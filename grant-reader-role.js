#!/usr/bin/env node
// Gives a "Discord Reader" role read-only access (View Channel, Read Message History) to channels in a server.
// It only adds that role's permission entry; every other channel permission is left as it is.
//
// Usage:
//   node grant-reader-role.js --server <server ID> [--category "<name>" ...] [--role "<name>"] [--apply]
// Without --apply it only lists what it would change. The bot running it needs Administrator while it runs.
import { execFileSync } from "node:child_process";

const API = "https://discord.com/api/v10";
const READ = (1n << 10n) | (1n << 16n); // View Channel + Read Message History
const TYPES = { 0: "text", 4: "category", 5: "announcement", 15: "forum", 16: "media" };

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const serverId = opt("--server");
const roleName = opt("--role") ?? "Discord Reader";
const categories = args.flatMap((a, i) => (a === "--category" ? [args[i + 1].toLowerCase()] : []));
const apply = args.includes("--apply");
if (!serverId) {
  console.error('Usage: node grant-reader-role.js --server <server ID> [--category "<name>" ...] [--role "<name>"] [--apply]');
  process.exit(1);
}

let token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  try {
    token = execFileSync("security", ["find-generic-password", "-s", "discord-bot-token", "-w"], { encoding: "utf8" }).trim();
  } catch {}
}
if (!token) {
  console.error("No bot token. Run ./setup.sh first, or set DISCORD_BOT_TOKEN.");
  process.exit(1);
}

async function api(method, path, body) {
  for (;;) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "X-Audit-Log-Reason": "grant-reader-role: read-only access for reader bots",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = (await res.json().catch(() => ({}))).retry_after ?? 1;
      await new Promise((r) => setTimeout(r, wait * 1000 + 100));
      continue;
    }
    if (!res.ok) {
      const hint = res.status === 403 ? " (the bot needs Administrator while this runs)" : "";
      throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}${hint}`);
    }
    return res.status === 204 ? null : res.json();
  }
}

const roles = await api("GET", `/guilds/${serverId}/roles`);
let role = roles.find((r) => r.name === roleName);
if (!role) {
  console.log(`${apply ? "Creating" : "Would create"} role "${roleName}" (no permissions of its own).`);
  if (apply) role = await api("POST", `/guilds/${serverId}/roles`, { name: roleName, permissions: "0" });
}

const all = await api("GET", `/guilds/${serverId}/channels`);
const categoryIds = new Set(all.filter((c) => c.type === 4 && categories.includes(c.name.toLowerCase())).map((c) => c.id));
const missing = categories.filter((name) => !all.some((c) => c.type === 4 && c.name.toLowerCase() === name));
if (missing.length) console.log(`Categories not found: ${missing.join(", ")}`);

// Categories are included so channels created in them later start with the role's access.
const targets = all.filter((c) => c.type in TYPES && (!categories.length || categoryIds.has(c.id) || categoryIds.has(c.parent_id)));

let changed = 0;
for (const c of targets) {
  const existing = role && (c.permission_overwrites ?? []).find((o) => o.id === role.id);
  const allow = BigInt(existing?.allow ?? 0);
  const deny = BigInt(existing?.deny ?? 0);
  if ((allow & READ) === READ && !(deny & READ)) continue;
  changed++;
  console.log(`${apply ? "Granting" : "Would grant"}: ${TYPES[c.type]} ${c.type === 4 ? c.name : "#" + c.name}`);
  if (apply) {
    await api("PUT", `/channels/${c.id}/permissions/${role.id}`, { type: 0, allow: String(allow | READ), deny: String(deny & ~READ) });
  }
}

console.log(
  changed
    ? `${apply ? "Updated" : "Would update"} ${changed} of ${targets.length} channel(s).${apply ? "" : " Run again with --apply to make the changes."}`
    : `All ${targets.length} channel(s) already give "${roleName}" read access.`,
);
