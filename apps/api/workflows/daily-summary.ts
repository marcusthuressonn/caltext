import { Chat } from "chat";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getUser, getDailyLog, updateStreak } from "@caltext/db";
import { localDateString } from "@caltext/shared";
import { buildDailySummaryPrompt } from "@caltext/ai";

async function generateAndSend(phone: string) {
  "use step";
  const user = await getUser(phone);
  if (!user) return;

  const localDate = localDateString(user.timezone);
  const log = await getDailyLog(phone, localDate);
  if (log.mealCount === 0) return;

  const streak = await updateStreak(phone, localDate);

  const mealSummary = log.meals.map(m => {
    const itemNames = m.items.map(i => i.name).join(" + ");
    return `- ${itemNames}: ${m.totalCalories} kcal`;
  }).join("\n");

  const result = await generateText({
    model: openai("gpt-4.1-mini"),
    system: buildDailySummaryPrompt(user.locale),
    prompt: `Generate daily summary for ${user.name}. Target: ${user.dailyCalorieTarget} kcal.
Meals:\n${mealSummary}
Totals: ${log.calories} kcal, ${Math.round(log.protein)}g P, ${Math.round(log.carbs)}g C, ${Math.round(log.fat)}g F
Streak: ${streak.current} days`,
  });

  const bot = Chat.getSingleton();
  const dm = await bot.openDM(`sendblue:${phone}`);
  await dm.post(result.text);
}

export async function dailySummaryWorkflow(phone: string) {
  "use workflow";
  await generateAndSend(phone);
}
