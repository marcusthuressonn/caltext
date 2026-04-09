import { encrypt } from "@caltext/shared";
import type { Message, Thread } from "chat";
import { Hono } from "hono";
import bot from "./bot";
import { routeMessage } from "./router";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "caltext" }));

app.post("/webhooks/sendblue", async (c) => {
  return bot.webhooks.sendblue(c.req.raw);
});

async function handleIncoming(thread: Thread, message: Message) {
  const rawPhone = thread.id.split(":")[1] ?? "";
  const encryptedPhone = await encrypt(rawPhone);
  const text = message.text ?? "";
  const imageUrl = message.attachments?.[0]?.url;

  await thread.startTyping();

  try {
    const result = await routeMessage(encryptedPhone, text, imageUrl);
    if (!result.startsWith("__")) {
      await thread.post(result);
    }
  } catch (error) {
    console.error("Error routing message:", error);
    await thread.post("Oops, something went wrong. Try again in a sec! 🙏");
  }
}

bot.onDirectMessage(async (thread, message) => {
  await thread.subscribe();
  await handleIncoming(thread, message);
});

bot.onSubscribedMessage(async (thread, message) => {
  if (message.author?.isBot) return;
  await handleIncoming(thread, message);
});

export default app;
