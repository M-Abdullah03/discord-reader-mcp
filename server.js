#!/usr/bin/env node
// Local stdio entry point. The token comes from the environment (run.sh loads it from the Keychain).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./tools.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}

await createServer(TOKEN).connect(new StdioServerTransport());
