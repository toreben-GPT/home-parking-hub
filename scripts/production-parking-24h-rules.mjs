import { calculateCheapest24HourPrice } from "./parking-price-calculator.mjs";

function band(startHour, endHour, unitMinutes, unitYen, maximumYen = null) {
  return {
    startMinute: startHour * 60,
    endMinute: endHour * 60,
    unitMinutes,
    unitYen,
    maximumYen,
  };
}

export const PRODUCTION_24_HOUR_RULES = [
  {
    name: "DパーキンググレースK博多PS第1",
    evidenceFile: "IMG_5597.jpeg",
    weekday: { timeBands: [band(8, 20, 40, 100, 600), band(20, 8, 60, 100, 300)] },
    holiday: { timeBands: [band(8, 20, 40, 100, 600), band(20, 8, 60, 100, 300)] },
  },
  {
    name: "IBパーク駅東",
    evidenceFile: "IMG_5017.png",
    weekday: { timeBands: [band(8, 20, 60, 200), band(20, 8, 30, 100, 500)] },
    holiday: { timeBands: [band(8, 20, 60, 100), band(20, 8, 60, 100, 400)] },
  },
  {
    name: "PARKS PARK福岡博多駅東3丁目",
    evidenceFile: "IMG_5013.jpeg",
    weekday: { timeBands: [band(8, 20, 30, 200, 1_500), band(20, 8, 30, 100, 500)] },
    holiday: { timeBands: [band(8, 20, 30, 200, 900), band(20, 8, 30, 100, 500)] },
  },
  {
    name: "あるあるパーキング博多駅東2丁目",
    evidenceFile: "IMG_5016.png",
    weekday: { timeBands: [band(8, 20, 30, 100), band(20, 8, 60, 100, 400)] },
    holiday: { timeBands: [band(8, 20, 40, 100), band(20, 8, 60, 100, 400)] },
  },
  {
    name: "セイワパーク博多駅東",
    evidenceFile: "IMG_5012.jpeg",
    weekday: { timeBands: [band(8, 20, 60, 200, 1_300), band(20, 8, 60, 100, 500)] },
    holiday: { timeBands: [band(8, 20, 60, 100, 800), band(20, 8, 60, 100, 500)] },
  },
  {
    name: "セイワパーク博多駅東2丁目2",
    evidenceFile: "IMG_5011.jpeg",
    weekday: {
      rolling24HourMaximumYen: 1_500,
      timeBands: [band(8, 18, 60, 200), band(18, 8, 60, 200, 500)],
    },
    holiday: {
      rolling24HourMaximumYen: 800,
      timeBands: [band(8, 18, 60, 200), band(18, 8, 60, 200, 500)],
    },
  },
  {
    name: "タイムスペース 博多駅東第6駐車場",
    evidenceFile: "IMG_5596.jpeg",
    weekday: { timeBands: [band(8, 20, 60, 200), band(20, 8, 60, 100, 300)] },
    holiday: { timeBands: [band(8, 20, 60, 100), band(20, 8, 60, 100, 300)] },
  },
  {
    name: "タイムスペース 博多駅東第7駐車場",
    evidenceFile: "IMG_5599.jpeg",
    weekday: { timeBands: [band(8, 20, 60, 100), band(20, 8, 60, 100, 300)] },
    holiday: { timeBands: [band(8, 20, 60, 100), band(20, 8, 60, 100, 300)] },
  },
  {
    name: "タイムパーク 駅東エヌアイパーキング",
    evidenceFile: "IMG_5603.jpeg",
    weekday: { timeBands: [band(8, 20, 30, 100, 1_200), band(20, 8, 60, 100, 500)] },
    holiday: { timeBands: [band(8, 20, 60, 100, 500), band(20, 8, 60, 100, 500)] },
  },
  {
    name: "ライオンパーキング東F",
    evidenceFile: "IMG_5008.jpeg",
    weekday: { timeBands: [band(7, 19, 40, 200, 1_300), band(19, 7, 40, 200, 400)] },
    holiday: { timeBands: [band(7, 19, 40, 200, 500), band(19, 7, 40, 200, 400)] },
  },
  {
    name: "ライオンパーク駅東7",
    evidenceFile: "IMG_5598.jpeg",
    weekday: { timeBands: [band(8, 20, 30, 100, 1_200), band(20, 8, 30, 100, 700)] },
    holiday: { timeBands: [band(8, 20, 60, 100, 700), band(20, 8, 60, 100, 400)] },
  },
];

export const PRODUCTION_24_HOUR_NEEDS_CONFIRMATION = [
  {
    name: "セイワパーク比恵町4",
    evidenceFile: "IMG_5602.jpeg",
    reason: "看板写真に時間帯最大額はあるが、基本時間料金が写っていないため最安額を確定できない。",
  },
  {
    name: "テスト",
    evidenceFile: null,
    reason: "料金看板写真と料金条件が登録されていない。",
  },
];

export function calculateProduction24HourAudit() {
  return PRODUCTION_24_HOUR_RULES.map((definition) => ({
    name: definition.name,
    evidenceFile: definition.evidenceFile,
    weekday24HourYen: calculateCheapest24HourPrice(definition.weekday).amountYen,
    holiday24HourYen: calculateCheapest24HourPrice(definition.holiday).amountYen,
  }));
}
