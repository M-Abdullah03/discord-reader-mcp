// Read-only Discord MCP tools. Uses a bot token and exposes no write tools.
// Shared by the local stdio server (server.js) and the hosted worker (worker.js).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const API = "https://discord.com/api/v10";
const DISCORD_EPOCH = 1420070400000n;

const CHANNEL_TYPES = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  10: "announcement-thread",
  11: "public-thread",
  12: "private-thread",
  13: "stage",
  15: "forum",
  16: "media",
};

function makeApi(token) {
  return async function api(path) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(API + path, {
        headers: { Authorization: `Bot ${token}`, "User-Agent": "DiscordBot (discord-reader-mcp, 1.0)" },
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        await new Promise((r) => setTimeout(r, Math.ceil((body.retry_after ?? 1) * 1000) + 100));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`Discord API ${res.status} on ${path}: ${body}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }
    throw new Error(`Discord API rate limited too many times on ${path}`);
  };
}

function parseDate(value, name) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${name} date: ${value}`);
  return d;
}

function snowflakeFromDate(date) {
  return ((BigInt(date.getTime()) - DISCORD_EPOCH) << 22n).toString();
}

function fmtTime(iso) {
  return iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "";
}

const VIEW_CHANNEL = 1n << 10n;
const READ_MESSAGE_HISTORY = 1n << 16n;
const ADMINISTRATOR = 1n << 3n;

// Computes which channels the bot can read, since /guilds/:id/channels returns every channel regardless of access.
async function readableChecker(api, guildId) {
  const me = await api("/users/@me");
  const [member, roles] = await Promise.all([api(`/guilds/${guildId}/members/${me.id}`), api(`/guilds/${guildId}/roles`)]);
  const roleIds = new Set(member.roles);
  let base = BigInt(roles.find((r) => r.id === guildId)?.permissions ?? 0);
  for (const r of roles) if (roleIds.has(r.id)) base |= BigInt(r.permissions);
  const needed = VIEW_CHANNEL | READ_MESSAGE_HISTORY;

  return (channel) => {
    if (base & ADMINISTRATOR) return true;
    let perms = base;
    const overwrites = channel.permission_overwrites ?? [];
    const everyone = overwrites.find((o) => o.id === guildId);
    if (everyone) perms = (perms & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
    let allow = 0n;
    let deny = 0n;
    for (const o of overwrites) {
      if (o.type === 0 && roleIds.has(o.id)) {
        allow |= BigInt(o.allow);
        deny |= BigInt(o.deny);
      }
    }
    perms = (perms & ~deny) | allow;
    const own = overwrites.find((o) => o.type === 1 && o.id === me.id);
    if (own) perms = (perms & ~BigInt(own.deny)) | BigInt(own.allow);
    return (perms & needed) === needed;
  };
}

function text(s) {
  return { content: [{ type: "text", text: s }] };
}

function fail(e) {
  return { content: [{ type: "text", text: String(e.message ?? e) }], isError: true };
}

function formatMessage(m, guildId) {
  const lines = [];
  const author = m.author?.global_name || m.author?.username || "unknown";
  lines.push(`--- [${fmtTime(m.timestamp)}] ${author} (@${m.author?.username}) | msg ${m.id}`);
  lines.push(`link: https://discord.com/channels/${guildId}/${m.channel_id}/${m.id}`);
  if (m.content) {
    // Swap <@id> mentions for names so role assignments are readable.
    const names = new Map((m.mentions ?? []).map((u) => [u.id, u.global_name || u.username]));
    lines.push(m.content.replace(/<@!?(\d+)>/g, (raw, id) => (names.has(id) ? `@${names.get(id)}` : raw)));
  }
  for (const a of m.attachments ?? []) lines.push(`[attachment] ${a.filename} (${a.content_type ?? "unknown type"}) ${a.url}`);
  for (const e of m.embeds ?? []) {
    const parts = [e.title, e.description].filter(Boolean);
    if (parts.length) lines.push(`[embed] ${parts.join(" | ")}`);
  }
  if (m.thread) lines.push(`[started thread] "${m.thread.name}" id ${m.thread.id}`);
  return lines.join("\n");
}

// maxMessages caps read_messages, e.g. to stay under a host's per-request subrequest limit.
export function createServer(token, { maxMessages = 5000 } = {}) {
  const api = makeApi(token);
  const server = new McpServer({ name: "discord-reader", version: "1.0.0" });
  const readOnly = { readOnlyHint: true, openWorldHint: true };

  server.registerTool(
    "list_servers",
    {
      description: "List the Discord servers (guilds) the bot has been added to.",
      annotations: readOnly,
    },
    async () => {
      try {
        const guilds = await api("/users/@me/guilds");
        return text(guilds.map((g) => `${g.name} | id ${g.id}`).join("\n") || "The bot is not in any servers.");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_channels",
    {
      description:
        "List text, announcement and forum channels in a server that the bot can read, grouped by category. Also reports how many channels it cannot access.",
      inputSchema: { guild_id: z.string().describe("Server ID from list_servers") },
      annotations: readOnly,
    },
    async ({ guild_id }) => {
      try {
        const [channels, canRead] = await Promise.all([api(`/guilds/${guild_id}/channels`), readableChecker(api, guild_id)]);
        const categories = new Map(channels.filter((c) => c.type === 4).map((c) => [c.id, c]));
        const messageChannels = channels.filter((c) => [0, 5, 15, 16].includes(c.type));
        const hidden = messageChannels.filter((c) => !canRead(c));
        const readable = messageChannels.filter(canRead).sort((a, b) => {
          const pa = categories.get(a.parent_id)?.position ?? -1;
          const pb = categories.get(b.parent_id)?.position ?? -1;
          return pa - pb || a.position - b.position;
        });
        const out = readable.map((c) => {
          const cat = categories.get(c.parent_id)?.name ?? "(no category)";
          return `${cat} / #${c.name} | ${CHANNEL_TYPES[c.type]} | id ${c.id}`;
        });
        if (hidden.length) {
          out.push(`\n${hidden.length} channel(s) the bot cannot read: ${hidden.map((c) => `#${c.name}`).join(", ")}`);
        }
        return text(out.join("\n") || "No readable channels found.");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "read_messages",
    {
      description:
        "Read messages from a channel or thread (threads use their own ID), oldest first, optionally limited to a date range. Pages through full history, not just the latest 100.",
      inputSchema: {
        channel_id: z.string().describe("Channel or thread ID"),
        after: z.string().optional().describe("Only messages at or after this date/time, ISO 8601 (e.g. 2026-09-15)"),
        before: z.string().optional().describe("Only messages before this date/time, ISO 8601"),
        limit: z.number().int().min(1).max(maxMessages).optional().describe(`Max messages to return (default 500, max ${maxMessages})`),
      },
      annotations: readOnly,
    },
    async ({ channel_id, after, before, limit = 500 }) => {
      try {
        const afterDate = parseDate(after, "after");
        const beforeDate = parseDate(before, "before");
        const channel = await api(`/channels/${channel_id}`);
        if ([15, 16].includes(channel.type)) {
          return fail(
            new Error(`#${channel.name} is a forum; its posts are threads. Use list_threads, then read_messages on each thread ID.`),
          );
        }

        // Walk backwards from `before` (or now) until we pass `after` or hit the limit.
        const collected = [];
        let cursor = beforeDate ? snowflakeFromDate(beforeDate) : null;
        let done = false;
        while (!done && collected.length < limit) {
          const qs = new URLSearchParams({ limit: "100" });
          if (cursor) qs.set("before", cursor);
          const batch = await api(`/channels/${channel_id}/messages?${qs}`);
          if (batch.length === 0) break;
          for (const m of batch) {
            if (afterDate && new Date(m.timestamp) < afterDate) {
              done = true;
              break;
            }
            collected.push(m);
            if (collected.length >= limit) break;
          }
          cursor = batch[batch.length - 1].id;
          if (batch.length < 100) break;
        }

        collected.reverse();
        const header = `#${channel.name} (id ${channel.id}): ${collected.length} message(s)${
          collected.length >= limit ? ` (hit limit of ${limit}; narrow the date range or raise limit)` : ""
        }`;
        return text([header, ...collected.map((m) => formatMessage(m, channel.guild_id))].join("\n\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "read_pins",
    {
      description:
        "Read the pinned messages of a channel or thread (threads use their own ID), oldest pin first. Each thread has its own pins, separate from its parent channel.",
      inputSchema: { channel_id: z.string().describe("Channel or thread ID") },
      annotations: readOnly,
    },
    async ({ channel_id }) => {
      try {
        const channel = await api(`/channels/${channel_id}`);
        if ([15, 16].includes(channel.type)) {
          return fail(new Error(`#${channel.name} is a forum; its posts are threads. Use list_threads, then read_pins on each thread ID.`));
        }

        // Pins page newest first by pin time, 50 at a time.
        const pins = [];
        let beforeCursor = null;
        for (;;) {
          const qs = new URLSearchParams({ limit: "50" });
          if (beforeCursor) qs.set("before", beforeCursor);
          const page = await api(`/channels/${channel_id}/messages/pins?${qs}`);
          pins.push(...(page.items ?? []));
          if (!page.has_more || !page.items?.length) break;
          beforeCursor = page.items[page.items.length - 1].pinned_at;
        }

        pins.reverse();
        const header = `#${channel.name} (id ${channel.id}): ${pins.length} pinned message(s)`;
        const out = pins.map((p) => `${formatMessage(p.message, channel.guild_id)}\n[pinned ${fmtTime(p.pinned_at)}]`);
        return text([header, ...out].join("\n\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_threads",
    {
      description:
        "List threads in a channel or forum: active threads, archived public threads, and archived private threads the bot has joined. Read a thread with read_messages using its ID.",
      inputSchema: {
        channel_id: z.string().describe("Parent channel or forum ID"),
        after: z.string().optional().describe("Skip archived threads archived before this date, ISO 8601"),
      },
      annotations: readOnly,
    },
    async ({ channel_id, after }) => {
      try {
        const afterDate = parseDate(after, "after");
        const channel = await api(`/channels/${channel_id}`);
        const threads = new Map();

        const active = await api(`/guilds/${channel.guild_id}/threads/active`);
        for (const t of active.threads ?? []) if (t.parent_id === channel_id) threads.set(t.id, t);

        const archivedSources = [
          `/channels/${channel_id}/threads/archived/public`,
          `/channels/${channel_id}/users/@me/threads/archived/private`,
        ];
        const notes = [];
        for (const base of archivedSources) {
          let beforeCursor = null;
          try {
            for (;;) {
              const qs = new URLSearchParams({ limit: "100" });
              if (beforeCursor) qs.set("before", beforeCursor);
              const page = await api(`${base}?${qs}`);
              let reachedOld = false;
              for (const t of page.threads ?? []) {
                const archivedAt = t.thread_metadata?.archive_timestamp;
                if (afterDate && archivedAt && new Date(archivedAt) < afterDate) {
                  reachedOld = true;
                  break;
                }
                threads.set(t.id, t);
              }
              if (reachedOld || !page.has_more || !page.threads?.length) break;
              const last = page.threads[page.threads.length - 1];
              // Public archives page by timestamp, joined-private archives page by thread ID.
              beforeCursor = base.includes("/users/@me/") ? last.id : last.thread_metadata.archive_timestamp;
            }
          } catch (e) {
            if (e.status === 403) notes.push(`(no access to ${base.includes("private") ? "private" : "public"} archived threads)`);
            else throw e;
          }
        }

        const list = [...threads.values()].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
        const out = list.map((t) => {
          const state = t.thread_metadata?.archived ? "archived" : "active";
          const created = t.thread_metadata?.create_timestamp ?? new Date(Number((BigInt(t.id) >> 22n) + DISCORD_EPOCH)).toISOString();
          return `"${t.name}" | ${CHANNEL_TYPES[t.type]} | ${state} | created ${fmtTime(created)} | ${t.message_count ?? "?"} msgs | id ${t.id}`;
        });
        return text([`Threads in #${channel.name}: ${list.length}`, ...out, ...notes].join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}
