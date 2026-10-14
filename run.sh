#!/bin/bash
# Loads the bot token from the macOS Keychain so it never lives in a config file.
DISCORD_BOT_TOKEN="$(security find-generic-password -s discord-bot-token -w 2>/dev/null)"
if [ -z "$DISCORD_BOT_TOKEN" ]; then
  echo "Keychain item 'discord-bot-token' not found" >&2
  exit 1
fi
export DISCORD_BOT_TOKEN
exec node "$(dirname "$0")/server.js"
