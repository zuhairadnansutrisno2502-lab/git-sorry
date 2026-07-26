#!/usr/bin/env node
import boxen from "boxen";
import chalk from "chalk";
import { Command } from "commander";
import { CONFIG_PATH, loadConfig, saveConfig } from "./config.js";
import { blameLine, currentUserName } from "./git.js";
import { buildPrompt, generateMessage } from "./gemini.js";
import { broadcast } from "./webhook.js";

const program = new Command();

program
  .name("git-sorry")
  .description("Blame a developer for a bad line, then let Gemini apologize or roast them — and broadcast it to your team.")
  .version("1.0.0");

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

program
  .command("blame")
  .description("Blame a line of code and broadcast a dramatic apology or roast.")
  .argument("<filepath>", "path to the file")
  .argument("<line_number>", "line number to blame")
  .action(async (filepath: string, lineArg: string) => {
    try {
      await runBlame(filepath, lineArg);
    } catch (err) {
      console.error(chalk.red(`\n✗ ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });

async function runBlame(filepath: string, lineArg: string): Promise<void> {
  const lineNumber = Number(lineArg);
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    throw new Error(`Invalid line number: "${lineArg}". Give a positive integer.`);
  }

  // Step A: config present?
  const { geminiApiKey, webhookUrl } = await loadConfig();
  if (!geminiApiKey || !webhookUrl) {
    const missing = [!geminiApiKey && "Gemini API key", !webhookUrl && "webhook URL"]
      .filter(Boolean)
      .join(" and ");
    throw new Error(
      `Missing ${missing}. Set them first:\n` +
        chalk.cyan("  git-sorry config --set-key <GEMINI_API_KEY>\n") +
        chalk.cyan("  git-sorry config --set-webhook <URL>"),
    );
  }

  // Steps B + C: current user and blame info.
  const [me, blame] = await Promise.all([
    currentUserName(),
    blameLine(filepath, lineNumber),
  ]);

  // Step D: is the culprit me?
  const isSelf = me !== "" && me === blame.author;
  console.log(
    chalk.dim(
      `Blamed ${chalk.bold(blame.author)} (${blame.date}) — ` +
        (isSelf ? "that's you. Time to apologize." : "time for a call-out."),
    ),
  );

  // Step E: ask Gemini.
  console.log(chalk.dim("Summoning Gemini..."));
  const message = await generateMessage(geminiApiKey, buildPrompt(me, blame, isSelf));

  // Step F: pretty output.
  console.log(
    boxen(chalk.whiteBright(message), {
      title: isSelf ? "🙏 A Humble Apology" : "🔥 A Formal Roast",
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: isSelf ? "yellow" : "red",
    }),
  );

  // Step G: broadcast.
  await broadcast(webhookUrl, message);

  // Step H: confirm.
  console.log(chalk.green("✓ Broadcast to your team."));
}

program.parseAsync();
