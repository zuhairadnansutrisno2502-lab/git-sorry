import { GoogleGenAI } from "@google/genai";
import type { BlameInfo } from "./git.js";

/** Build the prompt: a self-apology if you blamed yourself, a roast otherwise. */
export function buildPrompt(currentUser: string, blame: BlameInfo, isSelf: boolean): string {
  const shared =
    `The offending line of code is:\n\n    ${blame.line}\n\n` +
    `It was committed by "${blame.author}" on ${blame.date}.\n` +
    `Write in English. Keep it under 120 words. Return only the message, no preamble.`;

  if (isSelf) {
    return (
      `You are a theatrical Shakespearean playwright. Write a wildly dramatic, ` +
      `pathetic, over-the-top apology in which "${currentUser}" grovels and begs ` +
      `forgiveness for personally writing this terrible line of code.\n\n${shared}`
    );
  }
  return (
    `You are a witty, passive-aggressive stand-up comedian. Write a hilarious, ` +
    `theatrical "call out" that roasts "${blame.author}" for their code crime and ` +
    `dramatically demands an explanation. The message is from "${currentUser}", who ` +
    `just discovered the mess.\n\n${shared}`
  );
}

/** Overload, rate limit and network blips are worth another go; a bad key never is. */
export function isTransient(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err);
  return /\b(429|500|502|503|504)\b|overloaded|unavailable|timed? ?out|ECONNRESET|ENOTFOUND|fetch failed/i.test(msg);
}

const RETRY_DELAYS_MS = [500, 1500];

/** Generate the message with Gemini, retrying transient failures. Throws otherwise. */
export async function generateMessage(apiKey: string, prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
      const text = result.text?.trim();
      if (!text) {
        // A roast now and then trips the safety filter, which comes back with no text.
        throw new Error("Gemini returned an empty message (the request may have been blocked). Try again.");
      }
      return text;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransient(err)) {
        throw new Error(`Gemini request failed: ${cleanApiError(err)}`);
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/** The SDK stuffs the whole API JSON into the error message; pull out just the human line. */
function cleanApiError(err: unknown): string {
  const raw = (err as Error)?.message ?? String(err);
  try {
    return JSON.parse(raw).error?.message ?? raw;
  } catch {
    return raw;
  }
}
