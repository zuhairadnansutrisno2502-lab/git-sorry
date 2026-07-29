# Contributing

The most useful thing you can add is a joke, and adding one takes about a
minute. You do not need to clone anything or run any code.

## Add a verdict

Open [`lines.json`](../../edit/main/lines.json) in the GitHub editor, add your
line to `roast` or `apology`, and commit it as a pull request. That is the
entire process.

`roast` is what git-sorry says when somebody else wrote the offending line.
`apology` is what it says when the line turns out to be yours.

Anything in double braces gets replaced with something real from the
repository the tool is running in:

| Placeholder | Becomes |
| :--- | :--- |
| `{{author}}` | whoever `git blame` names |
| `{{file}}` `{{line}}` | where the offending line lives |
| `{{code}}` | the line itself |
| `{{charge}}` | the offence, lowercase for mid-sentence use, e.g. `a nested ternary` |
| `{{age}}` | `today`, `1 day ago`, `12 days ago` |
| `{{date}}` | `2026-07-29` |
| `{{commitMsg}}` | the real commit message |
| `{{hour}}` `{{weekday}}` | `02:47`, `Tuesday` |
| `{{branch}}` | current branch name |
| `{{dirtyCount}}` | uncommitted files in the working tree |

A verdict is only ever chosen when every placeholder it names has a real
value, so use as many as you like. A template asking for `{{commitMsg}}` is
simply skipped in a repository where that lookup came back empty — you do not
need to write a fallback.

The house rule: aim at the code, never at somebody's identity. The joke should
still be funny to the person being blamed.

## Add a charge

Charges live in the `SMELLS` table near the top of `src/git.ts`. Each row is a
pattern, a score, and the name of the offence. Higher scores make a line more
likely to be picked out of a file. Add a row, run `npm test`, done.

## Working on the code

```bash
npm install
npm run build
npm link        # `git-sorry` now runs your local build
npm test
```

`npm unlink -g git-sorry` puts things back. Tests are plain `node --test`, no
framework, and they run against the built output in `dist/`.
