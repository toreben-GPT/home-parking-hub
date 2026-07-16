import {
  BACKUP_SCHEMA_VERSION,
  PHOTO_UPLOAD_LIMIT_BYTES,
} from "../src/shared/constants";
import type {
  AvailabilityLog,
  AvailabilityStatus,
  BackupEnvelope,
  DayType,
  MemoEntry,
  ParkingEase,
  ParkingLot,
  ParkingLotInput,
  ParkingStatus,
  PatternPrices,
  PaymentMethod,
  PhotoKind,
  PhotoMetadata,
  PricingInput,
  PricingVersion,
  TimePeriod,
} from "../src/shared/types";
import { PATTERN_IDS } from "../src/shared/types";
import { HttpError } from "./http";
import { calculateRestoreQueryPlan, RESTORE_SAFE_QUERY_LIMIT } from "./restore-plan";

const PARKING_STATUSES = ["active", "excluded", "closed"] as const;
const PARKING_EASES = ["easy", "normal", "difficult"] as const;
const PAYMENT_METHODS = ["cash", "cashless", "unknown"] as const;
const AVAILABILITY_STATUSES = ["available", "limited", "full"] as const;
const DAY_TYPES = ["weekday", "holiday"] as const;
const TIME_PERIODS = ["night", "day"] as const;
const PHOTO_KINDS = ["price_sign", "entrance", "overview", "other"] as const;

export const ALLOWED_PHOTO_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/x-heic",
  "image/x-heif",
]);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export class ValidationError extends HttpError {
  constructor(details: string, message = "入力内容を確認してください。") {
    super(400, message, details);
    this.name = "ValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ValidationError(`${path} はオブジェクトで指定してください。`);
  return value;
}

function stringValue(
  value: unknown,
  path: string,
  options: { min?: number; max: number; trim?: boolean },
): string {
  if (typeof value !== "string") throw new ValidationError(`${path} は文字列で指定してください。`);
  const result = options.trim === false ? value : value.trim();
  const min = options.min ?? 0;
  if (result.length < min) throw new ValidationError(`${path} を入力してください。`);
  if (result.length > options.max) {
    throw new ValidationError(`${path} は${options.max}文字以内で入力してください。`);
  }
  return result;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(`${path} の値が正しくありません。`);
  }
  return value as T[number];
}

function nullableInteger(value: unknown, path: string, max: number): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0 || value > max) {
    throw new ValidationError(`${path} は0以上${max.toLocaleString("ja-JP")}以下の整数で指定してください。`);
  }
  return value;
}

function dateTime(value: unknown, path: string): string {
  const result = stringValue(value, path, { min: 1, max: 64, trim: true });
  if (!Number.isFinite(Date.parse(result))) throw new ValidationError(`${path} は有効な日時で指定してください。`);
  return result;
}

function idValue(value: unknown, path: string): string {
  const result = stringValue(value, path, { min: 1, max: 128, trim: true });
  if (!ID_PATTERN.test(result)) throw new ValidationError(`${path} の形式が正しくありません。`);
  return result;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError(`${path} は true または false で指定してください。`);
  return value;
}

function validateMapsUrl(value: unknown): string {
  const result = stringValue(value, "mapsUrl", { max: 2048, trim: true });
  if (!result) return result;
  try {
    const url = new URL(result);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    throw new ValidationError("mapsUrl は http:// または https:// で始まるURLを指定してください。");
  }
  return result;
}

