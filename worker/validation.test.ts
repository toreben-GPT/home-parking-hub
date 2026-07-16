import { describe, expect, it } from "vitest";
import { EMPTY_PRICING_INPUT } from "../src/shared/constants";
import type { BackupEnvelope, ParkingLot, ParkingLotInput, PatternPrices } from "../src/shared/types";
import { requireCsrfHeader } from "./http";
import {
  isAllowedPhotoContentType,
  normalizePhotoContentType,
  photoSignatureMatches,
  validateBackupEnvelope,
  validateParkingLotInput,
  validateParkingLotUpdate,
  ValidationError,
} from "./validation";

function parkingInput(): ParkingLotInput {
  return {
    name: "テスト駐車場",
    address: "東京都テスト区1-2-3",
    mapsUrl: "https://maps.example.com/test",
    walkMinutes: 5,
    walkDistanceMeters: 350,
    status: "active",
    parkingEase: "normal",
    easeNote: "入口は広め",
    paymentMethods: ["cash", "cashless"],
    recommendationComment: "近くて便利",
    aiSummary: "",
    pricing: structuredClone(EMPTY_PRICING_INPUT),
  };
}

function backupEnvelope(): BackupEnvelope {
  const input = parkingInput();
  const { pricing: inputPricing, ...parkingFields } = input;
  const pricing = {
    ...inputPricing,
    id: "price-1",
    parkingLotId: "lot-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    isCurrent: true,
  };
  const lot: ParkingLot = {
    ...parkingFields,
    id: "lot-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    currentPricing: pricing,
    pricingHistory: [pricing],
    availabilityLogs: [],
    memos: [],
    photos: [],
  };
  return {
    schemaVersion: 1,
    exportedAt: "2026-07-15T01:00:00.000Z",
    parkingLots: [lot],
    photoBackup: { binariesIncluded: false, note: "写真本体なし" },
  };
}

describe("request validation", () => {
  it("accepts a complete ParkingLotInput and normalizes surrounding whitespace", () => {
    const input = parkingInput();
    input.name = "  テスト駐車場  ";
    expect(validateParkingLotInput(input).name).toBe("テスト駐車場");
  });

  it("requires the last-seen update time when editing", () => {
    const update = {
      ...parkingInput(),
      expectedUpdatedAt: "2026-07-15T00:00:00.000Z",
    };
    expect(validateParkingLotUpdate(update).expectedUpdatedAt).toBe(
      "2026-07-15T00:00:00.000Z",
    );
    expect(() => validateParkingLotUpdate(parkingInput())).toThrow(ValidationError);
  });

  it("rejects unsafe map URL schemes and incomplete pattern prices", () => {
    const badUrl = parkingInput();
    badUrl.mapsUrl = "javascript:alert(1)";
    expect(() => validateParkingLotInput(badUrl)).toThrow(ValidationError);

    const badPatterns = parkingInput();
    delete (badPatterns.pricing.patternPrices as Partial<PatternPrices>)["WN-19"];
    expect(() => validateParkingLotInput(badPatterns)).toThrow(ValidationError);
  });

  it("accepts only the supported photo media types", () => {
    expect(isAllowedPhotoContentType("image/jpeg")).toBe(true);
    expect(isAllowedPhotoContentType("IMAGE/HEIC")).toBe(true);
    expect(isAllowedPhotoContentType("image/heif-sequence; charset=binary")).toBe(true);
    expect(isAllowedPhotoContentType("image/svg+xml")).toBe(false);
    expect(isAllowedPhotoContentType("application/octet-stream")).toBe(false);
  });

  it("recovers image MIME types from extensions when Safari omits the type", () => {
    expect(normalizePhotoContentType("", "IMG_1234.HEIC")).toBe("image/heic");
    expect(normalizePhotoContentType("application/octet-stream", "photo.webp")).toBe("image/webp");
    expect(normalizePhotoContentType("image/png", "renamed.jpg")).toBe("image/png");
    expect(normalizePhotoContentType("text/plain", "photo.png")).toBe("text/plain");
  });

  it("checks PNG, JPEG, WebP, and HEIC signatures and rejects a video ftyp box", async () => {
    const file = (bytes: number[], type: string) => new File([new Uint8Array(bytes)], "photo", { type });
    const ascii = (value: string) => [...new TextEncoder().encode(value)];

    await expect(photoSignatureMatches(file([0xff, 0xd8, 0xff], "image/jpeg"), "image/jpeg")).resolves.toBe(true);
    await expect(
      photoSignatureMatches(
        file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"),
        "image/png",
      ),
    ).resolves.toBe(true);
    await expect(
      photoSignatureMatches(
        file([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")], "image/webp"),
        "image/webp",
      ),
    ).resolves.toBe(true);
    await expect(
      photoSignatureMatches(
        file([0, 0, 0, 24, ...ascii("ftyp"), ...ascii("mif1"), 0, 0, 0, 0, ...ascii("heic")], "image/heic"),
        "image/heic",
      ),
    ).resolves.toBe(true);
    await expect(
      photoSignatureMatches(
        file([0, 0, 0, 20, ...ascii("ftyp"), ...ascii("isom"), 0, 0, 0, 0], "image/heic"),
        "image/heic",
      ),
    ).resolves.toBe(false);
  });

  it("validates a full backup before restore", () => {
    const backup = backupEnvelope();
    expect(validateBackupEnvelope(backup)).toEqual(backup);

    const invalid = structuredClone(backup);
    invalid.parkingLots[0].pricingHistory[0].isCurrent = false;
    expect(() => validateBackupEnvelope(invalid)).toThrow(ValidationError);
  });

  it("rejects an oversized backup before a destructive restore starts", () => {
    const atLimit = backupEnvelope();
    atLimit.parkingLots[0].memos = Array.from(
      { length: 660 },
      (_, index) => ({
        id: `memo-${index}`,
        parkingLotId: "lot-1",
        body: `メモ${index}`,
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      }),
    );
    expect(validateBackupEnvelope(atLimit).parkingLots[0].memos).toHaveLength(660);

    const overLimit = structuredClone(atLimit);
    overLimit.parkingLots[0].memos.push({
      id: "memo-over-limit",
      parkingLotId: "lot-1",
      body: "上限超過",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    });
    expect(() => validateBackupEnvelope(overLimit)).toThrowError(/データ件数が多い/u);
  });

  it("requires the exact same-origin mutation header", () => {
    const allowed = new Request("https://example.com/api/parking", {
      method: "POST",
      headers: { "X-Requested-With": "home-parking-hub" },
    });
    expect(() => requireCsrfHeader(allowed)).not.toThrow();

    const rejected = new Request("https://example.com/api/parking", { method: "POST" });
    expect(() => requireCsrfHeader(rejected)).toThrowError(/安全確認/u);
  });
});
