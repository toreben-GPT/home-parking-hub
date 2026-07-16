import { describe, expect, it } from "vitest";
import {
  formatAiAnalysisText,
  formatAvailabilityStatus,
  formatAvailabilitySummary,
  formatDayType,
  formatJapaneseDateTime,
  formatParkingEase,
  formatParkingStatus,
  formatPatternLabel,
  formatPaymentMethods,
  formatTimePeriod,
  formatWalkDistance,
  formatWalkMinutes,
  formatYen,
  getAvailabilitySummary,
  getAvailabilitySummaryForSegment,
  getRecommendationLabels,
  patternToSegment,
  sortParkingLots,
} from "./domain";
import type {
  AvailabilityLog,
  ParkingEase,
  ParkingLot,
  ParkingLotInput,
  PatternId,
  PatternPrices,
} from "./types";

const makePatternPrices = (amountYen: number | null = 500): PatternPrices => ({
  "WN-19": { amountYen, needsConfirmation: amountYen === null },
  "WN-20": { amountYen, needsConfirmation: amountYen === null },
  "HN-19": { amountYen, needsConfirmation: amountYen === null },
  "HN-20": { amountYen, needsConfirmation: amountYen === null },
  "W-24": { amountYen, needsConfirmation: amountYen === null },
  "H-24": { amountYen, needsConfirmation: amountYen === null },
});

const makeLog = (
  status: AvailabilityLog["status"],
  overrides: Partial<AvailabilityLog> = {},
): AvailabilityLog => ({
  id: `log-${status}-${overrides.observedAt ?? "default"}`,
  parkingLotId: "lot",
  observedAt: "2026-07-15T10:00:00.000Z",
  status,
  memo: "",
  dayType: "weekday",
  timePeriod: "night",
  createdAt: "2026-07-15T10:01:00.000Z",
  ...overrides,
});

const makeLot = (
  id: string,
  overrides: Partial<Omit<ParkingLot, "currentPricing">> & {
    price?: number | null;
    needsConfirmation?: boolean;
    prices?: Partial<PatternPrices>;
    parkingEase?: ParkingEase;
    pricing?: Partial<ParkingLot["currentPricing"]>;
  } = {},
): ParkingLot => {
  const patternPrices = makePatternPrices(overrides.price === undefined ? 500 : overrides.price);
  for (const [patternId, price] of Object.entries(overrides.prices ?? {})) {
    patternPrices[patternId as PatternId] = price;
  }
  if (overrides.needsConfirmation !== undefined) {
    patternPrices["WN-19"] = {
      ...patternPrices["WN-19"],
      needsConfirmation: overrides.needsConfirmation,
    };
  }

  const currentPricing: ParkingLot["currentPricing"] = {
    id: `price-${id}`,
    parkingLotId: id,
    createdAt: "2026-07-15T09:00:00.000Z",
    isCurrent: true,
    sourceText: "終日 60分200円",
    baseRate: "60分200円",
    weekdayMaximum: "500円",
    holidayMaximum: "600円",
    nightMaximum: "500円",
    nightHours: "18:00〜翌8:00",
    maximumRepeat: "繰り返し適用",
    exceptions: "特になし",
    patternPrices,
    changeNote: "初回登録",
    ...overrides.pricing,
  };

  const input: ParkingLotInput = {
    name: overrides.name ?? id,
    address: overrides.address ?? "東京都テスト区1-2-3",
    mapsUrl: overrides.mapsUrl ?? "https://maps.google.com/?q=test",
    walkMinutes: overrides.walkMinutes === undefined ? 8 : overrides.walkMinutes,
    walkDistanceMeters: overrides.walkDistanceMeters === undefined ? 600 : overrides.walkDistanceMeters,
    status: overrides.status ?? "active",
    parkingEase: overrides.parkingEase ?? "normal",
    easeNote: overrides.easeNote ?? "入口は普通",
    paymentMethods: overrides.paymentMethods ?? ["cash"],
    recommendationComment: overrides.recommendationComment ?? "料金と距離を比較",
    aiSummary: overrides.aiSummary ?? "平日夜の候補",
    pricing: currentPricing,
  };

  return {
    ...input,
    id,
    createdAt: overrides.createdAt ?? "2026-07-15T09:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-15T09:00:00.000Z",
    currentPricing,
    pricingHistory: overrides.pricingHistory ?? [currentPricing],
    availabilityLogs: overrides.availabilityLogs ?? [],
    memos: overrides.memos ?? [],
    photos: overrides.photos ?? [],
  };
};

