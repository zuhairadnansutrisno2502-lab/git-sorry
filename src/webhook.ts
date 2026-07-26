/**
 * Broadcast the message to a Slack or Discord incoming webhook.
 * Slack reads `text`, Discord reads `content`; each ignores the other key,
 * so one payload works for both. Throws on non-2xx or network failure.
 */
export async function broadcast(url: string, message: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, content: message }),
  });
  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status} ${res.statusText}`);
  }
}
