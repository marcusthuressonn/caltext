import { getRedis } from "@caltext/db";
import { encrypt } from "@caltext/shared";
import { createLogger, initLogger, type RequestLogger } from "evlog";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { normalizeImageUrl } from "./image";
import { withLock } from "./lock";
import { routeMessage } from "./router";
import { sendMessage, sendTyping } from "./sendblue";

initLogger({ env: { service: "caltext" } });

async function isDuplicate(messageId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `dedup:${messageId}`;
  const wasNew = await redis.set(key, "1", { nx: true, ex: 300 });
  return !wasNew;
}

const app = new Hono<EvlogVariables>();
app.use(evlog());

interface SendblueWebhook {
  is_outbound: boolean;
  status: string;
  content?: string;
  media_url?: string;
  from_number?: string;
  number?: string;
  message_handle?: string;
}

app.get("/health", (c) => c.json({ status: "ok", service: "caltext" }));

app.post("/webhooks/sendblue", async (c) => {
  const log = c.get("log");
  try {
    const body = await c.req.json<SendblueWebhook>();

    if (body.is_outbound || body.status !== "RECEIVED") {
      return c.json({ ok: true });
    }

    const messageId = body.message_handle;
    if (messageId && (await isDuplicate(messageId))) {
      log.set({ skipped: "duplicate", messageId });
      return c.json({ ok: true });
    }

    const phone = body.number;
    if (!phone) {
      log.set({ skipped: "no_phone" });
      return c.json({ ok: true });
    }

    const text = body.content ?? "";
    const rawImageUrl = body.media_url || undefined;

    if (!text && !rawImageUrl) {
      log.set({ skipped: "empty" });
      return c.json({ ok: true });
    }

    // Fire-and-forget: process message in background so webhook returns quickly
    handleIncoming(phone, text, rawImageUrl);

    return c.json({ ok: true });
  } catch (error) {
    log.error(error as Error);
    return c.json({ error: "webhook failed" }, 500);
  }
});

async function handleIncoming(phone: string, text: string, rawImageUrl?: string) {
  const log: RequestLogger = createLogger({
    scope: "message",
    phone: phone.slice(-4),
  });

  const lockResult = await withLock(phone, async () => {
    try {
      log.set({ input: { text: text.slice(0, 80), hasImage: !!rawImageUrl } });

      const imageUrl = rawImageUrl ? await normalizeImageUrl(rawImageUrl, log) : undefined;

      const encryptedPhone = await encrypt(phone);
      sendTyping(phone);

      const replies = await routeMessage(log, encryptedPhone, text, imageUrl);
      for (const reply of replies) {
        await sendMessage(phone, reply);
      }

      log.set({ output: { replies: replies.length } });
    } catch (error) {
      log.error(error as Error);
      try {
        await sendMessage(phone, "Oops, something went wrong. Try again in a sec! 🙏");
      } catch {
        // swallow send failure for error message
      }
    } finally {
      log.emit();
    }
  });

  if (lockResult === null) {
    log.set({ skipped: "locked" });
    log.emit();
  }
}

export default app;