describe("availability domains", () => {
  it("maps all six price patterns to their matching day/time segment", () => {
    expect(patternToSegment("WN-19")).toBe("weekday_night");
    expect(patternToSegment("WN-20")).toBe("weekday_night");
    expect(patternToSegment("HN-19")).toBe("holiday_night");
    expect(patternToSegment("HN-20")).toBe("holiday_night");
    expect(patternToSegment("W-24")).toBe("weekday_day");
    expect(patternToSegment("H-24")).toBe("holiday_day");
  });

  it("counts available and limited as parkable and keeps the limited count", () => {
    const logs = [makeLog("available"), makeLog("limited"), makeLog("full")];

    expect(getAvailabilitySummary(logs)).toEqual({
      total: 3,
      parkable: 2,
      limited: 1,
      full: 1,
      rate: 2 / 3,
    });
  });

  it("uses only the selected pattern segment", () => {
    const logs = [
      makeLog("available", { dayType: "weekday", timePeriod: "night" }),
      makeLog("full", { dayType: "weekday", timePeriod: "day" }),
      makeLog("limited", { dayType: "holiday", timePeriod: "night" }),
      makeLog("full", { dayType: "holiday", timePeriod: "day" }),
    ];

    expect(getAvailabilitySummary(logs, "WN-19")).toMatchObject({ total: 1, parkable: 1, rate: 1 });
    expect(getAvailabilitySummary(logs, "WN-20")).toMatchObject({ total: 1, parkable: 1, rate: 1 });
    expect(getAvailabilitySummary(logs, "HN-19")).toMatchObject({ total: 1, parkable: 1, limited: 1 });
    expect(getAvailabilitySummary(logs, "W-24")).toMatchObject({ total: 1, parkable: 0, rate: 0 });
    expect(getAvailabilitySummary(logs, "H-24")).toMatchObject({ total: 1, parkable: 0, rate: 0 });
  });

  it("returns an explicit no-data summary when there are no matching logs", () => {
    expect(getAvailabilitySummary([], "WN-19")).toEqual({
      total: 0,
      parkable: 0,
      limited: 0,
      full: 0,
      rate: null,
    });
    expect(getAvailabilitySummaryForSegment([makeLog("available")], "holiday_day").rate).toBeNull();
  });
});

