export const PATTERN_IDS = ["WN-19", "WN-20", "HN-19", "HN-20", "W-24", "H-24"] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export type ParkingStatus = "active" | "excluded" | "closed";
export type ParkingEase = "easy" | "normal" | "difficult" | "unrated";
export type PaymentMethod = "cash" | "cashless" | "unknown";
export type PhotoKind = "price_sign" | "entrance" | "overview" | "other";
export type AvailabilityStatus = "available" | "limited" | "full";
export type DayType = "weekday" | "holiday";
export type TimePeriod = "night" | "day";
export type AvailabilitySegment = "weekday_night" | "holiday_night" | "weekday_day" | "holiday_day";

export interface PatternPrice {
  amountYen: number | null;
  needsConfirmation: boolean;
}

export type PatternPrices = Record<PatternId, PatternPrice>;

export interface PricingInput {
  sourceText: string;
  baseRate: string;
  weekdayMaximum: string;
  holidayMaximum: string;
  nightMaximum: string;
  nightHours: string;
  maximumRepeat: string;
  exceptions: string;
  patternPrices: PatternPrices;
  changeNote: string;
}

export interface PricingVersion extends PricingInput {
  id: string;
  parkingLotId: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface AvailabilityLog {
  id: string;
  parkingLotId: string;
  observedAt: string;
  status: AvailabilityStatus;
  memo: string;
  dayType: DayType;
  timePeriod: TimePeriod;
  createdAt: string;
}

export interface MemoEntry {
  id: string;
  parkingLotId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoMetadata {
  id: string;
  parkingLotId: string;
  kind: PhotoKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  note: string;
  createdAt: string;
  url: string;
}

export interface ParkingLotInput {
  name: string;
  address: string;
  mapsUrl: string;
  walkMinutes: number | null;
  walkDistanceMeters: number | null;
  status: ParkingStatus;
  parkingEase: ParkingEase;
  easeNote: string;
  paymentMethods: PaymentMethod[];
  recommendationComment: string;
  aiSummary: string;
  pricing: PricingInput;
}

export interface ParkingLot extends Omit<ParkingLotInput, "pricing"> {
  id: string;
  createdAt: string;
  updatedAt: string;
  currentPricing: PricingVersion;
  pricingHistory: PricingVersion[];
  availabilityLogs: AvailabilityLog[];
  memos: MemoEntry[];
  photos: PhotoMetadata[];
}

export interface AvailabilitySummary {
  total: number;
  parkable: number;
  limited: number;
  full: number;
  rate: number | null;
}

export type RecommendationLabel = "最安" | "最安・距離長め" | "近さとのバランス良好" | "停めやすさ良好";

export interface BackupEnvelope {
  schemaVersion: 1 | 2;
  exportedAt: string;
  parkingLots: ParkingLot[];
  photoBackup: {
    binariesIncluded: false;
    note: string;
  };
}

export interface ApiErrorPayload {
  error: string;
  details?: string;
}
