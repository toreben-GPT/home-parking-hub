import { describe, expect, it } from "vitest";

import {
  SUPPLIED_PARKING_LOTS,
  assertLocalBaseUrl,
  buildPhotoNote,
  parkingInputForExistingLot,
  parseArguments,
} from "./register-supplied-parking-lots.mjs";

describe("supplied parking lot local importer", () => {
  it("accepts loopback HTTP URLs and rejects remote or production-like URLs", () => {
    expect(assertLocalBaseUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(assertLocalBaseUrl("http://[::1]:8787")).toBe("http://[::1]:8787");
    expect(assertLocalBaseUrl("http://localhost:8787")).toBe("http://localhost:8787");

    for (const unsafeUrl of [
      "https://127.0.0.1:8787",
      "https://example.com",
      "http://example.com",
      "http://127.0.0.1:8787/api",
    ]) {
      expect(() => assertLocalBaseUrl(unsafeUrl)).toThrow(
        "安全のため --base-url",
      );
    }
  });

  it("keeps the six image mappings and image-authoritative Lucky prices", () => {
    expect(
      SUPPLIED_PARKING_LOTS.map(({ imageFile, input }) => [imageFile, input.name]),
    ).toEqual([
      ["IMG_5008.HEIC", "ラッキーパーキング東F"],
      ["IMG_5011.HEIC", "セイワパーク博多駅東2丁目2"],
      ["IMG_5012.HEIC", "セイワパーク博多駅東"],
      ["IMG_5016.PNG", "あるあるパーキング博多駅東2丁目"],
      ["IMG_5013.HEIC", "PARKS PARK 福岡博多駅東3丁目"],
      ["IMG_5017.PNG", "IBパーク 駅東"],
    ]);
    const patternIds = ["WN-19", "WN-20", "HN-19", "HN-20", "W-24", "H-24"];
    expect(
      SUPPLIED_PARKING_LOTS.map(({ input }) =>
        patternIds.map((patternId) => input.pricing.patternPrices[patternId].amountYen),
      ),
    ).toEqual([
      [400, 800, 400, 800, 2_100, 1_300],
      [500, 500, 500, 500, 1_500, 800],
      [700, 500, 600, 500, 1_800, 1_300],
      [600, 400, 600, 400, 2_800, 2_200],
      [900, 500, 900, 500, 2_000, 1_400],
      [700, 500, 500, 400, 2_900, 1_600],
    ]);
    expect(SUPPLIED_PARKING_LOTS.map(({ input }) => input.parkingEase)).toEqual(
      Array(6).fill("unrated"),
    );
  });

  it("preserves user-entered fields when updating a same-name lot", () => {
    const supplied = SUPPLIED_PARKING_LOTS[0].input;
    const existing = {
      ...supplied,
      currentPricing: supplied.pricing,
      address: "福岡市博多区テスト1-2-3",
      mapsUrl: "https://maps.example.com/lot",
      walkMinutes: 7,
      walkDistanceMeters: 520,
      parkingEase: "easy",
      easeNote: "入口が広い",
      paymentMethods: ["cash"],
      recommendationComment: "雨の日に便利",
      aiSummary: "利用者が後から入力",
    };

    const merged = parkingInputForExistingLot(existing, supplied);
    expect(merged).toMatchObject({
      name: supplied.name,
      status: "active",
      address: existing.address,
      mapsUrl: existing.mapsUrl,
      walkMinutes: 7,
      walkDistanceMeters: 520,
      parkingEase: "easy",
      easeNote: "入口が広い",
      paymentMethods: ["cash"],
      recommendationComment: "雨の日に便利",
      aiSummary: "利用者が後から入力",
      pricing: supplied.pricing,
    });
  });

  it("uses the environment access code and records the photo hash in its note", () => {
    expect(parseArguments([], { LOCAL_ACCESS_CODE: "local-only-code" })).toMatchObject({
      accessCode: "local-only-code",
      baseUrl: "http://127.0.0.1:8787",
    });
    expect(buildPhotoNote("料金看板写真", "abc123")).toBe(
      "料金看板写真 | sha256=abc123",
    );
  });
});
