import { describe, expect, it } from "vitest";
import type { BackupEnvelope, ParkingLot } from "../src/shared/types";
import { EMPTY_PRICING_INPUT } from "../src/shared/constants";
import {
  calculateRestoreQueryPlan,
  maxRowsPerInsert,
  RESTORE_COLUMNS_PER_ROW,
  RESTORE_SAFE_QUERY_LIMIT,
} from "./restore-plan";

function backupWithMemos(memoCount: number): BackupEnvelope {
  const pricing = {
    ...structuredClone(EMPTY_PRICING_INPUT),
    id: "price-1",
    parkingLotId: "lot-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    isCurrent: true,
  };
  const lot: ParkingLot = {
    id: "lot-1",
    name: "テスト駐車場",
    address: "",
    mapsUrl: "",
    walkMinutes: null,
    walkDistanceMeters: null,
    status: "active",
    parkingEase: "normal",
    easeNote: "",
    paymentMethods: ["unknown"],
    recommendationComment: "",
    aiSummary: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    currentPricing: pricing,
    pricingHistory: [pricing],
    availabilityLogs: [],
    memos: Array.from({ length: memoCount }, (_, index) => ({
      id: `memo-${index}`,
      parkingLotId: "lot-1",
      body: `メモ${index}`,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    })),
    photos: [],
  };
  return {
    schemaVersion: 1,
    exportedAt: "2026-07-15T01:00:00.000Z",
    parkingLots: [lot],
    photoBackup: { binariesIncluded: false, note: "写真本体なし" },
  };
}

describe("restore query planning", () => {
  it("keeps every multi-row insert within the 100-parameter limit", () => {
    expect(maxRowsPerInsert(RESTORE_COLUMNS_PER_ROW.parkingLots)).toBe(6);
    expect(maxRowsPerInsert(RESTORE_COLUMNS_PER_ROW.pricingVersions)).toBe(7);
    expect(maxRowsPerInsert(RESTORE_COLUMNS_PER_ROW.availabilityLogs)).toBe(12);
    expect(maxRowsPerInsert(RESTORE_COLUMNS_PER_ROW.memos)).toBe(20);
    expect(maxRowsPerInsert(RESTORE_COLUMNS_PER_ROW.photos)).toBe(11);
  });

  it("accepts the safe query boundary and detects the next chunk", () => {
    expect(calculateRestoreQueryPlan(backupWithMemos(660)).totalQueries).toBe(
      RESTORE_SAFE_QUERY_LIMIT,
    );
    expect(calculateRestoreQueryPlan(backupWithMemos(661)).totalQueries).toBe(
      RESTORE_SAFE_QUERY_LIMIT + 1,
    );
  });
});
