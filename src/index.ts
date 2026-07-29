#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import boxen from "boxen";
import chalk from "chalk";
import { Command } from "commander";
import { CONFIG_PATH, loadConfig, saveConfig } from "./config.js";
import {
  ageInDays,
  agePhrase,
  blameLine,
  charge,
  context,
  currentUserName,
  hallOfShame,
  recentFiles,
  worstLine,
  type BlameInfo,
  type Target,
} from "./git.js";
import { buildPrompt, generateMessage } from "./gemini.js";
import { jokeCount, localMessage } from "./local.js";
import { broadcast } from "./webhook.js";

// Read the version off package.json so it never drifts from the published one.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const WIDTH = Math.max(52, Math.min(process.stdout.columns ?? 80, 84));
const INNER = WIDTH - 8;
const fit = (s: string, w: number) => (s.length <= w ? s : `${s.slice(0, Math.max(1, w - 1))}…`);

const program = new Command();

program
  .name("git-sorry")
  .description("Your git blame, now with feelings. Put a line of code on trial.")
  .version(version);

program
  .command("config")
  .description("Store your Gemini API key and team webhook URL locally.")
  .option("--set-key <key>", "save your Gemini API key")
  .option("--set-webhook <url>", "save your Slack/Discord webhook URL")
  .action(async (opts: { setKey?: string; setWebhook?: string }) => {
    if (!opts.setKey && !opts.setWebhook) {
      console.log(chalk.yellow("Nothing to set. Use --set-key <key> and/or --set-webhook <url>."));
      return;
    }
    const patch: { geminiApiKey?: string; webhookUrl?: string } = {};
    if (opts.setKey) patch.geminiApiKey = opts.setKey;
    if (opts.setWebhook) patch.webhookUrl = opts.setWebhook;
    await saveConfig(patch);
    if (opts.setKey) console.log(chalk.green("✓ Gemini API key saved."));
    if (opts.setWebhook) console.log(chalk.green("✓ Webhook URL saved."));
    console.log(chalk.dim(`  (stored in ${CONFIG_PATH})`));
  });

interface BlameOpts {
  roast?: boolean;
  apology?: boolean;
  ai?: boolean;
  send?: boolean;
  copy?: boolean;
  share?: boolean;
}

program
  .command("blame", { isDefault: true })
  .description("Put a line on trial. With no arguments, finds your worst recent line.")
  .argument("[filepath]", "file to judge (default: your most recently changed file)")
  .argument("[line_number]", "line to judge (default: the worst line in that file)")
  .option("--ai", "let Gemini write a fresh verdict instead of using a built-in one")
  .option("--roast", "roast the author, whoever wrote the line")
  .option("--apology", "grovel instead, even if the line was not yours")
  .option("--send", "also post the verdict to your Slack/Discord webhook")
  .option("--copy", "copy the verdict to your clipboard")
  .option("--share", "print a ready-made post for X")
  // Kept so anyone following the old README does not hit "unknown option".
  .option("--dry-run", "deprecated: printing without sending is now the default", false)
  .action(run);

program
  .command("wall")
  .description("Rank everyone in the repo by how many smelly lines they own.")
  .option("-n, --commits <count>", "how many recent commits to sweep", "40")
  .action(runWall);

async function run(filepath: string | undefined, lineArg: string | undefined, opts: BlameOpts) {
  try {
    await runBlame(filepath, lineArg, opts);
  } catch (err) {
    fail(err);
  }
}

