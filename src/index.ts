#!/usr/bin/env node
import { createRequire } from "node:module";
import boxen from "boxen";
import chalk from "chalk";
import { Command } from "commander";
import { CONFIG_PATH, loadConfig, saveConfig } from "./config.js";
import { blameLine, currentUserName } from "./git.js";
import { buildPrompt, generateMessage } from "./gemini.js";
import { broadcast } from "./webhook.js";

// Read the version off package.json so it never drifts from the published one.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command();

program
  .name("git-sorry")
  .description("Blame a developer for a bad line, let Gemini apologize or roast them, then broadcast it to your team.")
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
  dryRun?: boolean;
}

program
  .command("blame")
  .description("Blame a line of code and broadcast a dramatic apology or roast.")
  .argument("<filepath>", "path to the file")
  .argument("<line_number>", "line number to blame")
  .option("--roast", "force a roast, whoever wrote the line")
  .option("--apology", "force a grovelling apology")
  .option("--dry-run", "generate and print the message, but don't broadcast it")
  .action(async (filepath: string, lineArg: string, opts: BlameOpts) => {
    try {
      await runBlame(filepath, lineArg, opts);
    } catch (err) {
      console.error(chalk.red(`\n✗ ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });

async function runBlame(filepath: string, lineArg: string, opts: BlameOpts): Promise<void> {
  const lineNumber = Number(lineArg);
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    throw new Error(`Invalid line number: "${lineArg}". Give a positive integer.`);
  }
  if (opts.roast && opts.apology) {
    throw new Error("Pick one: --roast or --apology, not both.");
  }

  // A key is always needed; the webhook only matters when we actually broadcast.
  const { geminiApiKey, webhookUrl } = await loadConfig();
  if (!geminiApiKey) {
    throw new Error(
      "Missing Gemini API key. Set it first:\n" +
        chalk.cyan("  git-sorry config --set-key <GEMINI_API_KEY>"),
    );
  }
  if (!opts.dryRun && !webhookUrl) {
    throw new Error(
      "Missing webhook URL. Set it, or use --dry-run to skip broadcasting:\n" +
        chalk.cyan("  git-sorry config --set-webhook <URL>"),
    );
  }

  // Who's running this, and who's on the hook for the line.
  const [me, blame] = await Promise.all([
    currentUserName(),
    blameLine(filepath, lineNumber),
  ]);

  // --apology / --roast win; otherwise it's an apology only when you blamed yourself.
  const isSelf = opts.apology ? true : opts.roast ? false : me !== "" && me === blame.author;
  console.log(
    chalk.dim(
      `Blamed ${chalk.bold(blame.author)} (${blame.date}). ` +
        (isSelf ? "Time to apologize." : "Time for a call-out."),
    ),
  );

  console.log(chalk.dim("Summoning Gemini..."));
  const message = await generateMessage(geminiApiKey, buildPrompt(me, blame, isSelf));

  console.log(
    boxen(chalk.whiteBright(message), {
      title: isSelf ? "🙏 A Humble Apology" : "🔥 A Formal Roast",
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: isSelf ? "yellow" : "red",
    }),
  );

  if (opts.dryRun) {
    console.log(chalk.dim("Dry run — nothing was broadcast."));
    return;
  }

  await broadcast(webhookUrl!, message);
  console.log(chalk.green("✓ Broadcast to your team."));
}

program.parseAsync();
