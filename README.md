<p align="center">
  <img src="https://raw.githubusercontent.com/zuhairadnansutrisno2502-lab/git-sorry/main/docs/demo.gif" alt="git-sorry finding the worst line in a repository, naming the author, and printing the verdict in the terminal" width="100%">
</p>

<h1 align="center">git-sorry</h1>

<h3 align="center">Your git blame, now with feelings.</h3>

<p align="center">
  <code>git blame</code> tells you who. <code>git-sorry</code> tells them.
</p>

```bash
npx git-sorry
```

<p align="center">
  No install. No API key. No arguments. It finds your worst line on its own.<br>
  Works offline, and in a repository you cloned nine seconds ago.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/git-sorry"><img alt="npm" src="https://img.shields.io/npm/v/git-sorry?logo=npm&logoColor=white&color=CB3837"></a>
  <a href="https://github.com/zuhairadnansutrisno2502-lab/git-sorry/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/zuhairadnansutrisno2502-lab/git-sorry?style=flat&logo=github&color=yellow"></a>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-informational">
</p>

## What just happened

<img src="docs/mascot.svg" align="right" width="230" alt="Snitchy, the git-sorry mascot, pointing at someone else's code while making an announcement on a megaphone">

You ran one command and it went looking for trouble. It scans the source files
your recent commits touched, scores every line for how embarrassing it is,
picks the winner, and reads out the charge sheet: who wrote it, when, at what
hour of the night, and the commit message they had the nerve to attach.

If the line turns out to be yours, you get an apology to deliver. If it belongs
to a teammate, you get a roast. Either way nothing leaves your machine unless
you ask it to.

The one on the right is **Snitchy**. Snitchy reads `git blame` so it can tell
everyone. Ten percent remorse, ninety percent main character.

<br clear="right">

## Make it worse

| Command | What happens |
| :--- | :--- |
| `git-sorry` | Finds your worst recent line and passes judgement |
| `git-sorry src/auth.ts` | Finds the worst line in that file |
| `git-sorry src/auth.ts 42` | Judges exactly that line |
| `git-sorry wall` | Ranks everyone in the repository by smelly lines owned |
| `--ai` | Hands the evidence to Gemini and gets a verdict written fresh |
| `--roast` / `--apology` | Overrules the tool on which one you deserve |
| `--share` / `--copy` | A ready-made post, or straight to your clipboard |
| `--send` | Also posts it to your team's Slack or Discord |

`git-sorry wall` is the one that ends friendships:

```
  🏆 HALL OF SHAME  ·  20 files swept

  🥇 Marcus Chen             31 smelly lines
       src/auth.ts — return user ? user.admin ? true : user.mod ? true : false…
  🥈 Priya Raman             12 smelly lines
       src/api/sync.ts — } catch (e) {}
  🥉 you                      9 smelly lines
       src/utils.ts — // TODO: this is temporary
```

## Add your own verdict

This is the part where you come in, and it does not involve cloning anything.

**[Edit `lines.json` in your browser →](../../edit/main/lines.json)** Add a
string to `roast` or `apology`, commit it as a pull request, done. That is the
entire contribution process.

```json
"roast": [
  "{{author}} had an entire programming language available and chose {{charge}}."
]
```

Anything in double braces is filled in from the real repository — `{{author}}`,
`{{charge}}`, `{{commitMsg}}`, `{{hour}}`, `{{weekday}}`, `{{age}}`,
`{{branch}}`, `{{dirtyCount}}` and a few more. A verdict is only ever used when
every placeholder it names has a real value, so you can lean on them without
writing fallbacks. The full list is in [CONTRIBUTING.md](CONTRIBUTING.md).

If you would rather not touch a file at all, [open an issue with your joke in
it](../../issues/new?template=new-joke.yml) and somebody else will land it.

## Let Gemini write it

The built-in verdicts are instant and work anywhere. When you want one composed
on the spot for that exact line, add `--ai`:

```bash
npx git-sorry config --set-key <GEMINI_API_KEY>
npx git-sorry --ai
```

Keys are free from [Google AI Studio](https://aistudio.google.com/app/apikey)
and live in `~/.git-sorry/config.json`, owner-readable only. Gemini gets the
line, the author, the date and the commit message, which turns out to be all
the ammunition anyone needs.

## Send it to the team

```bash
npx git-sorry config --set-webhook <SLACK_OR_DISCORD_WEBHOOK_URL>
npx git-sorry --send
```

Nothing is broadcast unless `--send` is on the command line. Slack reads the
`text` field and Discord reads `content`, so a single request covers both.

## Install it properly

```bash
npm install -g git-sorry
```

Node 18 or newer, and a git repository with some history to answer for.

## The numbers

Team stress, measured before and after adopting git-sorry. Sample size: one
team that talks too much. Methodology: vibes. Findings: conclusive.

<p align="center">
  <img src="docs/stress-chart.svg" alt="Hand-drawn chart of developer stress during an incident, dropping sharply the moment the git-sorry roast lands in the channel" width="100%">
</p>

Same bug, same culprit, very different afternoon. Stress falls off a cliff the
moment the roast hits the channel, because nobody can stay angry at a line of
code while the whole team is rating an apology out of ten.

## Reviews from developers who do not exist

> "I got roasted in #general and honestly, fair." — a backend developer, still employed

> "The apology it wrote was more sincere than the one I was drafting." — somebody's tech lead

> "10/10, would get snitched on again." — the intern

## How it works

It reads the files your recent commits touched, scores each line against a
table of known offences — nested ternaries, empty catch blocks, `eval`, a
`TODO` that has outlived its author's optimism — and puts the highest scorer on
trial. `git blame` supplies the name and date, `git show` supplies the commit
message and the hour, and either the built-in list or Gemini supplies the
verdict.

Everything is local and read-only. The only outbound request is the one you ask
for with `--ai` or `--send`.

```
src/
  index.ts     the CLI, the evidence box and the verdicts
  git.ts       blame, context, and deciding which line deserves it
  local.ts     picks a built-in verdict and fills it in
  gemini.ts    builds the prompt and calls Gemini
  webhook.ts   posts to Slack or Discord
  config.ts    local key and webhook storage
lines.json     every built-in verdict, one string each
```

## Hack on it

```bash
git clone https://github.com/zuhairadnansutrisno2502-lab/git-sorry.git
cd git-sorry
npm install && npm run build
npm link          # `git-sorry` now runs your local build
npm test
```

`npm unlink -g git-sorry` puts things back the way they were.

Pull requests are welcome, and the ones that add jokes get merged fastest. If
the verdict made you laugh, a ⭐ keeps Snitchy fed.

## License

Released under the MIT License. See [LICENSE](LICENSE).
