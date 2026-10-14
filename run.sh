#!/bin/bash
# Starts the server with the bot token from DISCORD_BOT_TOKEN, or from the macOS Keychain if that is unset.
if [ -z "$DISCORD_BOT_TOKEN" ] && command -v security >/dev/null; then
  DISCORD_BOT_TOKEN="$(security find-generic-password -s discord-bot-token -w 2>/dev/null)"
fi
if [ -z "$DISCORD_BOT_TOKEN" ]; then
  echo "No bot token found. Run ./setup.sh first." >&2
  exit 1
fi
export DISCORD_BOT_TOKEN
exec node "$(dirname "$0")/server.js"
