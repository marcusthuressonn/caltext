import { getRedis } from "./client";

const messagesKey = (userId: string) => `messages:${userId}`;

const MAX_CONVERSATION_TURNS = 20;

export async function saveConversationMessages(userId: string, messages: unknown[]): Promise<void> {
  const redis = getRedis();
  await redis.set(messagesKey(userId), JSON.stringify(messages.slice(-MAX_CONVERSATION_TURNS)));
}

export async function getConversationMessages(userId: string): Promise<unknown[]> {
  const redis = getRedis();
  const raw = await redis.get<string>(messagesKey(userId));
  if (!raw) return [];
  return JSON.parse(raw) as unknown[];
}

export async function deleteAllMessages(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(messagesKey(userId));
}
