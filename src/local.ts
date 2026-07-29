import { createRequire } from "node:module";

// A plain JSON file so anyone can add a joke without reading TypeScript.
const lines = createRequire(import.meta.url)("../lines.json") as {
  roast: string[];
  apology: string[];
};

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Pick a canned verdict and fill it in from the git context.
 * Templates naming a placeholder we have no real value for are skipped, so a
 * clean tree never gets "you have 0 uncommitted files".
 */
export function localMessage(ctx: Record<string, string>, isSelf: boolean): string {
  const pool = isSelf ? lines.apology : lines.roast;
  const usable = pool.filter((t) =>
    [...t.matchAll(PLACEHOLDER)].every(([, key]) => ctx[key] && ctx[key] !== "0"),
  );
  const from = usable.length ? usable : pool;
  const pick = from[Math.floor(Math.random() * from.length)];
  return pick.replace(PLACEHOLDER, (_, key: string) => ctx[key] || "something unspeakable");
}

/** How many verdicts ship in the box, for the footer nudge. */
export const jokeCount = lines.roast.length + lines.apology.length;
