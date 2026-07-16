#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const MUTATION_HEADERS = { "X-Requested-With": "home-parking-hub" };
const PHOTO_LIMIT_BYTES = 10 * 1024 * 1024;

function price(amountYen) {
  return { amountYen, needsConfirmation: false };
}

export const SUPPLIED_PARKING_LOTS = [
  {
    imageFile: "IMG_5008.HEIC",
    imageSource: "料金看板写真",
    input: {
      name: "ラッキーパーキング東F",
      address: "",
      mapsUrl: "",
      walkMinutes: null,
      walkDistanceMeters: null,
      status: "active",
      parkingEase: "unrated",
      easeNote: "",
      paymentMethods: ["unknown"],
      recommendationComment: "",
      aiSummary: "",
      pricing: {
        sourceText: [
          "終日 40分200円",
          "平日（月〜金）7:00〜19:00 最大1,300円",
          "土日祝 7:00〜19:00 最大500円",
          "全日 19:00〜7:00 最大400円",
          "最大料金は繰り返し適用",
        ].join("\n"),
        baseRate: "終日 40分200円",
        weekdayMaximum: "平日（月〜金）7:00〜19:00 最大1,300円",
        holidayMaximum: "土日祝 7:00〜19:00 最大500円",
        nightMaximum: "全日 19:00〜7:00 最大400円",
        nightHours: "19:00〜翌7:00",
        maximumRepeat: "繰り返し適用",
        exceptions: [
          "24時間料金は、既存仕様に基準時刻がない場合の指定どおり20:00入庫〜翌20:00を基準に算出。",
          "翌19:00〜20:00は昼間最大の対象外のため、通常料金を40分単位で切り上げて400円加算。",
        ].join("\n"),
        patternPrices: {
          "WN-19": price(400),
          "WN-20": price(800),
          "HN-19": price(400),
          "HN-20": price(800),
          "W-24": price(2100),
          "H-24": price(1300),
        },
        changeNote: "添付画像 IMG_5008.HEIC の料金看板を優先して登録。",
      },
    },
    memo: [
      "夜間最大は翌7:00まで。",
      "20:00〜翌8:00では、翌7:00〜8:00の通常料金400円（40分200円を2単位へ切り上げ）が追加される。",
      "24時間料金は20:00〜翌20:00基準。夜間最大400円＋昼間最大1,300円／500円＋19:00〜20:00通常料金400円として、平日2,100円、土日祝1,300円。",
      "普通車区画は看板上「No.11〜28」と読める。",
    ].join("\n"),
  },
  {
    imageFile: "IMG_5011.HEIC",
    imageSource: "料金看板写真",
    input: {
      name: "セイワパーク博多駅東2丁目2",
      address: "",
      mapsUrl: "",
      walkMinutes: null,
      walkDistanceMeters: null,
      status: "active",
      parkingEase: "unrated",
      easeNote: "",
      paymentMethods: ["unknown"],
      recommendationComment: "",
      aiSummary: "",
      pricing: {
        sourceText: [
          "終日 60分200円",
          "平日 入庫から24時間 最大1,500円",
          "土日祝 入庫から24時間 最大800円",
          "全日 18:00〜8:00 最大500円",
        ].join("\n"),
        baseRate: "終日 60分200円",
        weekdayMaximum: "平日 入庫から24時間 最大1,500円",
        holidayMaximum: "土日祝 入庫から24時間 最大800円",
        nightMaximum: "全日 18:00〜8:00 最大500円",
        nightHours: "18:00〜翌8:00",
        maximumRepeat: "不明",
        exceptions: "",
        patternPrices: {
          "WN-19": price(500),
          "WN-20": price(500),
          "HN-19": price(500),
          "HN-20": price(500),
          "W-24": price(1500),
          "H-24": price(800),
        },
        changeNote: "添付画像 IMG_5011.HEIC の料金看板を優先して登録。",
      },
    },
    memo: [
      "夜間最大の対象時間が18:00〜翌8:00と広い。",
      "夜間利用と土日祝24時間利用の有力候補。",
      "最大料金の繰り返し適用は画像から確認できないため不明。",
    ].join("\n"),
  },
  {
    imageFile: "IMG_5012.HEIC",
    imageSource: "料金看板写真",
    input: {
      name: "セイワパーク博多駅東",
      address: "",
      mapsUrl: "",
      walkMinutes: null,
      walkDistanceMeters: null,
      status: "active",
      parkingEase: "unrated",
      easeNote: "",
      paymentMethods: ["unknown"],
      recommendationComment: "",
      aiSummary: "",
      pricing: {
        sourceText: [
          "平日 8:00〜20:00 60分200円",
          "平日 8:00〜20:00 最大1,300円",
          "平日 20:00〜8:00 60分100円",
          "平日 20:00〜8:00 最大500円",
          "土日祝 8:00〜20:00 60分100円",
          "土日祝 8:00〜20:00 最大800円",
          "土日祝 20:00〜8:00 60分100円",
          "土日祝 20:00〜8:00 最大500円",
        ].join("\n"),
        baseRate: [
          "平日 8:00〜20:00 60分200円／20:00〜8:00 60分100円",
          "土日祝 8:00〜20:00 60分100円／20:00〜8:00 60分100円",
        ].join("\n"),
        weekdayMaximum: "平日 8:00〜20:00 最大1,300円",
        holidayMaximum: "土日祝 8:00〜20:00 最大800円",
        nightMaximum: "全日 20:00〜8:00 最大500円",
        nightHours: "20:00〜翌8:00",
        maximumRepeat: "不明",
        exceptions: "24時間料金は、既存仕様に基準時刻がない場合の指定どおり20:00入庫〜翌20:00を基準に算出。",
        patternPrices: {
          "WN-19": price(700),
          "WN-20": price(500),
          "HN-19": price(600),
          "HN-20": price(500),
          "W-24": price(1800),
          "H-24": price(1300),
        },
        changeNote: "添付画像 IMG_5012.HEIC の料金看板を優先して登録。",
      },
    },
    memo: [
      "20:00〜翌8:00の利用では夜間最大料金のみ。",
      "19:00入庫の場合は、19:00〜20:00の昼間通常料金が追加される。",
      "最大料金の繰り返し適用は画像から確認できないため不明。",
    ].join("\n"),
  },
  {
    imageFile: "IMG_5016.PNG",
    imageSource: "Googleマップのスクリーンショット（料金看板参考写真）",
    input: {
      name: "あるあるパーキング博多駅東2丁目",
      address: "",
      mapsUrl: "",
      walkMinutes: null,
      walkDistanceMeters: null,
      status: "active",
      parkingEase: "unrated",
      easeNote: "",
      paymentMethods: ["unknown"],
      recommendationComment: "",
      aiSummary: "",
      pricing: {
        sourceText: [
          "夜間最大 20:00〜8:00 400円",
          "平日 8:00〜20:00 30分100円",
          "土日祝 8:00〜20:00 40分100円",
          "全日 20:00〜8:00 60分100円",
        ].join("\n"),
        baseRate: [
          "平日 8:00〜20:00 30分100円",
          "土日祝 8:00〜20:00 40分100円",
          "全日 20:00〜8:00 60分100円",
        ].join("\n"),
        weekdayMaximum: "",
        holidayMaximum: "",
        nightMaximum: "全日 20:00〜8:00 最大400円",
        nightHours: "20:00〜翌8:00",
        maximumRepeat: "不明",
        exceptions: "24時間料金は、既存仕様に基準時刻がない場合の指定どおり20:00入庫〜翌20:00を基準に算出。",
        patternPrices: {
          "WN-19": price(600),
          "WN-20": price(400),
          "HN-19": price(600),
          "HN-20": price(400),
          "W-24": price(2800),
          "H-24": price(2200),
        },
        changeNote: "添付画像 IMG_5016.PNG 内の料金看板を優先して登録。",
      },
    },
    memo: [
      "Googleマップ画面には収容台数5台との参考情報あり。収容台数は正式項目にせずメモとして保存。",
      "満車になる可能性があるとの参考表示あり。",
      "夜間利用向きで、24時間利用は割高。",
      "最大料金の繰り返し適用は画像から確認できないため不明。",
    ].join("\n"),
  },
  {
    imageFile: "IMG_5013.HEIC",
    imageSource: "料金看板写真",
    input: {
      name: "PARKS PARK 福岡博多駅東3丁目",
      address: "",
      mapsUrl: "",
      walkMinutes: null,
      walkDistanceMeters: null,
      status: "active",
      parkingEase: "unrated",
      easeNote: "",
      paymentMethods: ["unknown"],
      recommendationComment: "",
      aiSummary: "",
      pricing: {
        sourceText: [
          "8:00〜20:00 30分200円",
          "20:00〜8:00 30分100円",
          "平日 8:00〜20:00 昼間最大1,500円",
          "土日祝 8:00〜20:00 昼間最大900円",
          "全日 20:00〜8:00 夜間最大500円",
        ].join("\n"),
        baseRate: "8:00〜20:00 30分200円／20:00〜8:00 30分100円",
        weekdayMaximum: "平日 8:00〜20:00 昼間最大1,500円",
        holidayMaximum: "土日祝 8:00〜20:00 昼間最大900円",
        nightMaximum: "全日 20:00〜8:00 夜間最大500円",
        nightHours: "20:00〜翌8:00",
        maximumRepeat: "不明",
        exceptions: "24時間料金は、既存仕様に基準時刻がない場合の指定どおり20:00入庫〜翌20:00を基準に算出。",
        patternPrices: {
          "WN-19": price(900),
          "WN-20": price(500),
          "HN-19": price(900),
          "HN-20": price(500),
          "W-24": price(2000),
          "H-24": price(1400),
        },
        changeNote: "添付画像 IMG_5013.HEIC の料金看板を優先して登録。",
      },
    },
    memo: [
      "19:00入庫では、19:00〜20:00の通常料金400円が加算される。",
      "20:00〜翌8:00では夜間最大500円。",
      "最大料金の繰り返し適用は画像から確認できないため不明。",
    ].join("\n"),
  },
  {
    imageFile: "IMG_5017.PNG",
    imageSource: "Googleマップのスクリーンショット（料金看板参考写真）",
    input: {
      name: "IBパーク 駅東",
      address: "",
      mapsUrl: "",
      walkMinutes: null,
      walkDistanceMeters: null,
      status: "active",
      parkingEase: "unrated",
      easeNote: "",
      paymentMethods: ["unknown"],
      recommendationComment: "",
      aiSummary: "",
      pricing: {
        sourceText: [
          "平日 8:00〜20:00 60分200円",
          "平日 20:00〜8:00 30分100円",
          "平日 20:00〜8:00 夜間最大500円",
          "土日祝 8:00〜20:00 60分100円",
          "土日祝 20:00〜8:00 60分100円",
          "土日祝 20:00〜8:00 夜間最大400円",
        ].join("\n"),
        baseRate: [
          "平日 8:00〜20:00 60分200円／20:00〜8:00 30分100円",
          "土日祝 8:00〜20:00 60分100円／20:00〜8:00 60分100円",
        ].join("\n"),
        weekdayMaximum: "",
        holidayMaximum: "",
        nightMaximum: "平日 20:00〜8:00 最大500円／土日祝 20:00〜8:00 最大400円",
        nightHours: "20:00〜翌8:00",
        maximumRepeat: "不明",
        exceptions: "24時間料金は、既存仕様に基準時刻がない場合の指定どおり20:00入庫〜翌20:00を基準に算出。",
        patternPrices: {
          "WN-19": price(700),
          "WN-20": price(500),
          "HN-19": price(500),
          "HN-20": price(400),
          "W-24": price(2900),
          "H-24": price(1600),
        },
        changeNote: "添付画像 IMG_5017.PNG 内の料金看板を優先して登録。",
      },
    },
    memo: [
      "土日祝20:00〜翌8:00は400円。",
      "平日の24時間利用は割高。",
      "最大料金の繰り返し適用は画像から確認できないため不明。",
    ].join("\n"),
  },
];

