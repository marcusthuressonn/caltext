import { generateDailySummary, loadUser, sendMsg } from "./steps/reminder-steps";

export async function dailySummaryWorkflow(userId: string) {
  "use workflow";

  const user = await loadUser(userId);
  if (!user) return;

  const result = await generateDailySummary(userId, user.locale);
  if (result) {
    await sendMsg(userId, result.text);
  }
}
