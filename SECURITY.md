# Security Policy

## Supported versions

Fixes land on the latest published release. If you are on something older, the
upgrade is `npm install -g git-sorry@latest`, or nothing at all if you run it
through `npx`.

| Version | Supported |
| :--- | :--- |
| 1.2.x | Yes |
| < 1.2 | No |

## Reporting a vulnerability

Please do not open a public issue for anything security related.

Use [private vulnerability reporting](../../security/advisories/new), which
keeps the report between you and the maintainer until there is a fix. If that is
unavailable to you, email zuhairadnansutrisno2502@gmail.com instead.

A useful report says what an attacker gets and how you got there. Expect an
acknowledgement within a few days, and credit in the release notes once a fix
ships, unless you would rather stay anonymous.

## What is worth reporting

The tool is small, but it touches three things that matter:

**Your credentials.** A Gemini API key and a webhook URL are stored in
`~/.git-sorry/config.json`, written with owner-only permissions (`0600`).
Anything that widens those permissions, writes the file somewhere else, or leaks
either value into terminal output, an error message or an outbound request is a
real issue.

**Your repository contents.** The tool reads source lines out of your git
history and, on `--ai`, sends one of them to Google's Gemini API. Anything that
causes more than the blamed line to leave the machine, or that sends anything at
all without `--ai` or `--send`, is a real issue.

**The git commands it runs.** File paths reach `git` through `simple-git`
argument arrays rather than a shell. A path or line number that escapes that and
executes something is a real issue, and a serious one.

## What is not a vulnerability

A verdict that hurt your feelings. That is the intended behaviour, and
[CONTRIBUTING.md](CONTRIBUTING.md) explains where to send it instead.
