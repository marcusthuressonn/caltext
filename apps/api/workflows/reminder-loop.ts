import { sleep } from "workflow";
import { Chat } from "chat";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  getUser, getDailyLog, getStreak, updateStreak, getWeeklyLogs,
} from "@caltext/db";
import {
  nextLocalTime, msUntil, localDateString, isDayOfWeek,
  MEAL_TIMES, DAILY_SUMMARY_HOUR, WEEKLY_RECAP_HOUR, WEEKLY_RECAP_DAY,
  STREAK_MILESTONES,
} from "@caltext/shared";
import type { StreakInfo } from "@caltext/shared";
import {
  buildReminderPrompt, buildDailySummaryPrompt, buildWeeklyRecapPrompt,
} from "@caltext/ai";

async function sendMsg(phone: string, text: string) {
  "use step";
  const bot = Chat.getSingleton();
  const dm = await bot.openDM(`sendblue:${phone}`);
  await dm.post(text);
}

async function generateReminder(
  _phone: string,
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

async function generateDailySummary(
  phone: string,
  locale: string,
): Promise<{ text: string; streak: StreakInfo } | null> {
  "use step";
  const user = await getUser(phone);
  if (!user) return null;

  const localDate = localDateString(user.timezone);
  const log = await getDailyLog(phone, localDate);
  if (log.mealCount === 0) return null;

  const updatedStreak = await updateStreak(phone, localDate);

  const mealSummary = log.meals.map(m => {
    const itemNames = m.items.map(i => i.name).join(" + ");
    return `- ${itemNames}: ${m.totalCalories} kcal`;
  }).join("\n");

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

async function generateWeeklyRecap(phone: string, locale: string): Promise<string | null> {
  "use step";
  const user = await getUser(phone);
  if (!user) return null;

  const localDate = localDateString(user.timezone);
  const weeklyLogs = await getWeeklyLogs(phone, localDate, user.timezone);

  const dayLines = weeklyLogs.map(({ date, log }) => {
    const ratio = Math.min(log.calories / user.dailyCalorieTarget, 1.5);
    const filled = Math.round(ratio * 14);
    const empty = Math.max(0, 14 - filled);
    const bar = "█".repeat(Math.min(filled, 14)) + "░".repeat(empty);
    const onTarget = Math.abs(log.calories - user.dailyCalorieTarget) <= user.dailyCalorieTarget * 0.1;
    const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" });
    return `${dayName}  ${bar} ${log.calories} kcal${onTarget ? " ✓" : ""}`;
  }).join("\n");

  const avgCalories = Math.round(weeklyLogs.reduce((s, d) => s + d.log.calories, 0) / 7);
  const avgProtein = Math.round(weeklyLogs.reduce((s, d) => s + d.log.protein, 0) / 7);
  const daysOnTarget = weeklyLogs.filter(({ log }) =>
    Math.abs(log.calories - user.dailyCalorieTarget) <= user.dailyCalorieTarget * 0.1
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

export async function reminderLoop(phone: string) {
  "use workflow";

  while (true) {
    const user = await getUser(phone);
    if (!user) break;

    const tz = user.timezone;
    const locale = user.locale;

    for (const meal of MEAL_TIMES) {
      const target = nextLocalTime(meal.hour, meal.minute, tz);
      const waitMs = msUntil(target);
      if (waitMs > 0) {
        await sleep(`${waitMs}ms`);
      }

      const localDate = localDateString(tz);
      const log = await getDailyLog(phone, localDate);
      const remaining = Math.max(0, user.dailyCalorieTarget - log.calories);

      const alreadyLogged = log.meals.some(m => {
        const mealHour = new Date(m.timestamp).getHours();
        return Math.abs(mealHour - meal.hour) < 3;
      });

      if (log.mealCount === 0 || !alreadyLogged) {
        const reminder = await generateReminder(phone, meal.label, meal.emoji, locale, remaining, user.name);
        await sendMsg(phone, reminder);
      }
    }

    const summaryTarget = nextLocalTime(DAILY_SUMMARY_HOUR, 0, tz);
    const summaryWait = msUntil(summaryTarget);
    if (summaryWait > 0) {
      await sleep(`${summaryWait}ms`);
    }

    const summaryResult = await generateDailySummary(phone, locale);
    if (summaryResult) {
      await sendMsg(phone, summaryResult.text);

      const milestoneMsg = STREAK_MILESTONES[summaryResult.streak.current];
      if (milestoneMsg) {
        await sendMsg(phone, milestoneMsg);
      }
    }

    if (isDayOfWeek(tz, WEEKLY_RECAP_DAY)) {
      const recapTarget = nextLocalTime(WEEKLY_RECAP_HOUR, 0, tz);
      const recapWait = msUntil(recapTarget);
      if (recapWait > 0) {
        await sleep(`${recapWait}ms`);
      }

      const recap = await generateWeeklyRecap(phone, locale);
      if (recap) {
        await sendMsg(phone, recap);
      }
    }
  }
}
