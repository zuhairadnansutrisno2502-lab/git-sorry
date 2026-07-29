import { simpleGit } from "simple-git";

const git = simpleGit();

export interface BlameInfo {
  author: string;
  /** Commit date as YYYY-MM-DD (UTC). */
  date: string;
  /** The exact source line that was blamed. */
  line: string;
  /** Commit the line came from, for looking up its message and hour. */
  sha: string;
}

export interface Target {
  file: string;
  lineNumber: number;
}

/** Current local git user name (`git config user.name`), or "" if unset. */
export async function currentUserName(): Promise<string> {
  return (await git.raw(["config", "user.name"]).catch(() => "")).trim();
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

  const date = epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : "an unknown date";
  const sha = /^([0-9a-f]{7,40}) /.exec(lines[0] ?? "")?.[1] ?? "";

  return { author, date, line: code, sha };
}

/** Whole days between a commit date and now; "" when the date is unknown. */
export function ageInDays(date: string): string {
  const then = Date.parse(date);
  if (Number.isNaN(then)) return "";
  return String(Math.max(0, Math.floor((Date.now() - then) / 86_400_000)));
}

/** "1 day" / "12 days" / "today", so the jokes read like a person wrote them. */
export function agePhrase(date: string): string {
  const days = ageInDays(date);
  if (days === "") return "";
  if (days === "0") return "today";
  return `${days} day${days === "1" ? "" : "s"} ago`;
}

/**
 * The context the jokes draw on. Every lookup degrades to "" rather than
 * throwing: a missing commit message should cost one template, not the run.
 */