export function validatePricingInput(value: unknown, path = "pricing"): PricingInput {
  const input = record(value, path);
  const pricesValue = record(input.patternPrices, `${path}.patternPrices`);
  const knownPatternIds = new Set<string>(PATTERN_IDS);
  const unknownPatternId = Object.keys(pricesValue).find((key) => !knownPatternIds.has(key));
  if (unknownPatternId) {
    throw new ValidationError(`${path}.patternPrices に不明なパターン「${unknownPatternId}」があります。`);
  }

  const patternPrices = {} as PatternPrices;
  for (const patternId of PATTERN_IDS) {
    const pattern = record(pricesValue[patternId], `${path}.patternPrices.${patternId}`);
    const amount = pattern.amountYen;
    if (
      amount !== null &&
      (!Number.isInteger(amount) || typeof amount !== "number" || amount < 0 || amount > 10_000_000)
    ) {
      throw new ValidationError(
        `${path}.patternPrices.${patternId}.amountYen は null または0以上の整数で指定してください。`,
      );
    }
    patternPrices[patternId] = {
      amountYen: amount,
      needsConfirmation: booleanValue(
        pattern.needsConfirmation,
        `${path}.patternPrices.${patternId}.needsConfirmation`,
      ),
    };
  }

  return {
    sourceText: stringValue(input.sourceText, `${path}.sourceText`, { max: 20_000, trim: false }),
    baseRate: stringValue(input.baseRate, `${path}.baseRate`, { max: 2000 }),
    weekdayMaximum: stringValue(input.weekdayMaximum, `${path}.weekdayMaximum`, { max: 2000 }),
    holidayMaximum: stringValue(input.holidayMaximum, `${path}.holidayMaximum`, { max: 2000 }),
    nightMaximum: stringValue(input.nightMaximum, `${path}.nightMaximum`, { max: 2000 }),
    nightHours: stringValue(input.nightHours, `${path}.nightHours`, { max: 2000 }),
    maximumRepeat: stringValue(input.maximumRepeat, `${path}.maximumRepeat`, { max: 2000 }),
    exceptions: stringValue(input.exceptions, `${path}.exceptions`, { max: 4000, trim: false }),
    patternPrices,
    changeNote: stringValue(input.changeNote, `${path}.changeNote`, { max: 2000, trim: false }),
  };
}

function validateParkingFields(input: Record<string, unknown>, pricing: PricingInput): ParkingLotInput {
  const methods = input.paymentMethods;
  if (!Array.isArray(methods)) throw new ValidationError("paymentMethods は配列で指定してください。");
  const paymentMethods = methods.map((method, index) =>
    enumValue(method, PAYMENT_METHODS, `paymentMethods[${index}]`),
  );
  if (new Set(paymentMethods).size !== paymentMethods.length) {
    throw new ValidationError("paymentMethods に同じ支払い方法が重複しています。");
  }

  return {
    name: stringValue(input.name, "name", { min: 1, max: 120 }),
    address: stringValue(input.address, "address", { max: 300 }),
    mapsUrl: validateMapsUrl(input.mapsUrl),
    walkMinutes: nullableInteger(input.walkMinutes, "walkMinutes", 10_000),
    walkDistanceMeters: nullableInteger(input.walkDistanceMeters, "walkDistanceMeters", 10_000_000),
    status: enumValue(input.status, PARKING_STATUSES, "status") as ParkingStatus,
    parkingEase: enumValue(input.parkingEase, PARKING_EASES, "parkingEase") as ParkingEase,
    easeNote: stringValue(input.easeNote, "easeNote", { max: 2000, trim: false }),
    paymentMethods: paymentMethods as PaymentMethod[],
    recommendationComment: stringValue(input.recommendationComment, "recommendationComment", {
      max: 4000,
      trim: false,
    }),
    aiSummary: stringValue(input.aiSummary, "aiSummary", { max: 10_000, trim: false }),
    pricing,
  };
}

export function validateParkingLotInput(value: unknown): ParkingLotInput {
  const input = record(value, "駐車場情報");
  return validateParkingFields(input, validatePricingInput(input.pricing));
}

export function validateParkingLotUpdate(value: unknown): {
  input: ParkingLotInput;
  expectedUpdatedAt: string;
} {
  const body = record(value, "駐車場情報");
  return {
    input: validateParkingLotInput(body),
    expectedUpdatedAt: dateTime(body.expectedUpdatedAt, "expectedUpdatedAt"),
  };
}

