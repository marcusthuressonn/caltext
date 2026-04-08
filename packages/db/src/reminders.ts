import { getRedis } from "./client.js";

const reminderKey = (phone: string) => `reminder:${phone}`;

export async function setReminderRunId(phone: string, runId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(reminderKey(phone), runId);
}

export async function getReminderRunId(phone: string): Promise<string | null> {
  const redis = getRedis();
  return await redis.get<string>(reminderKey(phone));
}

export async function deleteReminderRunId(phone: string): Promise<void> {
  const redis = getRedis();
  await redis.del(reminderKey(phone));
}
