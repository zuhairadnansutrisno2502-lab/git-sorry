import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBlamePorcelain } from "../dist/git.js";
import { buildPrompt, isTransient } from "../dist/gemini.js";

test("parses author, date and code from porcelain blame", () => {
  // 2021-01-01T00:00:00Z == epoch 1609459200
  const raw =
    "a1b2c3d4 1 1 1\n" +
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
});

test("falls back gracefully when metadata is missing", () => {
  const info = parseBlamePorcelain("garbage\n\tsome code\n");
  assert.equal(info.author, "Unknown");
  assert.equal(info.date, "an unknown date");
  assert.equal(info.line, "some code");
});

const blame = { author: "Jane", date: "2021-01-01", line: "eval(x)" };

test("apology prompt grovels; roast prompt calls out", () => {
  assert.match(buildPrompt("Me", blame, true), /apology/i);
  assert.match(buildPrompt("Me", blame, false), /roast/i);
});

test("retries overload and network blips, but never a bad key", () => {
  assert.ok(isTransient(new Error("503 The model is overloaded")));
  assert.ok(isTransient(new Error("fetch failed")));
  assert.ok(!isTransient(new Error("API key not valid. Please pass a valid API key.")));
});
