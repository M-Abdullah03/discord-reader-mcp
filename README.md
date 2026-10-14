# discord-reader

Lets Claude Code read Discord servers through your own bot. It can only read: it never posts, edits or deletes.

## Install (macOS)

You only need a Discord account to start.

### 1. Install the tools

- **Claude Code:** follow https://claude.com/claude-code and sign in.
- **Node.js:** download the LTS version from https://nodejs.org and install it.
- **git:** open Terminal and run `git --version`. If macOS offers to install developer tools, click Install.

### 2. Create your bot

1. Open https://discord.com/developers/applications and log in.
2. Click **New Application**, name it, and create it.
3. Open the **Bot** tab:
   - Click **Reset Token** and copy the token. Keep it private, like a password.
   - Turn **Public Bot** off.
   - Turn **Message Content Intent** on.
   - Click **Save Changes**.
4. Open the **General Information** tab and copy the **Application ID**.

### 3. Get your bot into the server

Put your Application ID into this link and send it to a server admin:

```
https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot&permissions=66560
```

Ask them to open it, pick the server, then give your bot the **Discord Reader** role (see [For server admins](#for-server-admins)).

### 4. Install

In Terminal:

```
git clone https://github.com/M-Abdullah03/discord-reader-mcp
cd discord-reader-mcp
./setup.sh
```

Paste your bot token when asked. It is saved in your macOS Keychain.

### 5. Use it

Open a new Claude Code session and ask, for example:

> Summarize the last 40 messages in #general

## Later

- **Update:** `git pull && ./setup.sh`
- **Replace the token:** `./setup.sh --new-token`

## Tools

| Tool | What it does |
|---|---|
| `list_servers` | Servers the bot is in |
| `list_channels` | Channels the bot can read, and which it cannot |
| `read_messages` | Messages from a channel or thread, with optional dates |
| `read_pins` | Pinned messages |
| `list_threads` | Threads in a channel or forum |
| `get_message` | One message from a link, with the messages around it |
| `search_messages` | Keyword search across channels |
| `read_attachment` | Contents of text attachments (.txt, .md, .csv, ...) |

## For server admins

**Once per server:** give a "Discord Reader" role read access to the channels.

1. In **Server Settings > Roles**, open the role named after your own reader bot and turn on **Administrator**.
2. Turn on **User Settings > Advanced > Developer Mode**, then right-click the server icon and **Copy Server ID**.
3. In the `discord-reader-mcp` folder, preview the changes, then apply them:
   ```
   node grant-reader-role.js --server SERVER_ID
   node grant-reader-role.js --server SERVER_ID --apply
   ```
   Add `--category "name"` (repeatable) to cover only some categories.
4. Turn **Administrator** off again.

The script only adds read access for that role and leaves all other permissions alone. Channels created later inside those categories get the access automatically. Run it again for channels created elsewhere.

**For each new person:** open their invite link, then in **Server Settings > Members**, give their bot the **Discord Reader** role.
