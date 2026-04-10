import { getRedis } from "./client";

const messagesKey = (userId: string) => `messages:${userId}`;

const MAX_CONVERSATION_MESSAGES = 40;
const TTL_30_DAYS = 60 * 60 * 24 * 30;

export async function saveConversationMessages(userId: string, messages: unknown[]): Promise<void> {
  const redis = getRedis();
  await redis.set(
    messagesKey(userId),
    JSON.stringify(messages.slice(-MAX_CONVERSATION_MESSAGES)),
    { ex: TTL_30_DAYS },
  );
}

export async function getConversationMessages(userId: string): Promise<unknown[]> {
  const redis = getRedis();
  const raw = await redis.get(messagesKey(userId));
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return JSON.parse(raw) as unknown[];
  return [];
}

export async function deleteAllMessages(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(messagesKey(userId));
}
