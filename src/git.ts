import { simpleGit } from "simple-git";

const git = simpleGit();

export interface BlameInfo {
  author: string;
  /** Commit date as YYYY-MM-DD (UTC). */
  date: string;
  /** The exact source line that was blamed. */
  line: string;
}

/** Current local git user name (`git config user.name`), or "" if unset. */
export async function currentUserName(): Promise<string> {
  return (await git.raw(["config", "user.name"])).trim();
}

/**
 * Blame a single line and return author, date and the code itself.
 * Throws if the file/line does not exist (simple-git surfaces git's stderr).
 */
export async function blameLine(filepath: string, lineNumber: number): Promise<BlameInfo> {
  const raw = await git.raw([
    "blame",
    "-L",
    `${lineNumber},${lineNumber}`,
    "--porcelain",
    "--",
    filepath,
  ]);
  return parseBlamePorcelain(raw);
}

/**
 * Parse `git blame --porcelain` output for a single line.
 * Porcelain format: a header line, then `key value` metadata lines,
 * then the source line prefixed with a tab.
 */
export function parseBlamePorcelain(raw: string): BlameInfo {
  const lines = raw.split("\n");
  let author = "Unknown";
  let epoch = 0;
  let code = "";

  for (const l of lines) {
    if (l.startsWith("author ")) author = l.slice("author ".length);
    else if (l.startsWith("author-time ")) epoch = Number(l.slice("author-time ".length));
    else if (l.startsWith("\t")) code = l.slice(1);
  }

  const date = epoch
    ? new Date(epoch * 1000).toISOString().slice(0, 10)
    : "an unknown date";

  return { author, date, line: code };
}
