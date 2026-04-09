import { openai } from "@ai-sdk/openai";
import {
  createUser,
  deleteOnboardingState,
  setOnboardingState,
  setReminderRunId,
} from "@caltext/db";
import { CONSENT_VERSION, calculateTDEE, decrypt, getTimezoneCity } from "@caltext/shared";
import { generateObject } from "ai";
import { Chat } from "chat";
import { createWebhook } from "workflow";
import { start } from "workflow/api";
import { z } from "zod";
import { reminderLoop } from "./reminder-loop";

async function sendMessage(_userId: string, encryptedPhone: string, text: string) {
  "use step";
  const rawPhone = await decrypt(encryptedPhone);
  const bot = Chat.getSingleton();
  const dm = await bot.openDM(`sendblue:${rawPhone}`);
  await dm.post(text);
}

async function askAndWait(
  userId: string,
  encryptedPhone: string,
  question: string,
): Promise<string> {
  await sendMessage(userId, encryptedPhone, question);
  const webhook = createWebhook();

  await setOnboardingState(userId, { webhookUrl: webhook.url });

  const request = await webhook;
  const body = (await request.json()) as { text?: string };
  return body.text ?? "";
}

const bodyStatsSchema = z.object({
  sex: z.enum(["male", "female"]),
  age: z.number(),
  heightCm: z.number().describe("Height converted to centimeters"),
  weightKg: z.number().describe("Weight converted to kilograms"),
});

type BodyStats = z.infer<typeof bodyStatsSchema>;

async function parseBodyStats(text: string): Promise<BodyStats | null> {
  "use step";
  try {
    const result = await generateObject({
      model: openai("gpt-4.1-mini"),
      schema: bodyStatsSchema,
      prompt: `Extract sex, age, height (in cm), and weight (in kg) from this text. Convert units if needed (inches to cm, lbs to kg, feet to cm). Text: "${text}"`,
    });
    return result.object;
  } catch {
    return null;
  }
}

function parseGoal(text: string): "lose" | "maintain" | "gain" {
  const lower = text.toLowerCase();
  if (
    lower.includes("lose") ||
    lower.includes("cut") ||
    lower.includes("deficit") ||
    lower.includes("less")
  )
    return "lose";
  if (
    lower.includes("gain") ||
    lower.includes("bulk") ||
    lower.includes("muscle") ||
    lower.includes("more")
  )
    return "gain";
  return "maintain";
}

type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

function parseActivity(text: string): ActivityLevel {
  const lower = text.toLowerCase();
  if (lower.includes("very") || lower.includes("intense") || lower.includes("athlete"))
    return "very_active";
  if (lower.includes("active") || lower.includes("exercise") || lower.includes("gym"))
    return "active";
  if (lower.includes("light") || lower.includes("walk") || lower.includes("sometimes"))
    return "light";
  if (
    lower.includes("sedentary") ||
    lower.includes("desk") ||
    lower.includes("no") ||
    lower.includes("none")
  )
    return "sedentary";
  return "moderate";
}

async function saveUser(
  userId: string,
  encryptedPhone: string,
  name: string,
  locale: string,
  timezone: string,
  country: string,
  body: BodyStats,
  goal: "lose" | "maintain" | "gain",
  activity: ActivityLevel,
  target: number,
) {
  "use step";
  await createUser(userId, encryptedPhone, {
    name,
    locale,
    timezone,
    country,
    dailyCalorieTarget: target,
    goal,
    activity,
    sex: body.sex,
    age: body.age,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    onboardingComplete: true,
    consentedAt: new Date().toISOString(),
    consentVersion: CONSENT_VERSION,
  });
  await deleteOnboardingState(userId);
}

