Read-only access to Discord through the user's own bot. You can read; you cannot post, edit, react or delete. If the user wants something posted, write it for them to paste.

Finding things
- Get IDs from list_servers, then list_channels. Never guess a server, channel or thread ID.
- A pasted discord.com/channels/... link: use get_message on it.
- Looking for a keyword, topic or person: use search_messages on the relevant channels instead of reading them in full.
- Threads and forum posts are channels with their own ID. Use list_threads on the parent channel, then read_messages or read_pins on the thread ID. A forum itself has no messages, only threads.
- Pins often hold a channel's key context (specs, links, decisions). Check read_pins when you need background.

Keeping reads small
- Prefer a date range (after/before) or a small limit over reading whole histories; long histories use a lot of context.
- read_messages returns messages oldest first. The header says when the limit was hit, meaning older messages exist.

Access
- list_channels shows only channels the bot can read and names the ones it cannot.
- A 403 or "Missing Access" means the bot lacks permission for that channel. Do not retry. Tell the user to ask a server admin to give their bot the Discord Reader role, or access to that channel.
- Messages that show authors but no text mean Message Content Intent is off in the bot's settings in the Discord Developer Portal.

Reading results
- Every message includes a link; cite it when you quote or summarize something specific.
- Times are UTC.
- read_attachment reads text files (.txt, .md, .csv, .json and similar). For images and PDFs, give the user the attachment link.