describe("sortParkingLots", () => {
  it("sorts confirmed selected-pattern prices ascending without mutating the input", () => {
    const input = [makeLot("600円", { price: 600 }), makeLot("500円", { price: 500 })];
    const snapshot = [...input];

    expect(sortParkingLots(input, "WN-19").map((lot) => lot.id)).toEqual(["500円", "600円"]);
    expect(input).toEqual(snapshot);
  });

  it("keeps unknown and confirmation-needed lots, but puts all of them after confirmed prices", () => {
    const lots = [
      makeLot("要確認100円", { price: 100, needsConfirmation: true, walkMinutes: 2 }),
      makeLot("未登録", { price: null, walkMinutes: 3 }),
      makeLot("確定900円", { price: 900, walkMinutes: 20 }),
    ];

    expect(sortParkingLots(lots, "WN-19").map((lot) => lot.id)).toEqual([
      "確定900円",
      "要確認100円",
      "未登録",
    ]);
  });

  it("uses walking minutes, then distance, with missing proximity values last", () => {
    const lots = [
      makeLot("徒歩不明", { walkMinutes: null, walkDistanceMeters: 100 }),
      makeLot("6分", { walkMinutes: 6, walkDistanceMeters: 200 }),
      makeLot("5分400m", { walkMinutes: 5, walkDistanceMeters: 400 }),
      makeLot("5分300m", { walkMinutes: 5, walkDistanceMeters: 300 }),
      makeLot("5分距離不明", { walkMinutes: 5, walkDistanceMeters: null }),
    ];

    expect(sortParkingLots(lots, "WN-19").map((lot) => lot.id)).toEqual([
      "5分300m",
      "5分400m",
      "5分距離不明",
      "6分",
      "徒歩不明",
    ]);
  });

  it("uses parking ease after equal price and proximity", () => {
    const lots = [
      makeLot("難", { parkingEase: "difficult" }),
      makeLot("普通", { parkingEase: "normal" }),
      makeLot("簡単", { parkingEase: "easy" }),
    ];

    expect(sortParkingLots(lots, "WN-19").map((lot) => lot.id)).toEqual(["簡単", "普通", "難"]);
  });

  it("uses selected-segment parkable rate, then larger sample count", () => {
    const twoOfFour = [makeLog("available"), makeLog("limited"), makeLog("full"), makeLog("full")];
    const oneOfTwo = [makeLog("available"), makeLog("full")];
    const twoOfThree = [makeLog("available"), makeLog("limited"), makeLog("full")];
    const wrongSegmentOnly = [makeLog("available", { dayType: "holiday", timePeriod: "night" })];
    const lots = [
      makeLot("記録なし", { availabilityLogs: [] }),
      makeLot("対象外ログ", { availabilityLogs: wrongSegmentOnly }),
      makeLot("1/2", { availabilityLogs: oneOfTwo }),
      makeLot("2/4", { availabilityLogs: twoOfFour }),
      makeLot("2/3", { availabilityLogs: twoOfThree }),
    ];

    expect(sortParkingLots(lots, "WN-19").map((lot) => lot.id)).toEqual([
      "2/3",
      "2/4",
      "1/2",
      "記録なし",
      "対象外ログ",
    ]);
  });

  it("uses Japanese name order only after every prior tier ties", () => {
    const lots = [
      makeLot("sakura", { name: "さくらパーキング" }),
      makeLot("aoi", { name: "あおいパーキング" }),
      makeLot("kaede", { name: "かえでパーキング" }),
    ];

    expect(sortParkingLots(lots, "WN-19").map((lot) => lot.id)).toEqual(["aoi", "kaede", "sakura"]);
  });

  it("always lets an earlier tier win over attractive later-tier values", () => {
    const cheapButFar = makeLot("cheap", {
      price: 500,
      walkMinutes: 20,
      walkDistanceMeters: 2_000,
      parkingEase: "difficult",
      availabilityLogs: [makeLog("full")],
      name: "わるい条件",
    });
    const expensiveButGood = makeLot("expensive", {
      price: 600,
      walkMinutes: 1,
      walkDistanceMeters: 10,
      parkingEase: "easy",
      availabilityLogs: [makeLog("available")],
      name: "あおい条件",
    });

    expect(sortParkingLots([expensiveButGood, cheapButFar], "WN-19").map((lot) => lot.id)).toEqual([
      "cheap",
      "expensive",
    ]);
  });
});