export async function onboardingWorkflow(
  userId: string,
  encryptedPhone: string,
  locale: string,
  timezone: string,
  country: string,
  _countryName: string,
) {
  "use workflow";

  await setOnboardingState(userId, { step: "await_name" });

  const nameReply = await askAndWait(
    userId,
    encryptedPhone,
    locale === "sv"
      ? "Hej! 👋 Jag är Caltext, din kaloritracker. Vad heter du?"
      : "Hey! 👋 I'm Caltext, your calorie tracking buddy. What's your name?",
  );
  const name = nameReply.trim().split(" ")[0] ?? nameReply.trim();

  await setOnboardingState(userId, { step: "await_timezone", name });
  const tzCity = getTimezoneCity(timezone);
  const tzReply = await askAndWait(
    userId,
    encryptedPhone,
    locale === "sv"
      ? `Kul att träffas, ${name}! 🎉 Jag gissar att du är i ${tzCity}-tid -- stämmer det?`
      : `Nice to meet you, ${name}! 🎉 I'm guessing you're on ${tzCity} time -- is that right?`,
  );

  const confirmedTz =
    tzReply.toLowerCase().includes("no") || tzReply.toLowerCase().includes("nej")
      ? tzReply.replace(/no|nej|nope|nah/gi, "").trim() || timezone
      : timezone;

  await setOnboardingState(userId, { step: "await_body", timezone: confirmedTz });
  let bodyStats: BodyStats | null = null;
  while (!bodyStats) {
    const bodyReply = await askAndWait(
      userId,
      encryptedPhone,
      locale === "sv"
        ? `Toppen! För att räkna ut ditt kalorimål behöver jag veta lite om dig. Kön, ålder, längd och vikt? 📏`
        : `Great! To set your calorie target, I need a few details. Sex, age, height, and weight? 📏`,
    );
    bodyStats = await parseBodyStats(bodyReply);
    if (!bodyStats) {
      await sendMessage(
        userId,
        encryptedPhone,
        locale === "sv"
          ? "Hmm, jag kunde inte tolka det. Kan du skriva t.ex. 'man, 28 år, 180cm, 75kg'?"
          : "Hmm, I couldn't parse that. Try something like 'male, 28, 180cm, 75kg' or '5'11, 165lbs, female, 25'",
      );
    }
  }

  await setOnboardingState(userId, {
    step: "await_goal",
    sex: bodyStats.sex,
    age: bodyStats.age,
    heightCm: bodyStats.heightCm,
    weightKg: bodyStats.weightKg,
  });
  const goalReply = await askAndWait(
    userId,
    encryptedPhone,
    locale === "sv"
      ? "Vad är ditt mål -- gå ner i vikt, behålla vikten, eller bygga muskler? 🎯"
      : "What's your goal -- lose weight, maintain, or gain muscle? 🎯",
  );
  const goal = parseGoal(goalReply);

  await setOnboardingState(userId, { step: "await_activity", goal });
  const activityReply = await askAndWait(
    userId,
    encryptedPhone,
    locale === "sv"
      ? "Hur aktiv är du? Stillasittande, lätt aktiv, måttligt aktiv, aktiv, eller mycket aktiv? 🏃"
      : "How active are you? Sedentary, lightly active, moderately active, active, or very active? 🏃",
  );
  const activity = parseActivity(activityReply);

  const target = calculateTDEE(
    bodyStats.sex,
    bodyStats.weightKg,
    bodyStats.heightCm,
    bodyStats.age,
    activity,
    goal,
  );

  await setOnboardingState(userId, { step: "await_confirm", activity, calculatedTarget: target });
  const confirmReply = await askAndWait(
    userId,
    encryptedPhone,
    locale === "sv"
      ? `Baserat på vad du berättat föreslår jag ${target.toLocaleString()} kcal/dag. Låter det bra, eller vill du justera? ⚙️`
      : `Based on what you told me, I'd suggest ${target.toLocaleString()} kcal/day. Sound good, or want to adjust? ⚙️`,
  );

  let finalTarget = target;
  const numberMatch = confirmReply.match(/(\d{3,4})/);
  if (numberMatch?.[1]) {
    const parsed = parseInt(numberMatch[1], 10);
    if (parsed >= 1000 && parsed <= 5000) finalTarget = parsed;
  }

  const consentReply = await askAndWait(
    userId,
    encryptedPhone,
    locale === "sv"
      ? "En sista sak -- jag sparar din hälsodata (måltider, vikt, kroppsmått) för att följa dina framsteg. Du kan radera allt när som helst genom att bara fråga. Är det ok? 🔒"
      : "One last thing -- I'll store your health data (meals, weight, body stats) to track your progress. You can delete everything anytime by just asking. Is that ok? 🔒",
  );

  const consentLower = consentReply.toLowerCase();
  const declined =
    consentLower.includes("no") ||
    consentLower.includes("nej") ||
    consentLower.includes("nope") ||
    consentLower.includes("decline");

  if (declined) {
    await deleteOnboardingState(userId);
    await sendMessage(
      userId,
      encryptedPhone,
      locale === "sv"
        ? "Inga problem! Jag raderar din data. Du är välkommen tillbaka när som helst 👋"
        : "No worries! I'll delete your data. You're welcome back anytime 👋",
    );
    return;
  }

  await saveUser(
    userId,
    encryptedPhone,
    name,
    locale,
    confirmedTz,
    country,
    bodyStats,
    goal,
    activity,
    finalTarget,
  );

  await sendMessage(
    userId,
    encryptedPhone,
    locale === "sv"
      ? `Perfekt! Du är redo 🚀 Ditt dagliga mål: ${finalTarget.toLocaleString()} kcal. Skicka en bild på din mat eller skriv vad du ätit så loggar jag det! 📸`
      : `You're all set! 🚀 Your daily target: ${finalTarget.toLocaleString()} kcal. Send me a photo of your food or just text what you had -- I'll log it! 📸`,
  );

  const run = await start(reminderLoop, [userId]);
  await setReminderRunId(userId, run.runId);
}