export interface AvailabilityInput {
  observedAt: string;
  status: AvailabilityStatus;
  memo: string;
  dayType: DayType;
  timePeriod: TimePeriod;
}

export function validateAvailabilityInput(value: unknown): AvailabilityInput {
  const input = record(value, "空き状況");
  return {
    observedAt: dateTime(input.observedAt, "observedAt"),
    status: enumValue(input.status, AVAILABILITY_STATUSES, "status") as AvailabilityStatus,
    memo: input.memo === undefined ? "" : stringValue(input.memo, "memo", { max: 2000, trim: false }),
    dayType: enumValue(input.dayType, DAY_TYPES, "dayType") as DayType,
    timePeriod: enumValue(input.timePeriod, TIME_PERIODS, "timePeriod") as TimePeriod,
  };
}

export function validateMemoInput(value: unknown): { body: string } {
  const input = record(value, "メモ");
  return { body: stringValue(input.body, "body", { min: 1, max: 10_000, trim: false }) };
}

export function validateLoginInput(value: unknown): { code: string } {
  const input = record(value, "ログイン情報");
  return { code: stringValue(input.code, "code", { min: 1, max: 256, trim: false }) };
}

export function isAllowedPhotoContentType(value: string): boolean {
  return ALLOWED_PHOTO_CONTENT_TYPES.has(value.toLowerCase().split(";", 1)[0].trim());
}

export function normalizePhotoContentType(value: string, fileName: string): string {
  const normalized = value.toLowerCase().split(";", 1)[0].trim();
  if (isAllowedPhotoContentType(normalized)) return normalized;
  if (normalized && normalized !== "application/octet-stream") return normalized;

  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
  const byExtension: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };
  return byExtension[extension] ?? normalized;
}

export function validatePhotoKind(value: unknown): PhotoKind {
  return enumValue(value, PHOTO_KINDS, "kind") as PhotoKind;
}

export function validatePhotoNote(value: unknown): string {
  if (value === undefined || value === null) return "";
  return stringValue(value, "note", { max: 2000, trim: false });
}

