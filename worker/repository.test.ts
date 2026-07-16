import { describe, expect, it } from "vitest";
import { EMPTY_PRICING_INPUT } from "../src/shared/constants";
import { pricingContentChanged } from "./repository";

describe("pricing history comparison", () => {
  it("does not create a new version for a note-only or non-price edit", () => {
    const current = { ...structuredClone(EMPTY_PRICING_INPUT), changeNote: "前回の変更メモ" };
    const next = { ...structuredClone(EMPTY_PRICING_INPUT), changeNote: "" };
    expect(pricingContentChanged(current, next)).toBe(false);
  });

  it("detects an actual price change even when the note is empty", () => {
    const current = structuredClone(EMPTY_PRICING_INPUT);
    const next = structuredClone(EMPTY_PRICING_INPUT);
    next.patternPrices["WN-19"].amountYen = 600;
    expect(pricingContentChanged(current, next)).toBe(true);
  });
});
