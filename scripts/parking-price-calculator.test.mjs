import { describe, expect, it } from "vitest";

import {
  applyCalculated24HourPrices,
  calculateCheapest24HourPrice,
} from "./parking-price-calculator.mjs";

describe("24-hour minimum price calculator", () => {
  it("finds the cheapest 24 hours instead of fixing entry at 20:00", () => {
    const result = calculateCheapest24HourPrice({
      timeBands: [
        { startMinute: 7 * 60, endMinute: 19 * 60, unitMinutes: 40, unitYen: 200, maximumYen: 1_300 },
        { startMinute: 19 * 60, endMinute: 7 * 60, unitMinutes: 40, unitYen: 200, maximumYen: 400 },
      ],
    });

    expect(result.amountYen).toBe(1_700);
    expect(result.cheapestEntryMinutes).toContain(7 * 60);
    expect(result.cheapestEntryMinutes).toContain(19 * 60);
    expect(result.cheapestEntryMinutes).not.toContain(20 * 60);
  });

  it("honors an entry-based 24-hour maximum", () => {
    expect(calculateCheapest24HourPrice({
      rolling24HourMaximumYen: 800,
      timeBands: [
        { startMinute: 8 * 60, endMinute: 18 * 60, unitMinutes: 60, unitYen: 200 },
        { startMinute: 18 * 60, endMinute: 8 * 60, unitMinutes: 60, unitYen: 200, maximumYen: 500 },
      ],
    }).amountYen).toBe(800);
  });

  it("rejects missing, overlapping, and incomplete time-band rules", () => {
    expect(() => calculateCheapest24HourPrice({ timeBands: [] })).toThrow(/時間帯ルール/u);
    expect(() => calculateCheapest24HourPrice({
      timeBands: [
        { startMinute: 0, endMinute: 12 * 60, unitMinutes: 60, unitYen: 100 },
        { startMinute: 10 * 60, endMinute: 0, unitMinutes: 60, unitYen: 100 },
      ],
    })).toThrow(/1件である必要/u);
  });

  it("writes both calculated day-type prices without mutating the input", () => {
    const input = {
      pricing: {
        patternPrices: {
          "W-24": { amountYen: null, needsConfirmation: true },
          "H-24": { amountYen: null, needsConfirmation: true },
        },
      },
    };
    const rules = {
      weekday: {
        timeBands: [{ startMinute: 0, endMinute: 0, unitMinutes: 60, unitYen: 100, maximumYen: 900 }],
      },
      holiday: {
        timeBands: [{ startMinute: 0, endMinute: 0, unitMinutes: 60, unitYen: 100, maximumYen: 500 }],
      },
    };

    const result = applyCalculated24HourPrices(input, rules);
    expect(result.pricing.patternPrices["W-24"]).toEqual({ amountYen: 900, needsConfirmation: false });
    expect(result.pricing.patternPrices["H-24"]).toEqual({ amountYen: 500, needsConfirmation: false });
    expect(input.pricing.patternPrices["W-24"].amountYen).toBeNull();
  });
});