describe("getRecommendationLabels", () => {
  it("marks an ordinary confirmed minimum", () => {
    const lots = [makeLot("minimum", { price: 500, walkMinutes: 5 }), makeLot("other", { price: 700 })];

    expect(getRecommendationLabels(lots, "WN-19").get("minimum")).toEqual(["最安"]);
    expect(getRecommendationLabels(lots, "WN-19").get("other")).toEqual([]);
  });

  it("uses the distance-warning and balance labels at exactly 100 yen and 5 minutes", () => {
    const lots = [
      makeLot("minimum", { price: 500, walkMinutes: 11 }),
      makeLot("balance", { price: 600, walkMinutes: 6 }),
      makeLot("over-boundary", { price: 601, walkMinutes: 1 }),
    ];
    const labels = getRecommendationLabels(lots, "WN-19");

    expect(labels.get("minimum")).toEqual(["最安・距離長め"]);
    expect(labels.get("balance")).toEqual(["近さとのバランス良好"]);
    expect(labels.get("over-boundary")).toEqual([]);
  });

  it("does not apply the distance labels just below the five-minute threshold", () => {
    const lots = [makeLot("minimum", { price: 500, walkMinutes: 10 }), makeLot("near", { price: 600, walkMinutes: 6 })];
    const labels = getRecommendationLabels(lots, "WN-19");

    expect(labels.get("minimum")).toEqual(["最安"]);
    expect(labels.get("near")).toEqual([]);
  });

  it("marks a within-100-yen, within-5-minute option whose ease is better", () => {
    const lots = [
      makeLot("minimum", { price: 500, walkMinutes: 8, parkingEase: "difficult" }),
      makeLot("easy", { price: 600, walkMinutes: 12, parkingEase: "easy" }),
      makeLot("same-ease", { price: 550, walkMinutes: 8, parkingEase: "difficult" }),
      makeLot("too-far", { price: 550, walkMinutes: 14, parkingEase: "easy" }),
      makeLot("too-expensive", { price: 601, walkMinutes: 8, parkingEase: "easy" }),
    ];
    const labels = getRecommendationLabels(lots, "WN-19");

    expect(labels.get("easy")).toEqual(["停めやすさ良好"]);
    expect(labels.get("same-ease")).toEqual([]);
    expect(labels.get("too-far")).toEqual([]);
    expect(labels.get("too-expensive")).toEqual([]);
  });

  it("keeps all minimum-price lots and gives a far tied minimum the specific warning", () => {
    const lots = [
      makeLot("far-minimum", { price: 500, walkMinutes: 12 }),
      makeLot("near-minimum", { price: 500, walkMinutes: 5 }),
    ];
    const labels = getRecommendationLabels(lots, "WN-19");

    expect(labels.get("far-minimum")).toEqual(["最安・距離長め"]);
    expect(labels.get("near-minimum")).toEqual(["最安"]);
  });

  it("does not infer comparative labels when walking data or all confirmed prices are missing", () => {
    const missingWalk = [
      makeLot("minimum", { price: 500, walkMinutes: null }),
      makeLot("other", { price: 600, walkMinutes: 1, parkingEase: "easy" }),
    ];
    expect(getRecommendationLabels(missingWalk, "WN-19").get("minimum")).toEqual(["最安"]);
    expect(getRecommendationLabels(missingWalk, "WN-19").get("other")).toEqual([]);

    const unknown = [makeLot("unknown", { price: null }), makeLot("needs-check", { price: 100, needsConfirmation: true })];
    expect([...getRecommendationLabels(unknown, "WN-19").values()]).toEqual([[], []]);
  });

  it("preserves the supplied order rather than turning recommendations into ranking", () => {
    const lots = [makeLot("second", { price: 600, walkMinutes: 5 }), makeLot("first", { price: 500, walkMinutes: 10 })];
    const before = lots.map((lot) => lot.id);
    const labels = getRecommendationLabels(lots, "WN-19");

    expect([...labels.keys()]).toEqual(before);
    expect(lots.map((lot) => lot.id)).toEqual(before);
  });
});

