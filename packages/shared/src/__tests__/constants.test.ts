import { describe, expect, test } from "bun:test";
import { calculateBMR, calculateTDEE } from "../constants";

describe("calculateBMR (Mifflin-St Jeor)", () => {
  test("male — 80kg, 180cm, age 30", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(calculateBMR("male", 80, 180, 30)).toBe(1780);
  });

  test("female — 65kg, 165cm, age 25", () => {
    // 10*65 + 6.25*165 - 5*25 - 161 = 650 + 1031.25 - 125 - 161 = 1395.25
    expect(calculateBMR("female", 65, 165, 25)).toBe(1395.25);
  });

  test("male — edge case: very low weight", () => {
    // 10*50 + 6.25*160 - 5*20 + 5 = 500 + 1000 - 100 + 5 = 1405
    expect(calculateBMR("male", 50, 160, 20)).toBe(1405);
  });
});

describe("calculateTDEE", () => {
  test("male, moderate activity, maintain", () => {
    // BMR = 1780, TDEE = 1780 * 1.55 + 0 = 2759
    expect(calculateTDEE("male", 80, 180, 30, "moderate", "maintain")).toBe(
      Math.round(1780 * 1.55),
    );
  });

  test("female, sedentary, lose weight", () => {
    // BMR = 1395.25, TDEE = 1395.25 * 1.2 - 500 = 1174
    expect(calculateTDEE("female", 65, 165, 25, "sedentary", "lose")).toBe(
      Math.round(1395.25 * 1.2 - 500),
    );
  });

  test("male, very active, gain weight", () => {
    // BMR = 1780, TDEE = 1780 * 1.9 + 300 = 3682
    expect(calculateTDEE("male", 80, 180, 30, "very_active", "gain")).toBe(
      Math.round(1780 * 1.9 + 300),
    );
  });

  test("unknown activity/goal falls back to moderate/0", () => {
    // BMR = 1780, TDEE = 1780 * 1.55 = 2759
    expect(calculateTDEE("male", 80, 180, 30, "unknown", "unknown")).toBe(Math.round(1780 * 1.55));
  });
});