async function runBlame(
  filepath: string | undefined,
  lineArg: string | undefined,
  opts: BlameOpts,
): Promise<void> {
  if (opts.roast && opts.apology) {
    throw new Error("Pick one: --roast or --apology, not both.");
  }

  const target = await resolveTarget(filepath, lineArg);
  const [me, blame] = await Promise.all([
    currentUserName(),
    blameLine(target.file, target.lineNumber),
  ]);
  const ctx = await context(blame.sha);

  // --apology / --roast win; otherwise it is an apology only when you blamed yourself.
  const isSelf = opts.apology ? true : opts.roast ? false : me !== "" && me === blame.author;

  const { geminiApiKey, webhookUrl } = await loadConfig();
  if (opts.ai && !geminiApiKey) {
    throw new Error(
      "--ai needs a Gemini key:\n" +
        chalk.cyan("  git-sorry config --set-key <GEMINI_API_KEY>") +
        chalk.dim("\n  Free key: https://aistudio.google.com/app/apikey"),
    );
  }
  if (opts.send && !webhookUrl) {
    throw new Error(
      "--send needs a webhook URL:\n" + chalk.cyan("  git-sorry config --set-webhook <URL>"),
    );
  }

  renderEvidence(target, blame, ctx);

  const message = opts.ai
    ? await withSpinner("Summoning Gemini", () =>
        generateMessage(geminiApiKey!, buildPrompt(me, blame, isSelf, ctx)),
      )
    : localMessage(
        {
          ...ctx,
          author: blame.author,
          file: target.file,
          line: String(target.lineNumber),
          code: blame.line.trim(),
          charge: charge(blame.line),
          date: blame.date,
          days: ageInDays(blame.date),
          age: agePhrase(blame.date),
        },
        isSelf,
      );

  console.log(
    boxen(chalk.whiteBright(message), {
      title: isSelf ? "🙏 A Humble Apology" : "🔥 A Formal Roast",
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      width: WIDTH,
      borderStyle: "round",
      borderColor: isSelf ? "yellow" : "red",
    }),
  );

  if (opts.copy) {
    copyToClipboard(message);
    console.log(chalk.green("  ✓ Copied to your clipboard."));
  }
  if (opts.share) {
    console.log(chalk.cyan("  Post it: ") + shareUrl(`${message}\n\n— git-sorry`));
  }
  if (opts.send) {
    await broadcast(webhookUrl!, message);
    console.log(chalk.green("  ✓ Broadcast to your team."));
  }

  renderFooter(Boolean(opts.ai), Boolean(geminiApiKey), Boolean(webhookUrl), Boolean(opts.send));
}

/** No arguments blames your worst recent line; a bare file blames its worst line. */
async function resolveTarget(filepath?: string, lineArg?: string): Promise<Target> {
  if (!filepath) return worstLine();
  if (lineArg === undefined) return worstLine(filepath);
  const lineNumber = Number(lineArg);
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    throw new Error(`Invalid line number: "${lineArg}". Give a positive integer.`);
  }
  return { file: filepath, lineNumber };
}

const label = (key: string, value: string) => chalk.dim(key.padEnd(14)) + chalk.white(value);
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function renderEvidence(target: Target, blame: BlameInfo, ctx: Record<string, string>): void {
  const phrase = agePhrase(blame.date);
  const when = phrase ? `committed ${phrase}` : `committed ${blame.date}`;
  const where = `${target.file}:${target.lineNumber}`;
  const gap = " ".repeat(Math.max(1, INNER - where.length - when.length));

  const rows = [
    chalk.cyan(where) + gap + chalk.dim(when),
    "",
    chalk.dim(`${String(target.lineNumber).padStart(5)} │ `) +
      chalk.whiteBright(fit(blame.line.trim(), INNER - 8)),
    "",
    label("THE ACCUSED", blame.author),
    label("THE CHARGE", sentenceCase(charge(blame.line))),
  ];
  if (ctx.commitMsg) rows.push(label("THE COMMIT", `"${fit(ctx.commitMsg, INNER - 18)}"`));
  if (ctx.hour) rows.push(label("THE HOUR", `${ctx.hour}${ctx.weekday ? `, ${ctx.weekday}` : ""}`));

  console.log(
    boxen(rows.join("\n"), {
      title: "THE EVIDENCE",
      padding: 1,
      margin: { top: 1, bottom: 0, left: 2, right: 2 },
      width: WIDTH,
      borderStyle: "round",
      borderColor: "gray",
    }),
  );
}

