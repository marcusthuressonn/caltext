import type { ModelMessage } from "@caltext/ai";
import { buildSystemPrompt, createCaltextAgent } from "@caltext/ai";
import {
  getConversationMessages,
  getDailyLog,
  getStreak,
  getUser,
  getWaterLog,
  recallAllMemories,
  saveConversationMessages,
} from "@caltext/db";
import type { AgentContext } from "@caltext/shared";
import { decrypt, getLocaleName, localDateString } from "@caltext/shared";
import { Chat } from "chat";

async function loadContext(userId: string) {
  "use step";
  const user = await getUser(userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  const localDate = localDateString(user.timezone);
  const [memories, streak, todayLog, todayWater] = await Promise.all([
    recallAllMemories(userId),
    getStreak(userId),
    getDailyLog(userId, localDate),
    getWaterLog(userId, localDate),
  ]);

  const ctx: AgentContext = {
    userId,
    userName: user.name,
    localeName: getLocaleName(user.locale),
    locale: user.locale,
    timezone: user.timezone,
    dailyCalorieTarget: user.dailyCalorieTarget,
    userProfile: user,
    memories: Object.keys(memories).length > 0 ? memories : null,
    todayLog: todayLog.mealCount > 0 ? todayLog : null,
    streak: streak.current > 0 ? streak.current : null,
    todayWater: todayWater.totalMl > 0 ? todayWater : null,
  };

  return ctx;
}

async function runAgent(
  systemPrompt: string,
  conversationHistory: ModelMessage[],
  currentMessage: ModelMessage,
  securityCtx: { userId: string; timezone: string },
) {
  "use step";
  const agent = createCaltextAgent(systemPrompt, securityCtx);

  const messages: ModelMessage[] = [...conversationHistory, currentMessage];
  const result = await agent.generate({ messages });

  return {
    text: result.text,
    responseMessages: result.response.messages as ModelMessage[],
  };
}

async function sendReply(userId: string, text: string) {
  "use step";
  const user = await getUser(userId);
  if (!user) return;
  const rawPhone = await decrypt(user.phone);
  const bot = Chat.getSingleton();
  const dm = await bot.openDM(`sendblue:${rawPhone}`);
  await dm.post(text);
}

function buildUserMessage(
  text: string,
  imageUrl?: string,
  userId?: string,
  timezone?: string,
): ModelMessage {
  const contextNote = `\n\n[userId is ${userId} and timezone is ${timezone}.]`;

  if (imageUrl) {
    return {
      role: "user",
      content: [
        { type: "image", image: new URL(imageUrl) },
        {
          type: "text",
          text: `${text}${contextNote} Use identifyFood with imageUrl "${imageUrl}" to analyze it.`,
        },
      ],
    };
  }

  return {
    role: "user",
    content: `${text}${contextNote}`,
  };
}

export async function handleMessage(userId: string, text: string, imageUrl?: string) {
  "use workflow";

  const ctx = await loadContext(userId);
  const systemPrompt = buildSystemPrompt(ctx);
  const conversationHistory = (await getConversationMessages(userId)) as ModelMessage[];

  const userMessage = buildUserMessage(text, imageUrl, userId, ctx.timezone);

  const { text: reply, responseMessages } = await runAgent(
    systemPrompt,
    conversationHistory,
    userMessage,
    { userId, timezone: ctx.timezone },
  );

  const updatedHistory = [...conversationHistory, userMessage, ...responseMessages];
  await saveConversationMessages(userId, updatedHistory);

  if (reply) {
    await sendReply(userId, reply);
  }
}
