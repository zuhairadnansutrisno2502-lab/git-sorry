# git-sorry

A humorous Git CLI. Point it at a bad line of code and it figures out who to
blame with `git blame`, then asks the **Gemini API** to write either a dramatic
Shakespearean apology (if the culprit is *you*) or a theatrical roast (if it is
someone else) — and broadcasts the result to your team's **Slack or Discord**
channel via webhook.

Bring your own keys (BYOK): your Gemini API key and webhook URL are stored
locally in `~/.git-sorry/config.json` (owner-only, `0600`).

## Install

```bash
npm install
npm run build
```

## Configure

```bash
git-sorry config --set-key <GEMINI_API_KEY>
git-sorry config --set-webhook <SLACK_OR_DISCORD_WEBHOOK_URL>
```

- Gemini API key: https://aistudio.google.com/app/apikey
- Slack incoming webhook: `https://hooks.slack.com/services/...`
- Discord webhook: `https://discord.com/api/webhooks/...`

## Use

```bash
git-sorry blame <filepath> <line_number>
```

Example — blame line 42 of `src/app.ts`:

```bash
git-sorry blame src/app.ts 42
```

- If **you** wrote the line → a groveling, over-the-top apology.
- If **someone else** did → a passive-aggressive call-out demanding answers.

Either way the message is printed in a nice box and posted to your team chat.

## Build & test it locally with `npm link`

```bash
# from the project root
npm install
npm run build      # compiles TypeScript to dist/ and marks the bin executable
npm link           # symlinks the `git-sorry` command onto your PATH

# now use it anywhere inside a git repository
git-sorry config --set-key <GEMINI_API_KEY>
git-sorry config --set-webhook <URL>
git-sorry blame path/to/file.ts 10

# run the parser tests
npm test

# when you're done
npm unlink -g git-sorry
```

## How it works

1. Verifies your Gemini key and webhook URL are configured.
2. Reads your local `git config user.name`.
3. Runs `git blame -L <n>,<n> --porcelain <file>` for the author, date and line.
4. Compares you against the author.
5. Prompts Gemini (`gemini-1.5-flash`) for an apology or a roast.
6. Prints it in a `boxen` frame.
7. POSTs it to your webhook (`{ "text": ... }` for Slack, `{ "content": ... }` for Discord — one payload covers both).
8. Confirms the broadcast.

## License

MIT
