/**
 * Sendblue thread IDs use the format: sendblue:{base64url(from)}:{base64url(contact)}
 * These helpers encode/decode that format so callers don't need to know about it.
 */

export function buildSendblueThreadId(
  fromNumber: string,
  contactNumber: string,
): string {
  const from = Buffer.from(fromNumber).toString("base64url");
  const contact = Buffer.from(contactNumber).toString("base64url");
  return `sendblue:${from}:${contact}`;
}

export function parseSendblueContact(threadId: string): string {
  const parts = threadId.split(":");
  return Buffer.from(parts[2] ?? "", "base64url").toString();
}
