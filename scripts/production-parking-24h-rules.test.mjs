import { describe, expect, it } from "vitest";

import {
  PRODUCTION_24_HOUR_NEEDS_CONFIRMATION,
  calculateProduction24HourAudit,
} from "./production-parking-24h-rules.mjs";

describe("production parking 24-hour audit", () => {
  it("calculates every parking lot whose complete rate rules are readable", () => {
    expect(calculateProduction24HourAudit()).toEqual([
      { name: "DパーキンググレースK博多PS第1", evidenceFile: "IMG_5597.jpeg", weekday24HourYen: 900, holiday24HourYen: 900 },
      { name: "IBパーク駅東", evidenceFile: "IMG_5017.png", weekday24HourYen: 2_900, holiday24HourYen: 1_600 },
      { name: "PARKS PARK福岡博多駅東3丁目", evidenceFile: "IMG_5013.jpeg", weekday24HourYen: 2_000, holiday24HourYen: 1_400 },
      { name: "あるあるパーキング博多駅東2丁目", evidenceFile: "IMG_5016.png", weekday24HourYen: 2_800, holiday24HourYen: 2_200 },
      { name: "セイワパーク博多駅東", evidenceFile: "IMG_5012.jpeg", weekday24HourYen: 1_800, holiday24HourYen: 1_300 },
      { name: "セイワパーク博多駅東2丁目2", evidenceFile: "IMG_5011.jpeg", weekday24HourYen: 1_500, holiday24HourYen: 800 },
      { name: "タイムスペース 博多駅東第6駐車場", evidenceFile: "IMG_5596.jpeg", weekday24HourYen: 2_700, holiday24HourYen: 1_500 },
      { name: "タイムスペース 博多駅東第7駐車場", evidenceFile: "IMG_5599.jpeg", weekday24HourYen: 1_500, holiday24HourYen: 1_500 },
      { name: "タイムパーク 駅東エヌアイパーキング", evidenceFile: "IMG_5603.jpeg", weekday24HourYen: 1_700, holiday24HourYen: 1_000 },
      { name: "ライオンパーキング東F", evidenceFile: "IMG_5008.jpeg", weekday24HourYen: 1_700, holiday24HourYen: 900 },
      { name: "ライオンパーク駅東7", evidenceFile: "IMG_5598.jpeg", weekday24HourYen: 1_900, holiday24HourYen: 1_100 },
    ]);
  });

  it("keeps incomplete evidence out of the calculator", () => {
    expect(PRODUCTION_24_HOUR_NEEDS_CONFIRMATION.map(({ name }) => name)).toEqual([
      "セイワパーク比恵町4",
      "テスト",
    ]);
  });
});
