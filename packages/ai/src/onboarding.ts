import { openai } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { OnboardingState } from "@caltext/shared";
import { generateText, Output } from "ai";
import { z } from "zod";

const defaultModel = openai("gpt-4.1-mini");

const extractionSchema = z.object({
  name: z.string().nullable().describe("User's first name. Null if not mentioned."),
  sex: z.enum(["male", "female"]).nullable().describe("Null if not mentioned."),
  age: z.number().nullable().describe("Age in years. Null if not mentioned."),
  heightCm: z
    .number()
    .nullable()
    .describe("Height converted to cm. 5'6\"=167.6, 6ft=182.9, 1in=2.54cm. Null if not mentioned."),
  weightKg: z
    .number()
    .nullable()
    .describe("Weight converted to kg. 1lb=0.4536kg, 1stone=6.35kg. Null if not mentioned."),
  goal: z
    .enum(["lose", "maintain", "gain"])
    .nullable()
    .describe("Fitness goal. Null if not mentioned."),
  activity: z
    .enum(["sedentary", "light", "moderate", "active", "very_active"])
    .nullable()
    .describe("Activity level. Null if not mentioned."),
  consented: z
    .boolean()
    .nullable()
    .describe("True if user agreed to store health data, false if refused, null if not addressed."),
  detectedLocale: z
    .string()
    .nullable()
    .describe(
      "BCP-47 language code of the user's message, e.g. 'sv', 'en', 'fr', 'de'. Null only if truly ambiguous.",
    ),
  reply: z.string().describe("Your reply message to the user."),
});

function describeState(state: OnboardingState): string {
  const parts: string[] = [];
  if (state.name) parts.push(`name: ${state.name}`);
  if (state.sex) parts.push(`sex: ${state.sex}`);
  if (state.age) parts.push(`age: ${state.age}`);
  if (state.heightCm) parts.push(`height: ${state.heightCm}cm`);
  if (state.weightKg) parts.push(`weight: ${state.weightKg}kg`);
  if (state.goal) parts.push(`goal: ${state.goal}`);
  if (state.activity) parts.push(`activity: ${state.activity}`);
  if (state.consented) parts.push("consent: given");
  return parts.length > 0 ? parts.join(", ") : "nothing yet";
}

function describeMissing(state: OnboardingState): string {
  const missing: string[] = [];
  if (!state.name) missing.push("name");
  if (!state.sex) missing.push("sex");
  if (!state.age) missing.push("age");
  if (!state.heightCm) missing.push("height");
  if (!state.weightKg) missing.push("weight");
  if (!state.goal) missing.push("goal (lose/maintain/gain)");
  if (!state.activity) missing.push("activity level (sedentary/light/moderate/active/very active)");
  if (!state.consented) missing.push("consent to store health data");
  return missing.join(", ");
}

export interface OnboardingContext {
  isFirstMessage: boolean;
  timezone: string;
  locale: string;
  dailyTarget?: number;
}

export interface OnboardingResult {
  extracted: Partial<OnboardingState>;
  reply: string;
}

export async function processOnboardingMessage(
  text: string,
  state: OnboardingState,
  ctx: OnboardingContext,
  model?: LanguageModelV3,
): Promise<OnboardingResult> {
  const replyLang = state.detectedLocale
    ? `Reply in ${state.detectedLocale} (the user's language).`
    : "Reply in the same language the user writes in. Detect their language from the message.";

  const conversationContext = state.lastBotReply
    ? `\nYOUR PREVIOUS MESSAGE TO THE USER: "${state.lastBotReply}"\n(The user is responding to this message. Interpret their reply in this context.)\n`
    : "";

  let situation: string;

  if (ctx.isFirstMessage) {
    situation = `This is the user's FIRST message. Welcome them warmly as Caltext, a calorie tracking buddy in iMessage. In your reply, naturally explain everything you need to get them started:
- Their name
- Basic stats: sex, age, height, weight (any units are fine)
- Goal: lose weight, maintain, or build muscle
- Activity level: sedentary, light, moderate, active, or very active
- Mention you'll store their health data for tracking and they can delete it anytime (this covers consent)
Make it feel like one natural, friendly message -- not a bulleted checklist. Keep it casual and iMessage-style.`;
  } else if (ctx.dailyTarget) {
    situation = `The user is fully set up! Their daily calorie target is ${ctx.dailyTarget} kcal. Reply with ONLY:
"✅ All set! Your daily target is ${ctx.dailyTarget} kcal.
Send a photo or text what you eat to start tracking."
No extra commentary or enthusiasm.`;
  } else {
    situation = `This is a follow-up message. The user already provided some info.
Already collected: ${describeState(state)}.
Still missing: ${describeMissing(state)}.
In your reply: briefly acknowledge any new info they just provided, then naturally ask for whatever is still missing. If only consent is missing, warmly ask for their OK to store health data (mention they can delete anytime). Keep it short and conversational.`;
  }

  const { output } = await generateText({
    model: model ?? defaultModel,
    output: Output.object({ schema: extractionSchema }),
    prompt: `You are Caltext, a friendly calorie tracking assistant in iMessage. ${replyLang}
${conversationContext}
USER MESSAGE: "${text}"

CURRENT STATE: ${describeState(state)}

SITUATION: ${situation}

EXTRACTION INSTRUCTIONS:
- Extract values the user stated or confirmed in this message. Use null for anything not addressed.
- CRITICAL: If your previous message asked the user to confirm something (e.g. consent) and the user replies affirmatively (yes, yeah, yep, ja, japp, oui, si, ok, sure, etc.), mark it as true.
- For height: convert to cm (5'6" = 167.6cm, 6ft = 182.9cm)
- For weight: convert to kg (1lb = 0.4536kg)
- consented: true if they agreed to data storage (including a general "yes" when consent was asked about), null only if consent was never mentioned
- detectedLocale: detect the BCP-47 language code from the user's message text

REPLY INSTRUCTIONS:
- Write a short, casual iMessage-style reply (1-3 emoji max)
- Do NOT repeat or echo back what the user just told you. Just move on to what's next.
- Never repeat a greeting if the user already introduced themselves
- Be direct like a friend texting, not formal
- Do NOT wrap the reply in quotes
- NEVER re-ask for information the user already confirmed`,
  });

  if (!output) {
    return { extracted: {}, reply: "Hey! Something went wrong -- try again? 🙏" };
  }

  const extracted: Partial<OnboardingState> = {};
  if (output.name) extracted.name = output.name;
  if (output.sex) extracted.sex = output.sex;
  if (output.age !== null && output.age !== undefined && output.age >= 5 && output.age <= 130)
    extracted.age = output.age;
  if (
    output.heightCm !== null &&
    output.heightCm !== undefined &&
    output.heightCm >= 50 &&
    output.heightCm <= 300
  )
    extracted.heightCm = Math.round(output.heightCm * 10) / 10;
  if (
    output.weightKg !== null &&
    output.weightKg !== undefined &&
    output.weightKg >= 15 &&
    output.weightKg <= 500
  )
    extracted.weightKg = Math.round(output.weightKg * 10) / 10;
  if (output.goal) extracted.goal = output.goal;
  if (output.activity) extracted.activity = output.activity;
  if (output.consented === true) extracted.consented = true;
  if (output.detectedLocale && !state.detectedLocale) {
    extracted.detectedLocale = output.detectedLocale;
  }

  return { extracted, reply: output.reply };
}
