import { openai } from "@ai-sdk/openai";
import { buildDailySummaryPrompt, buildReminderPrompt, buildWeeklyRecapPrompt } from "@caltext/ai";
import {
  getCustomReminderTimes,
  getDailyLog,
  getUser,
  getWeeklyLogs,
  updateStreak,
} from "@caltext/db";
import type { StreakInfo, UserProfile } from "@caltext/shared";
import { decrypt, localDateString } from "@caltext/shared";
import { generateText } from "ai";

export async function loadUser(userId: string): Promise<UserProfile | null> {
  "use step";
  return getUser(userId);
}

export async function loadReminderTimes(userId: string) {
  "use step";
  return getCustomReminderTimes(userId);
}

export async function loadDailyLog(userId: string, timezone: string) {
  "use step";
  const localDate = localDateString(timezone);
  return getDailyLog(userId, localDate);
}

export async function sendMsg(userId: string, text: string) {
  "use step";
  const user = await getUser(userId);
  if (!user) return;
  const rawPhone = await decrypt(user.phone);
  const { default: SendblueAPI } = await import("sendblue");
  const client = new SendblueAPI({
    apiKey: process.env.SENDBLUE_API_KEY!,
    apiSecret: process.env.SENDBLUE_API_SECRET!,
  });
  await client.messages.send({
    number: rawPhone,
    from_number: process.env.SENDBLUE_FROM_NUMBER!,
    content: text,
  });
}

export async function generateReminder(
  mealLabel: string,
  mealEmoji: string,
  locale: string,
  remaining: number,
  userName: string,
): Promise<string> {
  "use step";
  const result = await generateText({
    model: openai("gpt-4.1-mini"),
    system: buildReminderPrompt(locale),
    prompt: `Generate a ${mealLabel} reminder for ${userName}. They have ${remaining} kcal remaining today. Use ${mealEmoji} emoji.`,
  });
  return result.text;
}

export async function generateDailySummary(
  userId: string,
  locale: string,
): Promise<{ text: string; streak: StreakInfo } | null> {
  "use step";
  const user = await getUser(userId);
  if (!user) return null;

  const localDate = localDateString(user.timezone);
  const log = await getDailyLog(userId, localDate);
  if (log.mealCount === 0) return null;

  const updatedStreak = await updateStreak(userId, localDate);

  const mealSummary = log.meals
    .map((m) => {
      const itemNames = m.items.map((i) => i.name).join(" + ");
      return `- ${itemNames}: ${m.totalCalories} kcal`;
    })
    .join("\n");

  const result = await generateText({
    model: openai("gpt-4.1-mini"),
    system: buildDailySummaryPrompt(locale),
    prompt: `Generate daily summary for ${user.name}.
Target: ${user.dailyCalorieTarget} kcal
Meals today:
${mealSummary}
Totals: ${log.calories} kcal, ${Math.round(log.protein)}g protein, ${Math.round(log.carbs)}g carbs, ${Math.round(log.fat)}g fat
Streak: ${updatedStreak.current} days
${log.calories <= user.dailyCalorieTarget ? `${user.dailyCalorieTarget - log.calories} kcal under target` : `${log.calories - user.dailyCalorieTarget} kcal over target`}`,
  });

  return { text: result.text, streak: updatedStreak };
}

export async function generateWeeklyRecap(userId: string, locale: string): Promise<string | null> {
  "use step";
  const user = await getUser(userId);
  if (!user) return null;

  const localDate = localDateString(user.timezone);
  const weeklyLogs = await getWeeklyLogs(userId, localDate, user.timezone);

  const dayLines = weeklyLogs
    .map(({ date, log }) => {
      const ratio = Math.min(log.calories / user.dailyCalorieTarget, 1.5);
      const filled = Math.round(ratio * 14);
      const empty = Math.max(0, 14 - filled);
      const bar = "█".repeat(Math.min(filled, 14)) + "░".repeat(empty);
      const onTarget =
        Math.abs(log.calories - user.dailyCalorieTarget) <= user.dailyCalorieTarget * 0.1;
      const dayName = new Date(date).toLocaleDateString("en-US", {
        weekday: "short",
      });
      return `${dayName}  ${bar} ${log.calories} kcal${onTarget ? " ✓" : ""}`;
    })
    .join("\n");

  const avgCalories = Math.round(weeklyLogs.reduce((s, d) => s + d.log.calories, 0) / 7);
  const avgProtein = Math.round(weeklyLogs.reduce((s, d) => s + d.log.protein, 0) / 7);
  const daysOnTarget = weeklyLogs.filter(
    ({ log }) => Math.abs(log.calories - user.dailyCalorieTarget) <= user.dailyCalorieTarget * 0.1,
  ).length;

  const result = await generateText({
    model: openai("gpt-4.1-mini"),
    system: buildWeeklyRecapPrompt(locale),
    prompt: `Generate weekly recap for ${user.name}.
Target: ${user.dailyCalorieTarget} kcal/day
Daily breakdown:
${dayLines}
Average: ${avgCalories} kcal/day, ${avgProtein}g protein/day
Days on target: ${daysOnTarget}/7`,
  });

  return result.text;
}
