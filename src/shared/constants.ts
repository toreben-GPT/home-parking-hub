import type { PatternId, PatternPrices, PricingInput } from "./types";

export const PATTERN_DEFINITIONS: ReadonlyArray<{
  id: PatternId;
  dayLabel: "平日" | "土日祝";
  shortLabel: string;
  fullLabel: string;
}> = [
  { id: "WN-19", dayLabel: "平日", shortLabel: "19時〜翌7時", fullLabel: "平日 19時〜翌7時" },
  { id: "WN-20", dayLabel: "平日", shortLabel: "20時〜翌8時", fullLabel: "平日 20時〜翌8時" },
  { id: "W-24", dayLabel: "平日", shortLabel: "24時間", fullLabel: "平日 24時間" },
  { id: "HN-19", dayLabel: "土日祝", shortLabel: "19時〜翌7時", fullLabel: "土日祝 19時〜翌7時" },
  { id: "HN-20", dayLabel: "土日祝", shortLabel: "20時〜翌8時", fullLabel: "土日祝 20時〜翌8時" },
  { id: "H-24", dayLabel: "土日祝", shortLabel: "24時間", fullLabel: "土日祝 24時間" },
];

export const EMPTY_PATTERN_PRICES: PatternPrices = {
  "WN-19": { amountYen: null, needsConfirmation: true },
  "WN-20": { amountYen: null, needsConfirmation: true },
  "HN-19": { amountYen: null, needsConfirmation: true },
  "HN-20": { amountYen: null, needsConfirmation: true },
  "W-24": { amountYen: null, needsConfirmation: true },
  "H-24": { amountYen: null, needsConfirmation: true },
};

export const EMPTY_PRICING_INPUT: PricingInput = {
  sourceText: "",
  baseRate: "",
  weekdayMaximum: "",
  holidayMaximum: "",
  nightMaximum: "",
  nightHours: "",
  maximumRepeat: "",
  exceptions: "",
  patternPrices: structuredClone(EMPTY_PATTERN_PRICES),
  changeNote: "",
};

export const PHOTO_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const SESSION_MAX_AGE_DAYS = 90;
export const BACKUP_SCHEMA_VERSION = 2;
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [1, BACKUP_SCHEMA_VERSION] as const;