describe("Japanese display formatters", () => {
  it("formats confirmed, confirmation-needed, and absent prices", () => {
    expect(formatYen({ amountYen: 1_200, needsConfirmation: false })).toBe("1,200円");
    expect(formatYen({ amountYen: 500, needsConfirmation: true })).toBe("500円（要確認）");
    expect(formatYen({ amountYen: null, needsConfirmation: true })).toBe("要確認");
    expect(formatYen({ amountYen: null, needsConfirmation: false })).toBe("未登録");
  });

  it("formats the exact availability expression and no-log state", () => {
    expect(formatAvailabilitySummary({ total: 10, parkable: 8, limited: 3, full: 2, rate: 0.8 })).toBe(
      "空き実績：8/10回（残りわずか3回）",
    );
    expect(formatAvailabilitySummary({ total: 0, parkable: 0, limited: 0, full: 0, rate: null })).toBe(
      "空き実績：記録なし",
    );
  });

  it("formats all basic Japanese labels and missing numeric display values", () => {
    expect(formatWalkMinutes(5)).toBe("5分");
    expect(formatWalkMinutes(null)).toBe("未登録");
    expect(formatWalkDistance(1_200)).toBe("1,200m");
    expect(formatWalkDistance(null)).toBe("未登録");
    expect(formatParkingEase("easy")).toBe("停めやすい");
    expect(formatPaymentMethods(["cashless", "cash", "cash"])).toBe("現金、キャッシュレス");
    expect(formatPaymentMethods([])).toBe("未登録");
    expect(formatAvailabilityStatus("limited")).toBe("残りわずか");
    expect(formatDayType("holiday")).toBe("土日祝");
    expect(formatTimePeriod("day")).toBe("日中");
    expect(formatParkingStatus("excluded")).toBe("候補から除外");
    expect(formatPatternLabel("HN-20")).toBe("土日祝20時〜翌8時");
  });

  it("formats timestamps in Japan time and handles invalid input", () => {
    expect(formatJapaneseDateTime("2026-07-15T10:05:00.000Z")).toBe("2026/07/15 19:05");
    expect(formatJapaneseDateTime("invalid")).toBe("日時不明");
  });
});

describe("formatAiAnalysisText", () => {
  it("creates deterministic copy-ready text with every required analysis category", () => {
    const lot = makeLot("lot-1", {
      name: "テストパーキング",
      price: 500,
      walkMinutes: 7,
      walkDistanceMeters: 550,
      parkingEase: "easy",
      paymentMethods: ["cash", "cashless"],
      availabilityLogs: [
        makeLog("limited", {
          id: "log-1",
          parkingLotId: "lot-1",
          observedAt: "2026-07-15T10:05:00.000Z",
          memo: "あと1台",
        }),
      ],
      memos: [
        {
          id: "memo-1",
          parkingLotId: "lot-1",
          body: "入口が広い",
          createdAt: "2026-07-16T01:00:00.000Z",
          updatedAt: "2026-07-16T01:00:00.000Z",
        },
      ],
    });

    const text = formatAiAnalysisText(lot);

    expect(text).toContain("【基本情報】");
    expect(text).toContain("正式名称：テストパーキング");
    expect(text).toContain("徒歩時間：7分");
    expect(text).toContain("決済方法：現金、キャッシュレス");
    expect(text).toContain("停めやすさ：停めやすい");
    expect(text).toContain("【正規料金・料金原文】");
    expect(text).toContain("料金原文：終日 60分200円");
    expect(text).toContain("平日19時〜翌7時：500円");
    expect(text).toContain("土日祝24時間：500円");
    expect(text).toContain("全体：1/1回（残りわずか1回）");
    expect(text).toContain("平日夜：1/1回（残りわずか1回）");
    expect(text).toContain("2026/07/15 19:05 / 平日 / 夜 / 残りわずか / メモ：あと1台");
    expect(text).toContain("2026/07/16 10:00 / 入口が広い");
    expect(text).toContain("おすすめコメント：料金と距離を比較");
    expect(text).toContain("AI要約：平日夜の候補");
    expect(text).not.toContain("[object Object]");
  });

  it("states missing values and empty histories instead of inventing data", () => {
    const lot = makeLot("empty", {
      address: "",
      mapsUrl: "",
      walkMinutes: null,
      walkDistanceMeters: null,
      paymentMethods: [],
      easeNote: "",
      recommendationComment: "",
      aiSummary: "",
      availabilityLogs: [],
      memos: [],
      pricing: {
        sourceText: "",
        baseRate: "",
      },
    });

    const text = formatAiAnalysisText(lot);

    expect(text).toContain("住所：未登録");
    expect(text).toContain("徒歩時間：未登録");
    expect(text).toContain("決済方法：未登録");
    expect(text).toContain("全体：記録なし");
    expect(text.match(/【空き状況ログ】\n記録なし/)).not.toBeNull();
    expect(text.match(/【メモ履歴】\n記録なし/)).not.toBeNull();
    expect(text).toContain("おすすめコメント：未登録");
  });
});