export async function context(sha: string): Promise<Record<string, string>> {
  const show = (fmt: string) =>
    sha
      ? git.raw(["show", "-s", `--format=${fmt}`, "--date=format:%H:%M", sha]).catch(() => "")
      : Promise.resolve("");

  const [branch, dirty, commitMsg, hour, weekday] = await Promise.all([
    git.raw(["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
    git.raw(["status", "--porcelain"]).catch(() => ""),
    show("%s"),
    show("%ad"),
    sha
      ? git.raw(["show", "-s", "--format=%ad", "--date=format:%A", sha]).catch(() => "")
      : Promise.resolve(""),
  ]);

  const changed = dirty.trim();
  return {
    branch: branch.trim(),
    dirtyCount: String(changed ? changed.split("\n").length : 0),
    commitMsg: commitMsg.trim(),
    hour: hour.trim(),
    weekday: weekday.trim(),
  };
}

// Cheap comedic-potential heuristic.
// ponytail: a regex sweep over one file beats a real parser here; swap in an
// AST walk only if the picks start landing on boring lines.
// Charges are written lowercase so they read correctly inside a sentence
// ("...and chose a nested ternary"). The evidence box capitalises its own.
const SMELLS: Array<[RegExp, number, string]> = [
  [/\beval\s*\(/, 70, "calling eval() on purpose"],
  [/catch\s*\([^)]*\)\s*\{\s*\}/, 65, "an empty catch block"],
  [/\bFIXME\b/i, 60, "a FIXME, still unfixed"],
  [/\bHACK\b|\bXXX\b/i, 55, "admitting in writing that it was a hack"],
  [/\bTODO\b/i, 50, "leaving a TODO in production"],
  [/@ts-(ignore|expect-error)/, 45, "silencing the type checker"],
  [/:\s*any\b/, 40, "reaching for `any` in a TypeScript file"],
  [/console\.(log|debug)\s*\(/, 35, "leaving a console.log behind"],
  [/[!=]=\s*null\b/, 30, "loose equality against null"],
  [/\bvar\s+\w/, 25, "using var, in this economy"],
];

const isTernary = (line: string) => (line.match(/\?/g)?.length ?? 0) >= 2 && line.includes(":");

/** Score a line for how funny it would be to put on trial. */
export function score(line: string): number {
  const smell = SMELLS.reduce((sum, [re, weight]) => sum + (re.test(line) ? weight : 0), 0);
  const nesting = (line.match(/[({[]/g)?.length ?? 0) * 3;
  return smell + (isTernary(line) ? 45 : 0) + nesting + Math.min(line.length, 200) / 10;
}

/** Name the offence, lowercase, for use mid-sentence. */
export function charge(line: string): string {
  const trimmed = line.trim();
  if (isTernary(trimmed)) return "a nested ternary";
  const hit = SMELLS.find(([re]) => re.test(trimmed));
  if (hit) return hit[2];
  if (trimmed.length > 120) return `a single line ${trimmed.length} characters long`;
  return "general crimes against readability";
}

// Prose has no bugs to answer for. A README heading called "Hack on it" is not
// a code smell, so only real source files are eligible for an automatic pick.
const CODE = /\.(m?[jt]sx?|py|go|rs|rb|java|kt|swift|scala|c|cc|cpp|h|hpp|cs|php|sh|sql|vue|svelte)$/i;

/** The most recent source files, newest first. Falls back to anything tracked. */
async function recentCodeFiles(): Promise<string[]> {
  const files = await recentFiles(20);
  if (!files.length) throw new Error("Your recent commits touched no files. Suspicious in itself.");
  const code = files.filter((f) => CODE.test(f));
  return code.length ? code : files;
}

/** Highest-scoring line in a file, as a 1-based line number. */
async function worstIn(file: string): Promise<{ target: Target; score: number }> {
  const body = (await git.raw(["show", `HEAD:${file}`]).catch(() => "")).split("\n");
  const best = body.reduce((b, line, i) => (score(line) > score(body[b]) ? i : b), 0);
  return { target: { file, lineNumber: best + 1 }, score: score(body[best] ?? "") };
}

/**
 * Pick the line most worth blaming: the highest-scoring one in `file`, or the
 * worst across the few most recently touched source files when none is given.
 */
export async function worstLine(file?: string): Promise<Target> {
  if (file) return (await worstIn(file)).target;
  // ponytail: three files is enough to find something embarrassing; widen only
  // if the picks get repetitive.
  const candidates = await Promise.all((await recentCodeFiles()).slice(0, 3).map(worstIn));
  return candidates.reduce((a, b) => (b.score > a.score ? b : a)).target;
}

/** Files touched by the last `count` commits, most recent first, deduped. */
export async function recentFiles(count: number): Promise<string[]> {
  const out = await git.raw(["log", `-${count}`, "--name-only", "--pretty=", "--diff-filter=d"]);
  return [...new Set(out.split("\n").map((s) => s.trim()).filter(Boolean))];
}

export interface ShameRow {
  author: string;
  count: number;
  worst: string;
  file: string;
}

/**
 * Per-author tally of smelly lines across `files`, worst offender first.
 * Only source files are swept: blaming a PNG scores its binary as 300 crimes.
 */
export async function hallOfShame(files: string[]): Promise<ShameRow[]> {
  const tally = new Map<string, ShameRow & { top: number }>();

  for (const file of files.filter((f) => CODE.test(f))) {
    const raw = await git.raw(["blame", "--line-porcelain", "--", file]).catch(() => "");
    let author = "";
    for (const l of raw.split("\n")) {
      if (l.startsWith("author ")) author = l.slice("author ".length);
      else if (l.startsWith("\t")) {
        const code = l.slice(1);
        const s = score(code);
        // Only real smells count; line length alone would convict everybody.
        // "Not Committed Yet" is git's placeholder for your own dirty tree.
        if (s < 40 || !author || author === "Not Committed Yet") continue;
        const row = tally.get(author) ?? { author, count: 0, worst: "", file: "", top: 0 };
        row.count++;
        if (s > row.top) {
          row.top = s;
          row.worst = code.trim();
          row.file = file;
        }
        tally.set(author, row);
      }
    }
  }

  return [...tally.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ top: _top, ...row }) => row);
}
