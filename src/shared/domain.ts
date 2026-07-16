import type {
  AvailabilityLog,
  AvailabilitySegment,
  AvailabilityStatus,
  AvailabilitySummary,
  DayType,
  ParkingEase,
  ParkingLot,
  ParkingStatus,
  PatternId,
  PatternPrice,
  PaymentMethod,
  RecommendationLabel,
  TimePeriod,
} from "./types";

const SEGMENT_BY_PATTERN: Readonly<Record<PatternId, AvailabilitySegment>> = {
  "WN-19": "weekday_night",
  "WN-20": "weekday_night",
  "HN-19": "holiday_night",
  "HN-20": "holiday_night",
  "W-24": "weekday_day",
  "H-24": "holiday_day",
};

const PATTERN_LABELS: Readonly<Record<PatternId, string>> = {
  "WN-19": "平日19時〜翌7時",
  "WN-20": "平日20時〜翌8時",
  "HN-19": "土日祝19時〜翌7時",
  "HN-20": "土日祝20時〜翌8時",
  "W-24": "平日24時間",
  "H-24": "土日祝24時間",
};

const PATTERN_ORDER: readonly PatternId[] = ["WN-19", "WN-20", "HN-19", "HN-20", "W-24", "H-24"];

const EASE_RANK: Readonly<Record<ParkingEase, number>> = {
  easy: 0,
  normal: 1,
  difficult: 2,
};

const EASE_LABELS: Readonly<Record<ParkingEase, string>> = {
  easy: "停めやすい",
  normal: "普通",
  difficult: "停めにくい",
};

const PAYMENT_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: "現金",
  cashless: "キャッシュレス",
  unknown: "不明",
};

const PAYMENT_ORDER: readonly PaymentMethod[] = ["cash", "cashless", "unknown"];

const AVAILABILITY_LABELS: Readonly<Record<AvailabilityStatus, string>> = {
  available: "空いていた",
  limited: "残りわずか",
  full: "満車",
};

const DAY_TYPE_LABELS: Readonly<Record<DayType, string>> = {
  weekday: "平日",
  holiday: "土日祝",
};

const TIME_PERIOD_LABELS: Readonly<Record<TimePeriod, string>> = {
  night: "夜",
  day: "日中",
};

const PARKING_STATUS_LABELS: Readonly<Record<ParkingStatus, string>> = {
  active: "利用中",
  excluded: "候補から除外",
  closed: "閉鎖",
};

const japaneseNameCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
  usage: "sort",
});

const japaneseNumberFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 2,
});

function getConfirmedAmount(lot: ParkingLot, patternId: PatternId): number | null {
  const price = lot.currentPricing.patternPrices[patternId];
  if (price.needsConfirmation || price.amountYen === null || !Number.isFinite(price.amountYen)) {
    return null;
  }
  return price.amountYen;
}

