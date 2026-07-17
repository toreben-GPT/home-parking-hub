import type { BackupEnvelope } from "../src/shared/types";

export const D1_MAX_BOUND_PARAMETERS = 100;
export const RESTORE_SAFE_QUERY_LIMIT = 45;
export const RESTORE_DELETE_QUERY_COUNT = 5;
export const RESTORE_RESULT_READ_QUERY_COUNT = 5;

export const RESTORE_COLUMNS_PER_ROW = {
  parkingLots: 15,
  pricingVersions: 14,
  availabilityLogs: 8,
  memos: 5,
  photos: 9,
} as const;

export interface RestoreQueryPlan {
  parkingLots: number;
  pricingVersions: number;
  availabilityLogs: number;
  memos: number;
  photos: number;
  totalQueries: number;
}

export function maxRowsPerInsert(columnCount: number): number {
  return Math.floor(D1_MAX_BOUND_PARAMETERS / columnCount);
}

function insertQueryCount(rowCount: number, columnCount: number): number {
  if (rowCount === 0) return 0;
  return Math.ceil(rowCount / maxRowsPerInsert(columnCount));
}

export function calculateRestoreQueryPlan(backup: BackupEnvelope): RestoreQueryPlan {
  const counts = backup.parkingLots.reduce(
    (current, lot) => ({
      parkingLots: current.parkingLots + 1,
      pricingVersions: current.pricingVersions + lot.pricingHistory.length,
      availabilityLogs: current.availabilityLogs + lot.availabilityLogs.length,
      memos: current.memos + lot.memos.length,
      photos: current.photos + lot.photos.length,
    }),
    { parkingLots: 0, pricingVersions: 0, availabilityLogs: 0, memos: 0, photos: 0 },
  );

  const parkingLotQueries = insertQueryCount(
    counts.parkingLots,
    RESTORE_COLUMNS_PER_ROW.parkingLots,
  );
  const pricingQueries = insertQueryCount(
    counts.pricingVersions,
    RESTORE_COLUMNS_PER_ROW.pricingVersions,
  );
  const availabilityQueries = insertQueryCount(
    counts.availabilityLogs,
    RESTORE_COLUMNS_PER_ROW.availabilityLogs,
  );
  const memoQueries = insertQueryCount(counts.memos, RESTORE_COLUMNS_PER_ROW.memos);
  const photoQueries = insertQueryCount(counts.photos, RESTORE_COLUMNS_PER_ROW.photos);

  return {
    ...counts,
    totalQueries:
      RESTORE_DELETE_QUERY_COUNT +
      parkingLotQueries +
      pricingQueries +
      availabilityQueries +
      memoQueries +
      photoQueries +
      RESTORE_RESULT_READ_QUERY_COUNT,
  };
}
