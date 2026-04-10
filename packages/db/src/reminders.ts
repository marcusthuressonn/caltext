import { getRedis } from "./client";

const reminderKey = (userId: string) => `reminder:${userId}`;
const reminderTimesKey = (userId: string) => `reminder_times:${userId}`;

export interface CustomReminderTime {
  label: string;
  hour: number;
  minute: number;
}

export async function setReminderRunId(userId: string, runId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(reminderKey(userId), runId);
}

export async function getReminderRunId(userId: string): Promise<string | null> {
  const redis = getRedis();
  return await redis.get<string>(reminderKey(userId));
}

export async function deleteReminderRunId(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(reminderKey(userId));
}

export async function setCustomReminderTimes(
  userId: string,
  times: CustomReminderTime[],
): Promise<void> {
  const redis = getRedis();
  await redis.set(reminderTimesKey(userId), JSON.stringify(times));
}

export async function getCustomReminderTimes(userId: string): Promise<CustomReminderTime[] | null> {
  const redis = getRedis();
  const raw = await redis.get(reminderTimesKey(userId));
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as CustomReminderTime[];
  if (typeof raw === "string") return JSON.parse(raw) as CustomReminderTime[];
  return null;
}

export async function deleteCustomReminderTimes(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(reminderTimesKey(userId));
}