function renderFooter(usedAi: boolean, hasKey: boolean, hasWebhook: boolean, sent: boolean): void {
  console.log(chalk.dim(`  ${jokeCount} verdicts built in. Run it again for another.`));
  const hints: string[] = [];
  if (!usedAi) {
    hints.push(
      hasKey
        ? `${chalk.cyan("--ai")} for one written fresh by Gemini`
        : `${chalk.cyan("--ai")} writes a fresh one · free key at aistudio.google.com/app/apikey`,
    );
  }
  if (!sent && hasWebhook) hints.push(`${chalk.cyan("--send")} posts it to your team`);
  hints.push(`${chalk.cyan("--share")} or ${chalk.cyan("--copy")} to spread the news`);
  hints.push(`${chalk.cyan("git-sorry wall")} ranks the whole team`);
  for (const h of hints) console.log(chalk.dim("  ") + h);
}

async function runWall(opts: { commits: string }): Promise<void> {
  try {
    const files = await recentFiles(Number(opts.commits) || 40);
    if (!files.length) throw new Error("No files in recent history to judge.");
    const rows = await hallOfShame(files);
    if (!rows.length) {
      console.log(chalk.green("\n  Nothing incriminating in recent history. Suspicious in itself.\n"));
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    console.log(chalk.bold("\n  🏆 HALL OF SHAME") + chalk.dim(`  ·  ${files.length} files swept\n`));
    rows.slice(0, 10).forEach((r, i) => {
      const rank = medals[i] ?? `  ${i + 1}.`;
      console.log(
        `  ${rank} ${chalk.whiteBright(fit(r.author, 22).padEnd(22))}` +
          `${chalk.red(String(r.count).padStart(3))} ${chalk.dim("smelly lines")}`,
      );
      console.log(chalk.dim(`       ${fit(`${r.file} — ${r.worst}`, WIDTH - 8)}`));
    });
    console.log(chalk.dim("\n  Screenshot it. Post it in #general. We are not responsible.\n"));
  } catch (err) {
    fail(err);
  }
}

async function withSpinner<T>(text: string, work: () => Promise<T>): Promise<T> {
  // ponytail: four lines of setInterval beats a spinner dependency.
  const frames = [..."⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"];
  let i = 0;
  const tty = process.stderr.isTTY;
  if (!tty) process.stderr.write(`  ${text}...\n`);
  const spin = tty
    ? setInterval(() => process.stderr.write(`\r  ${frames[i++ % frames.length]} ${text}...`), 80)
    : undefined;
  try {
    return await work();
  } finally {
    if (spin) {
      clearInterval(spin);
      process.stderr.write("\r\x1b[K");
    }
  }
}

// Git's stderr is accurate and completely humourless. Every error is a joke slot.
const IN_CHARACTER: Array<[string, string]> = [
  [
    "not a git repository",
    "There is no git repository here.\nNo blame, no shame, no history to answer for. Honestly? Must be nice.",
  ],
  [
    "no such path",
    "That file does not exist in HEAD. You are blaming a ghost.\nBold. Ineffective, but bold.",
  ],
  [
    "has only",
    "That line number runs off the end of the file.\nEven your accusations have an off-by-one error.",
  ],
  [
    "does not have any commits",
    "This repository has no commits yet.\nA clean conscience, technically. Come back once you have sinned.",
  ],
  [
    "touched no files",
    "Your last commit touched no files at all.\nThat is its own kind of crime.",
  ],
];

function fail(err: unknown): void {
  const raw = (err as Error)?.message ?? String(err);
  const hit = IN_CHARACTER.find(([needle]) => raw.toLowerCase().includes(needle));
  console.error(
    hit ? chalk.yellow(`\n  ${hit[1].replace(/\n/g, "\n  ")}\n`) : chalk.red(`\n✗ ${raw}`),
  );
  process.exitCode = 1;
}

const shareUrl = (text: string) =>
  `https://x.com/intent/tweet?text=${encodeURIComponent(fit(text, 240))}`;

function copyToClipboard(text: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["pbcopy"]
      : process.platform === "win32"
        ? ["clip"]
        : ["xclip", "-selection", "clipboard"];
  // No clipboard tool installed is not worth crashing a joke over.
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ["pipe", "ignore", "ignore"] });
  child.on("error", () => {});
  child.stdin.end(text);
}

program.parseAsync();
