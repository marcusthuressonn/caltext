import { Chat } from "chat";
import {
  getUser, getDailyLog, recallAllMemories, getStreak,
} from "@caltext/db";
import {
  createCaltextAgent, buildSystemPrompt,
} from "@caltext/ai";
import {
  localDateString, getLocaleName,
} from "@caltext/shared";
import type { AgentContext } from "@caltext/shared";
import type { UserModelMessage } from "ai";

async function loadContext(phone: string) {
  "use step";
  const user = await getUser(phone);
  if (!user) throw new Error(`User not found: ${phone}`);

  const localDate = localDateString(user.timezone);
  const [memories, streak, todayLog] = await Promise.all([
    recallAllMemories(phone),
    getStreak(phone),
    getDailyLog(phone, localDate),
  ]);

  const ctx: AgentContext = {
    phone,
    userName: user.name,
    localeName: getLocaleName(user.locale),
    locale: user.locale,
    timezone: user.timezone,
    dailyCalorieTarget: user.dailyCalorieTarget,
    userProfile: user,
    memories: Object.keys(memories).length > 0 ? memories : null,
    todayLog: todayLog.mealCount > 0 ? todayLog : null,
    streak: streak.current > 0 ? streak.current : null,
  };

  return ctx;
}

async function runAgent(systemPrompt: string, userMessage: string, imageUrl?: string) {
  "use step";
  const agent = createCaltextAgent(systemPrompt);

  if (imageUrl) {
    const userMsg: UserModelMessage = {
      role: "user",
      content: [
        { type: "image", image: new URL(imageUrl) },
        { type: "text", text: userMessage },
      ],
    };
    const result = await agent.generate({ prompt: [userMsg] });
    return result.text;
  }

  const result = await agent.generate({ prompt: userMessage });
  return result.text;
}

async function sendReply(phone: string, text: string) {
  "use step";
  const bot = Chat.getSingleton();
  const dm = await bot.openDM(`sendblue:${phone}`);
  await dm.post(text);
}

export async function handleMessage(phone: string, text: string, imageUrl?: string) {
  "use workflow";

  const ctx = await loadContext(phone);
  const systemPrompt = buildSystemPrompt(ctx);

  const userMessage = imageUrl
    ? `${text}\n\n[The user sent a food photo. Use identifyFood with imageUrl "${imageUrl}" to analyze it, then lookupNutrition for each item, then logMeal to save. My phone is ${phone} and timezone is ${ctx.timezone}.]`
    : `${text}\n\n[My phone is ${phone} and timezone is ${ctx.timezone}. Today's date is ${localDateString(ctx.timezone)}.]`;

  const reply = await runAgent(systemPrompt, userMessage, imageUrl);

  if (reply) {
    await sendReply(phone, reply);
  }
}
