import { env } from "@caltext/shared";
import SendblueAPI from "sendblue";

const client = new SendblueAPI({
  apiKey: env.SENDBLUE_API_KEY,
  apiSecret: env.SENDBLUE_API_SECRET,
});

// ── Webhook parsing ─────────────────────────────────────

export interface InboundMessage {
  phone: string;
  text: string;
  imageUrl: string | undefined;
  messageId: string | undefined;
}

const SECRET_HEADERS = ["x-webhook-secret", "x-sendblue-signature", "sb-webhook-secret"];

export function parseInbound(headers: Headers, body: unknown): InboundMessage | null {
  const secret = SECRET_HEADERS.reduce<string | null>((v, h) => v ?? headers.get(h), null);
  if (secret && secret !== env.SENDBLUE_WEBHOOK_SECRET) return null;

  const b = body as Record<string, unknown>;
  if (b.is_outbound || b.status !== "RECEIVED") return null;

  const phone = b.number as string | undefined;
  if (!phone) return null;

  const text = (b.content as string) ?? "";
  const imageUrl = (b.media_url as string) || undefined;
  if (!text && !imageUrl) return null;

  return { phone, text, imageUrl, messageId: b.message_handle as string | undefined };
}

// ── Outbound API calls ─────────────────────────────────

export async function sendMessage(phone: string, text: string): Promise<void> {
  await client.messages.send({
    number: phone,
    from_number: env.SENDBLUE_FROM_NUMBER,
    content: text,
  });
}

export async function sendTyping(phone: string): Promise<void> {
  try {
    await client.typingIndicators.send({
      number: phone,
      from_number: env.SENDBLUE_FROM_NUMBER,
    });
  } catch {
    // typing indicator failures are not critical
  }
}

export async function markRead(phone: string): Promise<void> {
  try {
    await fetch("https://api.sendblue.com/api/mark-read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": env.SENDBLUE_API_KEY,
        "sb-api-secret-key": env.SENDBLUE_API_SECRET,
      },
      body: JSON.stringify({
        number: phone,
        from_number: env.SENDBLUE_FROM_NUMBER,
      }),
    });
  } catch {
    // read receipt failures are not critical
  }
}
