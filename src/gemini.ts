import { GoogleGenerativeAI } from "@google/generative-ai";
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

/** Generate the message with Gemini. Throws on API/auth/network failure. */
export async function generateMessage(apiKey: string, prompt: string): Promise<string> {
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-1.5-flash",
  });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
