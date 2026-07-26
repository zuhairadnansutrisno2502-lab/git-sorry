import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// A single JSON file in the home dir is enough for a couple of settings, so no config library.
const CONFIG_DIR = join(homedir(), ".git-sorry");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface Config {
  geminiApiKey?: string;
  webhookUrl?: string;
}

export async function loadConfig(): Promise<Config> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as Config;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function saveConfig(patch: Partial<Config>): Promise<void> {
  const config = { ...(await loadConfig()), ...patch };
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  // The file holds an API key and webhook URL, so keep it readable by the owner only.
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export { CONFIG_PATH };