function normalizeComparableNumber(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function compareOptionalNumberAscending(left: number | null, right: number | null): number {
  const normalizedLeft = normalizeComparableNumber(left);
  const normalizedRight = normalizeComparableNumber(right);

  if (normalizedLeft === null && normalizedRight === null) return 0;
  if (normalizedLeft === null) return 1;
  if (normalizedRight === null) return -1;
  return normalizedLeft - normalizedRight;
}

function segmentForLog(log: AvailabilityLog): AvailabilitySegment {
  return `${log.dayType}_${log.timePeriod}`;
}

function compareAvailabilityPerformance(left: AvailabilitySummary, right: AvailabilitySummary): number {
  if (left.rate === null && right.rate === null) return 0;
  if (left.rate === null) return 1;
  if (right.rate === null) return -1;

  // Cross multiplication keeps equivalent ratios (for example 1/2 and 2/4)
  // equal before the sample-count tie-break.
  const rateComparison = right.parkable * left.total - left.parkable * right.total;
  if (rateComparison !== 0) return rateComparison;
  return right.total - left.total;
}

export function patternToSegment(patternId: PatternId): AvailabilitySegment {
  return SEGMENT_BY_PATTERN[patternId];
}

export function getAvailabilitySummaryForSegment(
  logs: readonly AvailabilityLog[],
  segment?: AvailabilitySegment,
): AvailabilitySummary {
  const applicableLogs = segment === undefined ? logs : logs.filter((log) => segmentForLog(log) === segment);
  let available = 0;
  let limited = 0;
  let full = 0;

  for (const log of applicableLogs) {
    if (log.status === "available") available += 1;
    if (log.status === "limited") limited += 1;
    if (log.status === "full") full += 1;
  }

  const total = available + limited + full;
  const parkable = available + limited;

  return {
    total,
    parkable,
    limited,
    full,
    rate: total === 0 ? null : parkable / total,
  };
}

export function getAvailabilitySummary(
  logs: readonly AvailabilityLog[],
  patternId?: PatternId,
): AvailabilitySummary {
  return getAvailabilitySummaryForSegment(logs, patternId === undefined ? undefined : patternToSegment(patternId));
}

/**
 * Returns a new array. Unknown and confirmation-needed prices remain visible,
 * but are grouped after every confirmed price.
 */
export function sortParkingLots(lots: readonly ParkingLot[], patternId: PatternId): ParkingLot[] {
  return lots
    .map((lot, originalIndex) => ({
      lot,
      originalIndex,
      amount: getConfirmedAmount(lot, patternId),
      availability: getAvailabilitySummary(lot.availabilityLogs, patternId),
    }))
    .sort((left, right) => {
      if (left.amount === null && right.amount !== null) return 1;
      if (left.amount !== null && right.amount === null) return -1;
      if (left.amount !== null && right.amount !== null && left.amount !== right.amount) {
        return left.amount - right.amount;
      }

      const walkComparison = compareOptionalNumberAscending(left.lot.walkMinutes, right.lot.walkMinutes);
      if (walkComparison !== 0) return walkComparison;

      const distanceComparison = compareOptionalNumberAscending(
        left.lot.walkDistanceMeters,
        right.lot.walkDistanceMeters,
      );
      if (distanceComparison !== 0) return distanceComparison;

      const easeComparison = EASE_RANK[left.lot.parkingEase] - EASE_RANK[right.lot.parkingEase];
      if (easeComparison !== 0) return easeComparison;

      const availabilityComparison = compareAvailabilityPerformance(left.availability, right.availability);
      if (availabilityComparison !== 0) return availabilityComparison;

      const nameComparison = japaneseNameCollator.compare(left.lot.name, right.lot.name);
      if (nameComparison !== 0) return nameComparison;

      return left.originalIndex - right.originalIndex;
    })
    .map(({ lot }) => lot);
}

/**
 * Adds at most one explanatory label per lot and never changes the supplied
 * list order. The more specific distance warning replaces the generic 最安
 * label, matching the wording shown in the v0.3 example.
 */
export function getRecommendationLabels(
  lots: readonly ParkingLot[],
  patternId: PatternId,
): Map<string, RecommendationLabel[]> {
  const result = new Map<string, RecommendationLabel[]>(lots.map((lot) => [lot.id, []]));
  const rankedWithConfirmedPrices = sortParkingLots(lots, patternId).filter(
    (lot) => getConfirmedAmount(lot, patternId) !== null,
  );
  const baseline = rankedWithConfirmedPrices[0];

  if (baseline === undefined) return result;

  const minimumPrice = getConfirmedAmount(baseline, patternId);
  if (minimumPrice === null) return result;

  for (const lot of lots) {
    const amount = getConfirmedAmount(lot, patternId);
    if (amount === null) continue;

    if (amount === minimumPrice) {
      const isFartherThanNearbyAlternative =
        lot.walkMinutes !== null &&
        rankedWithConfirmedPrices.some((alternative) => {
          if (alternative === lot || alternative.walkMinutes === null) return false;
          const alternativeAmount = getConfirmedAmount(alternative, patternId);
          return (
            alternativeAmount !== null &&
            alternativeAmount - minimumPrice <= 100 &&
            lot.walkMinutes! - alternative.walkMinutes >= 5
          );
        });

      result.set(lot.id, [isFartherThanNearbyAlternative ? "最安・距離長め" : "最安"]);
      continue;
    }

    if (amount - minimumPrice > 100 || lot.walkMinutes === null || baseline.walkMinutes === null) continue;

    if (baseline.walkMinutes - lot.walkMinutes >= 5) {
      result.set(lot.id, ["近さとのバランス良好"]);
      continue;
    }

    if (
      Math.abs(lot.walkMinutes - baseline.walkMinutes) <= 5 &&
      EASE_RANK[lot.parkingEase] < EASE_RANK[baseline.parkingEase]
    ) {
      result.set(lot.id, ["停めやすさ良好"]);
    }
  }

  return result;
}

export function formatYen(price: PatternPrice): string {
  const amount = normalizeComparableNumber(price.amountYen);
  if (amount === null) return price.needsConfirmation ? "要確認" : "未登録";

  const formatted = `${japaneseNumberFormatter.format(amount)}円`;
  return price.needsConfirmation ? `${formatted}（要確認）` : formatted;
}

export function formatWalkMinutes(minutes: number | null): string {
  const value = normalizeComparableNumber(minutes);
  return value === null ? "未登録" : `${japaneseNumberFormatter.format(value)}分`;
}

export function formatWalkDistance(meters: number | null): string {
  const value = normalizeComparableNumber(meters);
  return value === null ? "未登録" : `${japaneseNumberFormatter.format(value)}m`;
}

export function formatParkingEase(ease: ParkingEase): string {
  return EASE_LABELS[ease];
}

export function formatPaymentMethods(methods: readonly PaymentMethod[]): string {
  const selected = new Set(methods);
  const labels = PAYMENT_ORDER.filter((method) => selected.has(method)).map((method) => PAYMENT_LABELS[method]);
  return labels.length === 0 ? "未登録" : labels.join("、");
}

export function formatAvailabilityStatus(status: AvailabilityStatus): string {
  return AVAILABILITY_LABELS[status];
}

export function formatDayType(dayType: DayType): string {
  return DAY_TYPE_LABELS[dayType];
}

export function formatTimePeriod(timePeriod: TimePeriod): string {
  return TIME_PERIOD_LABELS[timePeriod];
}

export function formatParkingStatus(status: ParkingStatus): string {
  return PARKING_STATUS_LABELS[status];
}

export function formatPatternLabel(patternId: PatternId): string {
  return PATTERN_LABELS[patternId];
}

function formatAvailabilityCount(summary: AvailabilitySummary): string {
  if (summary.total === 0) return "記録なし";
  return `${summary.parkable}/${summary.total}回（残りわずか${summary.limited}回）`;
}

export function formatAvailabilitySummary(summary: AvailabilitySummary): string {
  return `空き実績：${formatAvailabilityCount(summary)}`;
}

export function formatJapaneseDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日時不明";

  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

function textOrUnregistered(value: string): string {
  return value.trim() === "" ? "未登録" : value.trim();
}

/** Creates copy-ready plain text for manual analysis in ChatGPT. */
export function formatAiAnalysisText(lot: ParkingLot): string {
  const pricing = lot.currentPricing;
  const patternPriceLines = PATTERN_ORDER.map(
    (patternId) => `${formatPatternLabel(patternId)}：${formatYen(pricing.patternPrices[patternId])}`,
  );
  const segmentSummaries: ReadonlyArray<[string, AvailabilitySegment]> = [
    ["平日夜", "weekday_night"],
    ["土日祝夜", "holiday_night"],
    ["平日日中", "weekday_day"],
    ["土日祝日中", "holiday_day"],
  ];
  const availabilitySummaryLines = [
    `全体：${formatAvailabilityCount(getAvailabilitySummary(lot.availabilityLogs))}`,
    ...segmentSummaries.map(
      ([label, segment]) =>
        `${label}：${formatAvailabilityCount(getAvailabilitySummaryForSegment(lot.availabilityLogs, segment))}`,
    ),
  ];
  const availabilityLogLines =
    lot.availabilityLogs.length === 0
      ? ["記録なし"]
      : lot.availabilityLogs.map((log) => {
          const memo = log.memo.trim() === "" ? "" : ` / メモ：${log.memo.trim()}`;
          return `- ${formatJapaneseDateTime(log.observedAt)} / ${formatDayType(log.dayType)} / ${formatTimePeriod(log.timePeriod)} / ${formatAvailabilityStatus(log.status)}${memo}`;
        });
  const memoLines =
    lot.memos.length === 0
      ? ["記録なし"]
      : lot.memos.map((memo) => `- ${formatJapaneseDateTime(memo.createdAt)} / ${textOrUnregistered(memo.body)}`);

  return [
    "【基本情報】",
    `正式名称：${textOrUnregistered(lot.name)}`,
    `住所：${textOrUnregistered(lot.address)}`,
    `GoogleマップURL：${textOrUnregistered(lot.mapsUrl)}`,
    `徒歩時間：${formatWalkMinutes(lot.walkMinutes)}`,
    `徒歩距離：${formatWalkDistance(lot.walkDistanceMeters)}`,
    `利用状態：${formatParkingStatus(lot.status)}`,
    `決済方法：${formatPaymentMethods(lot.paymentMethods)}`,
    `停めやすさ：${formatParkingEase(lot.parkingEase)}`,
    `停めやすさメモ：${textOrUnregistered(lot.easeNote)}`,
    "",
    "【正規料金・料金原文】",
    `料金原文：${textOrUnregistered(pricing.sourceText)}`,
    `基本時間料金：${textOrUnregistered(pricing.baseRate)}`,
    `平日最大料金：${textOrUnregistered(pricing.weekdayMaximum)}`,
    `土日祝最大料金：${textOrUnregistered(pricing.holidayMaximum)}`,
    `夜間最大料金：${textOrUnregistered(pricing.nightMaximum)}`,
    `夜間対象時間：${textOrUnregistered(pricing.nightHours)}`,
    `最大料金繰り返し：${textOrUnregistered(pricing.maximumRepeat)}`,
    `注意条件：${textOrUnregistered(pricing.exceptions)}`,
    ...patternPriceLines,
    `料金変更メモ：${textOrUnregistered(pricing.changeNote)}`,
    "",
    "【空き実績】",
    ...availabilitySummaryLines,
    "",
    "【空き状況ログ】",
    ...availabilityLogLines,
    "",
    "【メモ履歴】",
    ...memoLines,
    "",
    "【現在の考察】",
    `おすすめコメント：${textOrUnregistered(lot.recommendationComment)}`,
    `AI要約：${textOrUnregistered(lot.aiSummary)}`,
  ].join("\n");
}
