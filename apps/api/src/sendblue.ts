import { env } from "@caltext/shared";
import SendblueAPI from "sendblue";

const client = new SendblueAPI({
  apiKey: env.SENDBLUE_API_KEY,
  apiSecret: env.SENDBLUE_API_SECRET,
});

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
