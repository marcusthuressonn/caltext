export function nextLocalTime(hour: number, minute: number, tz: string): Date {
  const now = new Date();
  // Get current time formatted in the user's timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0", 10);
  const userYear = get("year");
  const userMonth = get("month");
  const userDay = get("day");
  const userHour = get("hour");
  const userMinute = get("minute");

  // Is the target time already past today in user's tz?
  const isPast = userHour > hour || (userHour === hour && userMinute >= minute);

  // Build the target date in user's local tz
  const targetDay = isPast ? userDay + 1 : userDay;

  // Create an ISO string in the user's timezone context, then parse
  const targetStr = `${userYear}-${String(userMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

  // Use Intl to find the UTC equivalent
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  // Brute-force approach: search for the UTC time that corresponds to our target local time
  // Start with a rough estimate
  const rough = new Date(targetStr + "Z");
  const offset = getTimezoneOffsetMs(tz, rough);
  return new Date(rough.getTime() - offset);
}

function getTimezoneOffsetMs(tz: string, date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: tz });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

export function msUntil(target: Date): number {
  return Math.max(0, target.getTime() - Date.now());
}

export function localDateString(tz: string, date?: Date): string {
  const d = date ?? new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { // en-CA gives YYYY-MM-DD
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return parts; // "2026-04-08"
}

export function localHour(tz: string, date?: Date): number {
  const d = date ?? new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
}

export function isDayOfWeek(tz: string, dayName: string, date?: Date): boolean {
  const d = date ?? new Date();
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(d);
  return day.toLowerCase() === dayName.toLowerCase();
}
