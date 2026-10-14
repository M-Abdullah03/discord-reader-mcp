// Hosted entry point (Cloudflare Workers). Stateless: every request brings the caller's own
// Discord bot token in the Authorization header, and nothing is stored or logged.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./tools.js";

// The free Workers plan allows 50 outbound requests per invocation, so keep reads under that, leaving
// headroom for read_attachment's file download.
const MAX_MESSAGES = 2000;
const MAX_REQUESTS = 45;

function unauthorized(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="discord-reader"' },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response("discord-reader MCP server. Connect to /mcp with your Discord bot token as a Bearer token.\n");
    }

    const match = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
    if (!match) return unauthorized("Send your Discord bot token as 'Authorization: Bearer <token>'.");

    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await createServer(match[1], { maxMessages: MAX_MESSAGES, maxRequests: MAX_REQUESTS }).connect(transport);
    return transport.handleRequest(request);
  },
};
