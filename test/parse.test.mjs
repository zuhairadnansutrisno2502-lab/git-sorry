import assert from "node:assert/strict";
import { test } from "node:test";
import { agePhrase, charge, parseBlamePorcelain, score } from "../dist/git.js";
import { buildPrompt, isTransient } from "../dist/gemini.js";
import { localMessage } from "../dist/local.js";

test("parses author, date, code and sha from porcelain blame", () => {
  // 2021-01-01T00:00:00Z == epoch 1609459200
  const raw =
    "a1b2c3d4e5f6 1 1 1\n" +
    "author Jane Doe\n" +
    "author-mail <jane@example.com>\n" +
    "author-time 1609459200\n" +
    "author-tz +0000\n" +
    "summary oops\n" +
    "\tconst x = eval(userInput);\n";
  const info = parseBlamePorcelain(raw);
  assert.equal(info.author, "Jane Doe");
  assert.equal(info.date, "2021-01-01");
  assert.equal(info.line, "const x = eval(userInput);");
  assert.equal(info.sha, "a1b2c3d4e5f6");
});

test("falls back gracefully when metadata is missing", () => {
  const info = parseBlamePorcelain("garbage\n\tsome code\n");
  assert.equal(info.author, "Unknown");
  assert.equal(info.date, "an unknown date");
  assert.equal(info.line, "some code");
  assert.equal(info.sha, "");
});

test("age reads like a person wrote it, singular included", () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  assert.equal(agePhrase(daysAgo(0)), "today");
  assert.equal(agePhrase(daysAgo(1)), "1 day ago");
  assert.equal(agePhrase(daysAgo(12)), "12 days ago");
  assert.equal(agePhrase("an unknown date"), "");
});

test("the charge names the actual offence", () => {
  assert.equal(charge("a ? b ? 1 : 2 : 3"), "a nested ternary");
  assert.equal(charge("  // TODO: fix this properly"), "leaving a TODO in production");
  assert.equal(charge("const x = eval(s);"), "calling eval() on purpose");
  assert.equal(charge("try { risky(); } catch (e) {}"), "an empty catch block");
  assert.match(charge(`const s = "${"x".repeat(130)}";`), /^a single line \d+ characters long$/);
  assert.equal(charge("const total = a + b;"), "general crimes against readability");
});

test("charges stay lowercase so they read inside a sentence", () => {
  // "...and chose Calling eval() on purpose" is the bug this guards against.
  for (const line of ["a ? b ? 1 : 2 : 3", "eval(s)", "// TODO", "const t = a + b;"]) {
    assert.match(charge(line), /^[a-z]/);
  }
});

test("smelly lines outrank innocent ones", () => {
  assert.ok(score("const x = eval(userInput); // HACK") > score("const total = a + b;"));
  assert.ok(score("a ? b ? 1 : 2 : 3") > score("return a;"));
});

test("a filled verdict leaves no placeholder behind", () => {
  const ctx = {
    author: "Jane",
    file: "src/a.ts",
    line: "42",
    code: "eval(x)",
    charge: "calling eval() on purpose",
    age: "3 days ago",
    days: "3",
    date: "2021-01-01",
    commitMsg: "quick fix",
    hour: "02:47",
    weekday: "Tuesday",
    branch: "main",
    dirtyCount: "4",
  };
  for (const isSelf of [true, false]) {
    for (let i = 0; i < 40; i++) {
      assert.doesNotMatch(localMessage(ctx, isSelf), /\{\{/);
    }
  }
});

test("templates naming absent context are skipped, not left blank", () => {
  // A clean tree must never produce "you have 0 uncommitted files".
  const sparse = { author: "Jane", charge: "a nested ternary", line: "7", dirtyCount: "0" };
  for (let i = 0; i < 40; i++) {
    const msg = localMessage(sparse, false);
    assert.doesNotMatch(msg, /\{\{/);
    assert.doesNotMatch(msg, /\b0 uncommitted\b/);
  }
});

const blame = { author: "Jane", date: "2021-01-01", line: "eval(x)", sha: "abc1234" };

test("apology prompt grovels; roast prompt calls out", () => {
  assert.match(buildPrompt("Me", blame, true), /apology/i);
  assert.match(buildPrompt("Me", blame, false), /roast/i);
});

test("the real commit message and hour reach the prompt", () => {
  const prompt = buildPrompt("Me", blame, false, {
    commitMsg: "quick fix, will refactor later",
    hour: "02:47",
    weekday: "Tuesday",
  });
  assert.match(prompt, /quick fix, will refactor later/);
  assert.match(prompt, /02:47 on a Tuesday/);
  // Absent context must not leave a dangling sentence behind.
  assert.doesNotMatch(buildPrompt("Me", blame, false), /committed at \./i);
});

test("retries overload and network blips, but never a bad key", () => {
  assert.ok(isTransient(new Error("503 The model is overloaded")));
  assert.ok(isTransient(new Error("fetch failed")));
  assert.ok(!isTransient(new Error("API key not valid. Please pass a valid API key.")));
});