function printUsage() {
  console.log(`Usage:
  node scripts/register-supplied-parking-lots.mjs \\
    --base-url http://127.0.0.1:8787 \\
    --access-code <local access code> \\
    --image-dir <directory containing IMG_5008.HEIC ... IMG_5017.PNG>

Safety:
  --base-url accepts HTTP loopback addresses only (127.0.0.1, ::1, localhost).
  Cloudflare production/remote URLs are rejected before any network request.`);
}

export function parseArguments(argv, environment = process.env) {
  const options = {
    baseUrl: "http://127.0.0.1:8787",
    accessCode: environment.LOCAL_ACCESS_CODE ?? "",
    imageDir: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (!["--base-url", "--access-code", "--image-dir"].includes(argument)) {
      throw new Error(`不明な引数です: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} の値を指定してください。`);
    }
    index += 1;
    if (argument === "--base-url") options.baseUrl = value;
    if (argument === "--access-code") options.accessCode = value;
    if (argument === "--image-dir") options.imageDir = value;
  }

  return options;
}

export function assertLocalBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--base-url は有効なURLで指定してください。");
  }

  const allowedHostnames = new Set(["127.0.0.1", "[::1]", "::1", "localhost"]);
  if (
    url.protocol !== "http:" ||
    !allowedHostnames.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "安全のため --base-url は http://127.0.0.1、http://[::1]、http://localhost のいずれかだけを指定できます。",
    );
  }

  return url.origin;
}

