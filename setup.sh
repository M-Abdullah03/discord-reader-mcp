#!/bin/bash
# Installs discord-reader for Claude Code: dependencies, bot token, and registration.
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"

need() { command -v "$1" >/dev/null || { echo "Missing $1. $2" >&2; exit 1; }; }
need node "Install Node.js (LTS) from https://nodejs.org"
need claude "Install Claude Code from https://claude.com/claude-code"

echo "Installing dependencies..."
npm install --omit=dev --silent

# Reuse a saved token unless --new-token is passed.
TOKEN=""
if command -v security >/dev/null && [ "$1" != "--new-token" ]; then
  TOKEN="$(security find-generic-password -s discord-bot-token -w 2>/dev/null || true)"
  [ -n "$TOKEN" ] && echo "Using the bot token saved in your Keychain (run with --new-token to replace it)."
fi
NEW_TOKEN=""
if [ -z "$TOKEN" ]; then
  read -rsp "Paste your bot token (it stays hidden), then press Enter: " TOKEN
  echo
  NEW_TOKEN=1
fi
[ -n "$TOKEN" ] || { echo "No token entered." >&2; exit 1; }

echo "Checking the token..."
DISCORD_BOT_TOKEN="$TOKEN" node --input-type=module -e '
const h = { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } };
const get = (p) => fetch("https://discord.com/api/v10" + p, h);
const me = await get("/users/@me");
if (!me.ok) { console.error("That token did not work. Copy it again from the Bot page (Reset Token)."); process.exit(1); }
const app = await (await get("/applications/@me")).json();
const guilds = await (await get("/users/@me/guilds")).json();
console.log(`Bot: ${(await me.json()).username}`);
console.log(guilds.length ? `Servers: ${guilds.map((g) => g.name).join(", ")}` : "Servers: none yet. Ask a server admin to open your invite link.");
if (!(app.flags & ((1 << 18) | (1 << 19)))) console.log("WARNING: Message Content Intent is off, so messages will look empty. Turn it on in the Bot page.");
'

if command -v security >/dev/null; then
  [ -n "$NEW_TOKEN" ] && security add-generic-password -U -a "$USER" -s discord-bot-token -w "$TOKEN"
  ENV_ARGS=()
else
  # No Keychain outside macOS: the token is stored in Claude Code's config instead.
  ENV_ARGS=(-e "DISCORD_BOT_TOKEN=$TOKEN")
fi

claude mcp remove discord-reader -s user >/dev/null 2>&1 || true
claude mcp add discord-reader -s user "${ENV_ARGS[@]}" -- "$DIR/run.sh" >/dev/null
echo "Done. Open a new Claude Code session and ask it about your Discord server."