export async function photoSignatureMatches(file: File, normalizedContentType: string): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (normalizedContentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (normalizedContentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (normalizedContentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      decoderText(bytes.slice(0, 4)) === "RIFF" &&
      decoderText(bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (bytes.length < 12 || decoderText(bytes.slice(4, 8)) !== "ftyp") return false;
  const allowedBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);
  const brands = [decoderText(bytes.slice(8, 12))];
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) {
    brands.push(decoderText(bytes.slice(offset, offset + 4)));
  }
  return brands.some((brand) => allowedBrands.has(brand));
}

function decoderText(bytes: Uint8Array): string {
  return new TextDecoder("ascii").decode(bytes);
}

function validatePricingVersion(value: unknown, path: string, expectedLotId: string): PricingVersion {
  const input = record(value, path);
  const parkingLotId = idValue(input.parkingLotId, `${path}.parkingLotId`);
  if (parkingLotId !== expectedLotId) {
    throw new ValidationError(`${path}.parkingLotId が親の駐車場IDと一致しません。`);
  }
  return {
    ...validatePricingInput(input, path),
    id: idValue(input.id, `${path}.id`),
    parkingLotId,
    createdAt: dateTime(input.createdAt, `${path}.createdAt`),
    isCurrent: booleanValue(input.isCurrent, `${path}.isCurrent`),
  };
}

function validateAvailabilityLog(value: unknown, path: string, expectedLotId: string): AvailabilityLog {
  const input = record(value, path);
  const parkingLotId = idValue(input.parkingLotId, `${path}.parkingLotId`);
  if (parkingLotId !== expectedLotId) {
    throw new ValidationError(`${path}.parkingLotId が親の駐車場IDと一致しません。`);
  }
  return {
    id: idValue(input.id, `${path}.id`),
    parkingLotId,
    observedAt: dateTime(input.observedAt, `${path}.observedAt`),
    status: enumValue(input.status, AVAILABILITY_STATUSES, `${path}.status`) as AvailabilityStatus,
    memo: stringValue(input.memo, `${path}.memo`, { max: 2000, trim: false }),
    dayType: enumValue(input.dayType, DAY_TYPES, `${path}.dayType`) as DayType,
    timePeriod: enumValue(input.timePeriod, TIME_PERIODS, `${path}.timePeriod`) as TimePeriod,
    createdAt: dateTime(input.createdAt, `${path}.createdAt`),
  };
}

function validateMemo(value: unknown, path: string, expectedLotId: string): MemoEntry {
  const input = record(value, path);
  const parkingLotId = idValue(input.parkingLotId, `${path}.parkingLotId`);
  if (parkingLotId !== expectedLotId) {
    throw new ValidationError(`${path}.parkingLotId が親の駐車場IDと一致しません。`);
  }
  return {
    id: idValue(input.id, `${path}.id`),
    parkingLotId,
    body: stringValue(input.body, `${path}.body`, { min: 1, max: 10_000, trim: false }),
    createdAt: dateTime(input.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(input.updatedAt, `${path}.updatedAt`),
  };
}

function validatePhoto(value: unknown, path: string, expectedLotId: string): PhotoMetadata {
  const input = record(value, path);
  const parkingLotId = idValue(input.parkingLotId, `${path}.parkingLotId`);
  if (parkingLotId !== expectedLotId) {
    throw new ValidationError(`${path}.parkingLotId が親の駐車場IDと一致しません。`);
  }
  const contentType = stringValue(input.contentType, `${path}.contentType`, { min: 1, max: 100 }).toLowerCase();
  if (!isAllowedPhotoContentType(contentType)) {
    throw new ValidationError(`${path}.contentType は対応している画像形式ではありません。`);
  }
  const sizeBytes = nullableInteger(input.sizeBytes, `${path}.sizeBytes`, PHOTO_UPLOAD_LIMIT_BYTES);
  if (sizeBytes === null || sizeBytes === 0) {
    throw new ValidationError(`${path}.sizeBytes は1以上で指定してください。`);
  }
  return {
    id: idValue(input.id, `${path}.id`),
    parkingLotId,
    kind: enumValue(input.kind, PHOTO_KINDS, `${path}.kind`) as PhotoKind,
    fileName: stringValue(input.fileName, `${path}.fileName`, { min: 1, max: 255, trim: false }),
    contentType,
    sizeBytes,
    note: stringValue(input.note, `${path}.note`, { max: 2000, trim: false }),
    createdAt: dateTime(input.createdAt, `${path}.createdAt`),
    url: stringValue(input.url, `${path}.url`, { max: 2048, trim: false }),
  };
}

function uniqueIds(items: readonly { id: string }[], path: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new ValidationError(`${path} にID「${item.id}」が重複しています。`);
    ids.add(item.id);
  }
}

function validateBackupParkingLot(value: unknown, path: string): ParkingLot {
  const input = record(value, path);
  const id = idValue(input.id, `${path}.id`);
  const pricingValues = input.pricingHistory;
  if (!Array.isArray(pricingValues) || pricingValues.length === 0) {
    throw new ValidationError(`${path}.pricingHistory には1件以上の料金履歴が必要です。`);
  }
  const pricingHistory = pricingValues.map((pricing, index) =>
    validatePricingVersion(pricing, `${path}.pricingHistory[${index}]`, id),
  );
  uniqueIds(pricingHistory, `${path}.pricingHistory`);
  const currentVersions = pricingHistory.filter((pricing) => pricing.isCurrent);
  if (currentVersions.length !== 1) {
    throw new ValidationError(`${path}.pricingHistory には現在料金を1件だけ指定してください。`);
  }
  const declaredCurrent = validatePricingVersion(input.currentPricing, `${path}.currentPricing`, id);
  if (!declaredCurrent.isCurrent || declaredCurrent.id !== currentVersions[0].id) {
    throw new ValidationError(`${path}.currentPricing と pricingHistory の現在料金が一致しません。`);
  }

  if (!Array.isArray(input.availabilityLogs)) {
    throw new ValidationError(`${path}.availabilityLogs は配列で指定してください。`);
  }
  if (!Array.isArray(input.memos)) throw new ValidationError(`${path}.memos は配列で指定してください。`);
  if (!Array.isArray(input.photos)) throw new ValidationError(`${path}.photos は配列で指定してください。`);

  const availabilityLogs = input.availabilityLogs.map((log, index) =>
    validateAvailabilityLog(log, `${path}.availabilityLogs[${index}]`, id),
  );
  const memos = input.memos.map((memo, index) => validateMemo(memo, `${path}.memos[${index}]`, id));
  const photos = input.photos.map((photo, index) => validatePhoto(photo, `${path}.photos[${index}]`, id));
  uniqueIds(availabilityLogs, `${path}.availabilityLogs`);
  uniqueIds(memos, `${path}.memos`);
  uniqueIds(photos, `${path}.photos`);

  const fields = validateParkingFields(input, declaredCurrent);
  return {
    name: fields.name,
    address: fields.address,
    mapsUrl: fields.mapsUrl,
    walkMinutes: fields.walkMinutes,
    walkDistanceMeters: fields.walkDistanceMeters,
    status: fields.status,
    parkingEase: fields.parkingEase,
    easeNote: fields.easeNote,
    paymentMethods: fields.paymentMethods,
    recommendationComment: fields.recommendationComment,
    aiSummary: fields.aiSummary,
    id,
    createdAt: dateTime(input.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(input.updatedAt, `${path}.updatedAt`),
    currentPricing: currentVersions[0],
    pricingHistory,
    availabilityLogs,
    memos,
    photos,
  };
}

export function validateBackupEnvelope(value: unknown): BackupEnvelope {
  const input = record(value, "バックアップ");
  if (input.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new ValidationError(
      `schemaVersion は ${BACKUP_SCHEMA_VERSION} のバックアップだけ復元できます。`,
      "このバックアップ形式には対応していません。",
    );
  }
  if (!Array.isArray(input.parkingLots)) {
    throw new ValidationError("parkingLots は配列で指定してください。");
  }
  const parkingLots = input.parkingLots.map((lot, index) =>
    validateBackupParkingLot(lot, `parkingLots[${index}]`),
  );
  uniqueIds(parkingLots, "parkingLots");
  uniqueIds(parkingLots.flatMap((lot) => lot.pricingHistory), "pricingHistory全体");
  uniqueIds(parkingLots.flatMap((lot) => lot.availabilityLogs), "availabilityLogs全体");
  uniqueIds(parkingLots.flatMap((lot) => lot.memos), "memos全体");
  uniqueIds(parkingLots.flatMap((lot) => lot.photos), "photos全体");

  const photoBackup = record(input.photoBackup, "photoBackup");
  if (photoBackup.binariesIncluded !== false) {
    throw new ValidationError("写真ファイルを含むバックアップ形式には対応していません。");
  }

  const backup: BackupEnvelope = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: dateTime(input.exportedAt, "exportedAt"),
    parkingLots,
    photoBackup: {
      binariesIncluded: false,
      note: stringValue(photoBackup.note, "photoBackup.note", { max: 2000, trim: false }),
    },
  };

  const plan = calculateRestoreQueryPlan(backup);
  if (plan.totalQueries > RESTORE_SAFE_QUERY_LIMIT) {
    throw new ValidationError(
      `この復元には約${plan.totalQueries.toLocaleString("ja-JP")}回のデータベース処理が必要です。安全上限は${RESTORE_SAFE_QUERY_LIMIT.toLocaleString("ja-JP")}回です。`,
      "このバックアップはデータ件数が多いため復元できません。",
    );
  }

  return backup;
}