function normalizeName(value) {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("ja-JP");
}

function normalizeText(value) {
  return value.replace(/\r\n?/gu, "\n").trim();
}

function contentTypeFor(fileName) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".heic") return "image/heic";
  if (extension === ".heif") return "image/heif";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error(`対応していない画像拡張子です: ${fileName}`);
}

export function buildPhotoNote(source, sha256) {
  return `${source} | sha256=${sha256}`;
}

function parkingInputFromLot(lot) {
  const {
    name,
    address,
    mapsUrl,
    walkMinutes,
    walkDistanceMeters,
    status,
    parkingEase,
    easeNote,
    paymentMethods,
    recommendationComment,
    aiSummary,
    currentPricing,
  } = lot;
  const {
    sourceText,
    baseRate,
    weekdayMaximum,
    holidayMaximum,
    nightMaximum,
    nightHours,
    maximumRepeat,
    exceptions,
    patternPrices,
    changeNote,
  } = currentPricing;

  return {
    name,
    address,
    mapsUrl,
    walkMinutes,
    walkDistanceMeters,
    status,
    parkingEase,
    easeNote,
    paymentMethods,
    recommendationComment,
    aiSummary,
    pricing: {
      sourceText,
      baseRate,
      weekdayMaximum,
      holidayMaximum,
      nightMaximum,
      nightHours,
      maximumRepeat,
      exceptions,
      patternPrices,
      changeNote,
    },
  };
}

