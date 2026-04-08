import { getRedis } from "./client.js";
import type { StreakInfo } from "@caltext/shared";

const streakKey = (phone: string) => `streak:${phone}`;

export async function getStreak(phone: string): Promise<StreakInfo> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(streakKey(phone));
  return {
    current: parseInt(data?.current ?? "0", 10),
    longest: parseInt(data?.longest ?? "0", 10),
    lastLogDate: data?.lastLogDate ?? "",
  };
}

export async function updateStreak(phone: string, todayLocalDate: string): Promise<StreakInfo> {
  const redis = getRedis();
  const streak = await getStreak(phone);

  if (streak.lastLogDate === todayLocalDate) {
    return streak;
  }

  const yesterday = new Date(todayLocalDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0]!;

  let newCurrent: number;
  if (streak.lastLogDate === yesterdayStr) {
    newCurrent = streak.current + 1;
  } else {
    newCurrent = 1;
  }

  const newLongest = Math.max(streak.longest, newCurrent);

  await redis.hset(streakKey(phone), {
    current: String(newCurrent),
    longest: String(newLongest),
    lastLogDate: todayLocalDate,
  });

  return { current: newCurrent, longest: newLongest, lastLogDate: todayLocalDate };
}
