import type { OnboardingState } from "@caltext/shared";
import { getRedis } from "./client";

const onboardingKey = (userId: string) => `onboarding:${userId}`;
const TTL_24H = 60 * 60 * 24;

export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(onboardingKey(userId));
  if (!data?.step) return null;
  return {
    step: data.step as OnboardingState["step"],
    name: data.name,
    timezone: data.timezone,
    sex: data.sex as OnboardingState["sex"],
    age: data.age ? parseInt(data.age, 10) : undefined,
    heightCm: data.heightCm ? parseFloat(data.heightCm) : undefined,
    weightKg: data.weightKg ? parseFloat(data.weightKg) : undefined,
    goal: data.goal as OnboardingState["goal"],
    activity: data.activity as OnboardingState["activity"],
    calculatedTarget: data.calculatedTarget ? parseInt(data.calculatedTarget, 10) : undefined,
    webhookUrl: data.webhookUrl,
  };
}

export async function setOnboardingState(
  userId: string,
  state: Partial<OnboardingState>,
): Promise<void> {
  const redis = getRedis();
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(state)) {
    if (v !== undefined) flat[k] = String(v);
  }
  await redis.hset(onboardingKey(userId), flat);
  await redis.expire(onboardingKey(userId), TTL_24H);
}

export async function deleteOnboardingState(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(onboardingKey(userId));
}