/**
 * Supplied photos define the name, active status, and pricing. Values the user
 * may have added later are intentionally retained when a same-name lot exists.
 */
export function parkingInputForExistingLot(lot, suppliedInput) {
  return {
    ...suppliedInput,
    address: lot.address,
    mapsUrl: lot.mapsUrl,
    walkMinutes: lot.walkMinutes,
    walkDistanceMeters: lot.walkDistanceMeters,
    parkingEase: lot.parkingEase,
    easeNote: lot.easeNote,
    paymentMethods: lot.paymentMethods,
    recommendationComment: lot.recommendationComment,
    aiSummary: lot.aiSummary,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameParkingInput(lot, input) {
  return canonicalJson(parkingInputFromLot(lot)) === canonicalJson(input);
}

function hasMatchingPhoto(lot, preparedImage) {
  return lot.photos.some(
    (photo) =>
      photo.fileName === preparedImage.fileName &&
      photo.sizeBytes === preparedImage.sizeBytes &&
      photo.kind === "price_sign" &&
      photo.note.includes(`sha256=${preparedImage.sha256}`),
  );
}

async function prepareImages(imageDir) {
  if (!imageDir) throw new Error("--image-dir を指定してください。");

  return Promise.all(
    SUPPLIED_PARKING_LOTS.map(async (definition) => {
      const path = join(imageDir, definition.imageFile);
      let fileStat;
      try {
        fileStat = await stat(path);
      } catch {
        throw new Error(`画像ファイルが見つかりません: ${path}`);
      }
      if (!fileStat.isFile()) throw new Error(`画像ファイルではありません: ${path}`);
      if (fileStat.size <= 0 || fileStat.size > PHOTO_LIMIT_BYTES) {
        throw new Error(`画像は1バイト以上10MiB以下である必要があります: ${path}`);
      }

      const bytes = await readFile(path);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return {
        path,
        bytes,
        fileName: basename(path),
        sizeBytes: bytes.byteLength,
        contentType: contentTypeFor(path),
        sha256,
        note: buildPhotoNote(definition.imageSource, sha256),
      };
    }),
  );
}

class LocalApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = "";
  }

  async request(path, init = {}) {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("Cookie", this.cookie);
    if (!["GET", "HEAD"].includes(method)) {
      for (const [key, value] of Object.entries(MUTATION_HEADERS)) headers.set(key, value);
    }
    if (init.json !== undefined) headers.set("Content-Type", "application/json");

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      // Never follow a loopback response to a non-local destination.
      redirect: "manual",
      headers,
      body: init.json === undefined ? init.body : JSON.stringify(init.json),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0];

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const detail = payload && typeof payload === "object" && "error" in payload ? payload.error : String(payload);
      throw new Error(`${method} ${path} が失敗しました (${response.status}): ${detail}`);
    }
    return payload;
  }

  async login(accessCode) {
    await this.request("/api/auth/login", { method: "POST", json: { code: accessCode } });
    if (!this.cookie) throw new Error("ローカルAPIのログインCookieを取得できませんでした。");
  }

  async listParking() {
    const payload = await this.request("/api/parking?includeInactive=true");
    return payload.parkingLots;
  }

  async createParking(input) {
    const payload = await this.request("/api/parking", { method: "POST", json: input });
    return payload.parkingLot;
  }

  async updateParking(lot, input) {
    const payload = await this.request(`/api/parking/${encodeURIComponent(lot.id)}`, {
      method: "PUT",
      json: { ...input, expectedUpdatedAt: lot.updatedAt },
    });
    return payload.parkingLot;
  }

  async addMemo(lotId, body) {
    const payload = await this.request(`/api/parking/${encodeURIComponent(lotId)}/memos`, {
      method: "POST",
      json: { body },
    });
    return payload.parkingLot;
  }

  async uploadPhoto(lotId, image) {
    const body = new FormData();
    body.append("file", new Blob([image.bytes], { type: image.contentType }), image.fileName);
    body.append("kind", "price_sign");
    body.append("note", image.note);
    const payload = await this.request(`/api/parking/${encodeURIComponent(lotId)}/photos`, {
      method: "POST",
      body,
    });
    return payload.photo;
  }

  async backup() {
    return this.request("/api/backup");
  }

  async photoBytes(photoUrl) {
    const response = await fetch(`${this.baseUrl}${photoUrl}`, {
      headers: this.cookie ? { Cookie: this.cookie } : undefined,
      redirect: "manual",
    });
    if (!response.ok) {
      throw new Error(`GET ${photoUrl} が失敗しました (${response.status})。`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

function targetMatches(lots, targetName) {
  const normalizedTarget = normalizeName(targetName);
  return lots.filter((lot) => normalizeName(lot.name) === normalizedTarget);
}

function assertNoAmbiguousTargets(lots) {
  for (const definition of SUPPLIED_PARKING_LOTS) {
    const matches = targetMatches(lots, definition.input.name);
    if (matches.length > 1) {
      throw new Error(
        `同名の既存データが${matches.length}件あるため、安全のため処理を停止しました: ${definition.input.name}`,
      );
    }
    if (matches[0]?.availabilityLogs?.length > 0) {
      throw new Error(
        `既存の空き状況ログを削除せず0/0回にすることはできないため、処理を停止しました: ${definition.input.name}`,
      );
    }
  }
}

function verifyBackup(backup, preparedImages) {
  if (![1, 2].includes(backup?.schemaVersion) || !Array.isArray(backup.parkingLots)) {
    throw new Error("JSONバックアップの形式が期待と異なります。");
  }

  let matchingPhotos = 0;
  for (const [index, definition] of SUPPLIED_PARKING_LOTS.entries()) {
    const matches = targetMatches(backup.parkingLots, definition.input.name);
    if (matches.length !== 1) {
      throw new Error(`JSONバックアップ内の登録件数が1件ではありません: ${definition.input.name}`);
    }
    const lot = matches[0];
    const expectedInput = parkingInputForExistingLot(lot, definition.input);
    if (!sameParkingInput(lot, expectedInput)) {
      throw new Error(`JSONバックアップ内の登録内容が指定値と一致しません: ${definition.input.name}`);
    }
    if (lot.availabilityLogs.length !== 0) {
      throw new Error(`JSONバックアップ内の空き状況ログが0件ではありません: ${definition.input.name}`);
    }
    if (!lot.memos.some((memo) => normalizeText(memo.body) === normalizeText(definition.memo))) {
      throw new Error(`JSONバックアップ内に指定メモがありません: ${definition.input.name}`);
    }
    if (!hasMatchingPhoto(lot, preparedImages[index])) {
      throw new Error(`JSONバックアップ内に指定写真のメタデータがありません: ${definition.input.name}`);
    }
    matchingPhotos += 1;
  }

  return { parkingLots: SUPPLIED_PARKING_LOTS.length, photos: matchingPhotos };
}

export async function runImport(options) {
  const baseUrl = assertLocalBaseUrl(options.baseUrl);
  if (!options.accessCode) {
    throw new Error("--access-code または LOCAL_ACCESS_CODE を指定してください。");
  }

  // Read and hash all six images before logging in or mutating local state.
  const preparedImages = await prepareImages(options.imageDir);
  const client = new LocalApiClient(baseUrl);
  await client.login(options.accessCode);
  let lots = await client.listParking();
  assertNoAmbiguousTargets(lots);

  const summary = {
    baseUrl,
    created: 0,
    updated: 0,
    unchanged: 0,
    memosAdded: 0,
    photosUploaded: 0,
    photoBodiesVerified: 0,
    registrations: [],
    backupVerified: { parkingLots: 0, photos: 0 },
  };

  for (const [index, definition] of SUPPLIED_PARKING_LOTS.entries()) {
    const matches = targetMatches(lots, definition.input.name);
    let lot = matches[0];
    const desiredInput = lot
      ? parkingInputForExistingLot(lot, definition.input)
      : definition.input;
    let action;
    if (!lot) {
      lot = await client.createParking(desiredInput);
      summary.created += 1;
      action = "created";
    } else if (!sameParkingInput(lot, desiredInput)) {
      lot = await client.updateParking(lot, desiredInput);
      summary.updated += 1;
      action = "updated";
    } else {
      summary.unchanged += 1;
      action = "unchanged";
    }

    if (!lot.memos.some((memo) => normalizeText(memo.body) === normalizeText(definition.memo))) {
      lot = await client.addMemo(lot.id, definition.memo);
      summary.memosAdded += 1;
    }

    const image = preparedImages[index];
    if (!hasMatchingPhoto(lot, image)) {
      const photo = await client.uploadPhoto(lot.id, image);
      lot = { ...lot, photos: [photo, ...lot.photos] };
      summary.photosUploaded += 1;
    }

    summary.registrations.push({
      name: definition.input.name,
      action,
      imageFile: image.fileName,
    });
    lots = lots.filter((existing) => existing.id !== lot.id).concat(lot);
  }

  summary.backupVerified = verifyBackup(await client.backup(), preparedImages);
  for (const [index, definition] of SUPPLIED_PARKING_LOTS.entries()) {
    const lot = targetMatches(lots, definition.input.name)[0];
    const image = preparedImages[index];
    const photo = lot?.photos.find(
      (candidate) =>
        candidate.fileName === image.fileName &&
        candidate.sizeBytes === image.sizeBytes &&
        candidate.kind === "price_sign" &&
        candidate.note.includes(`sha256=${image.sha256}`),
    );
    if (!photo) throw new Error(`写真メタデータを再取得できません: ${definition.input.name}`);
    const bytes = await client.photoBytes(photo.url);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== image.sizeBytes || hash !== image.sha256) {
      throw new Error(`保存後の写真本体が元画像と一致しません: ${definition.input.name}`);
    }
    summary.photoBodiesVerified += 1;
  }
  return summary;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printUsage();
      return;
    }
    const summary = await runImport(options);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
