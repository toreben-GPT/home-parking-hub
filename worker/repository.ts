import type {
  AvailabilityLog,
  BackupEnvelope,
  MemoEntry,
  ParkingLot,
  ParkingLotInput,
  PatternPrices,
  PaymentMethod,
  PhotoMetadata,
  PricingInput,
  PricingVersion,
} from "../src/shared/types";
import { HttpError } from "./http";
import {
  calculateRestoreQueryPlan,
  maxRowsPerInsert,
  RESTORE_SAFE_QUERY_LIMIT,
} from "./restore-plan";
import type { AvailabilityInput } from "./validation";

interface ParkingRow {
  id: string;
  name: string;
  address: string;
  maps_url: string;
  walk_minutes: number | null;
  walk_distance_meters: number | null;
  status: ParkingLot["status"];
  parking_ease: Exclude<ParkingLot["parkingEase"], "unrated">;
  parking_ease_evaluated: number;
  ease_note: string;
  payment_methods: string;
  recommendation_comment: string;
  ai_summary: string;
  created_at: string;
  updated_at: string;
}

function parkingEaseForStorage(ease: ParkingLot["parkingEase"]): {
  value: Exclude<ParkingLot["parkingEase"], "unrated">;
  evaluated: 0 | 1;
} {
  return ease === "unrated"
    ? { value: "normal", evaluated: 0 }
    : { value: ease, evaluated: 1 };
}

interface PricingRow {
  id: string;
  parking_lot_id: string;
  source_text: string;
  base_rate: string;
  weekday_maximum: string;
  holiday_maximum: string;
  night_maximum: string;
  night_hours: string;
  maximum_repeat: string;
  exceptions: string;
  pattern_prices: string;
  change_note: string;
  is_current: number;
  created_at: string;
}

interface AvailabilityRow {
  id: string;
  parking_lot_id: string;
  observed_at: string;
  status: AvailabilityLog["status"];
  memo: string;
  day_type: AvailabilityLog["dayType"];
  time_period: AvailabilityLog["timePeriod"];
  created_at: string;
}

interface MemoRow {
  id: string;
  parking_lot_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface PhotoRow {
  id: string;
  parking_lot_id: string;
  kind: PhotoMetadata["kind"];
  file_name: string;
  content_type: string;
  size_bytes: number;
  note: string;
  object_key: string;
  created_at: string;
}

function pricingRowToInput(row: PricingRow): PricingInput {
  return {
    sourceText: row.source_text,
    baseRate: row.base_rate,
    weekdayMaximum: row.weekday_maximum,
    holidayMaximum: row.holiday_maximum,
    nightMaximum: row.night_maximum,
    nightHours: row.night_hours,
    maximumRepeat: row.maximum_repeat,
    exceptions: row.exceptions,
    patternPrices: JSON.parse(row.pattern_prices) as PatternPrices,
    changeNote: row.change_note,
  };
}

function pricingRowToModel(row: PricingRow): PricingVersion {
  return {
    ...pricingRowToInput(row),
    id: row.id,
    parkingLotId: row.parking_lot_id,
    createdAt: row.created_at,
    isCurrent: row.is_current === 1,
  };
}

function availabilityRowToModel(row: AvailabilityRow): AvailabilityLog {
  return {
    id: row.id,
    parkingLotId: row.parking_lot_id,
    observedAt: row.observed_at,
    status: row.status,
    memo: row.memo,
    dayType: row.day_type,
    timePeriod: row.time_period,
    createdAt: row.created_at,
  };
}

function memoRowToModel(row: MemoRow): MemoEntry {
  return {
    id: row.id,
    parkingLotId: row.parking_lot_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function photoRowToModel(row: PhotoRow): PhotoMetadata {
  return {
    id: row.id,
    parkingLotId: row.parking_lot_id,
    kind: row.kind,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    note: row.note,
    createdAt: row.created_at,
    url: `/api/photos/${encodeURIComponent(row.id)}`,
  };
}

function parkingInsertStatement(
  db: D1Database,
  id: string,
  input: Omit<ParkingLotInput, "pricing">,
  createdAt: string,
  updatedAt: string,
): D1PreparedStatement {
  const storedEase = parkingEaseForStorage(input.parkingEase);
  return db
    .prepare(
      `INSERT INTO parking_lots (
        id, name, address, maps_url, walk_minutes, walk_distance_meters,
        status, parking_ease, parking_ease_evaluated, ease_note, payment_methods,
        recommendation_comment, ai_summary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.address,
      input.mapsUrl,
      input.walkMinutes,
      input.walkDistanceMeters,
      input.status,
      storedEase.value,
      storedEase.evaluated,
      input.easeNote,
      JSON.stringify(input.paymentMethods),
      input.recommendationComment,
      input.aiSummary,
      createdAt,
      updatedAt,
    );
}

function pricingInsertStatement(
  db: D1Database,
  value: PricingVersion,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO pricing_versions (
        id, parking_lot_id, source_text, base_rate, weekday_maximum,
        holiday_maximum, night_maximum, night_hours, maximum_repeat,
        exceptions, pattern_prices, change_note, is_current, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      value.id,
      value.parkingLotId,
      value.sourceText,
      value.baseRate,
      value.weekdayMaximum,
      value.holidayMaximum,
      value.nightMaximum,
      value.nightHours,
      value.maximumRepeat,
      value.exceptions,
      JSON.stringify(value.patternPrices),
      value.changeNote,
      value.isCurrent ? 1 : 0,
      value.createdAt,
    );
}

function conditionalPricingInsertStatement(
  db: D1Database,
  value: PricingVersion,
  expectedUpdatedAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO pricing_versions (
        id, parking_lot_id, source_text, base_rate, weekday_maximum,
        holiday_maximum, night_maximum, night_hours, maximum_repeat,
        exceptions, pattern_prices, change_note, is_current, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM parking_lots WHERE id = ? AND updated_at = ?
      )`,
    )
    .bind(
      value.id,
      value.parkingLotId,
      value.sourceText,
      value.baseRate,
      value.weekdayMaximum,
      value.holidayMaximum,
      value.nightMaximum,
      value.nightHours,
      value.maximumRepeat,
      value.exceptions,
      JSON.stringify(value.patternPrices),
      value.changeNote,
      value.isCurrent ? 1 : 0,
      value.createdAt,
      value.parkingLotId,
      expectedUpdatedAt,
    );
}

export function pricingContentChanged(current: PricingInput, next: PricingInput): boolean {
  return JSON.stringify({ ...current, changeNote: "" }) !== JSON.stringify({ ...next, changeNote: "" });
}

async function hydrateParkingRows(db: D1Database, parkingRows: ParkingRow[]): Promise<ParkingLot[]> {
  if (parkingRows.length === 0) return [];
  const idSet = new Set(parkingRows.map((row) => row.id));
  const [pricingResult, availabilityResult, memoResult, photoResult] = await Promise.all([
    db
      .prepare("SELECT * FROM pricing_versions ORDER BY is_current DESC, created_at DESC, id DESC")
      .all<PricingRow>(),
    db
      .prepare("SELECT * FROM availability_logs ORDER BY observed_at DESC, created_at DESC, id DESC")
      .all<AvailabilityRow>(),
    db.prepare("SELECT * FROM memos ORDER BY updated_at DESC, id DESC").all<MemoRow>(),
    db.prepare("SELECT * FROM photos ORDER BY created_at DESC, id DESC").all<PhotoRow>(),
  ]);

  const pricingRows = pricingResult.results.filter((row) => idSet.has(row.parking_lot_id));
  const availabilityRows = availabilityResult.results.filter((row) => idSet.has(row.parking_lot_id));
  const memoRows = memoResult.results.filter((row) => idSet.has(row.parking_lot_id));
  const photoRows = photoResult.results.filter((row) => idSet.has(row.parking_lot_id));

  return parkingRows.map((row) => {
    const pricingHistory = pricingRows
      .filter((pricing) => pricing.parking_lot_id === row.id)
      .map(pricingRowToModel);
    const currentPricing = pricingHistory.find((pricing) => pricing.isCurrent);
    if (!currentPricing) throw new Error(`Current pricing is missing for parking lot ${row.id}`);

    return {
      id: row.id,
      name: row.name,
      address: row.address,
      mapsUrl: row.maps_url,
      walkMinutes: row.walk_minutes,
      walkDistanceMeters: row.walk_distance_meters,
      status: row.status,
      parkingEase: row.parking_ease_evaluated === 0 ? "unrated" : row.parking_ease,
      easeNote: row.ease_note,
      paymentMethods: JSON.parse(row.payment_methods) as PaymentMethod[],
      recommendationComment: row.recommendation_comment,
      aiSummary: row.ai_summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      currentPricing,
      pricingHistory,
      availabilityLogs: availabilityRows
        .filter((log) => log.parking_lot_id === row.id)
        .map(availabilityRowToModel),
      memos: memoRows.filter((memo) => memo.parking_lot_id === row.id).map(memoRowToModel),
      photos: photoRows.filter((photo) => photo.parking_lot_id === row.id).map(photoRowToModel),
    };
  });
}

export async function getParkingLots(db: D1Database, includeInactive: boolean): Promise<ParkingLot[]> {
  const statement = includeInactive
    ? db.prepare("SELECT * FROM parking_lots ORDER BY updated_at DESC, name COLLATE NOCASE ASC")
    : db.prepare(
        "SELECT * FROM parking_lots WHERE status = 'active' ORDER BY updated_at DESC, name COLLATE NOCASE ASC",
      );
  const result = await statement.all<ParkingRow>();
  return hydrateParkingRows(db, result.results);
}

export async function getParkingLot(db: D1Database, id: string): Promise<ParkingLot | null> {
  const row = await db.prepare("SELECT * FROM parking_lots WHERE id = ?").bind(id).first<ParkingRow>();
  if (!row) return null;
  const lots = await hydrateParkingRows(db, [row]);
  return lots[0] ?? null;
}

export async function requireParkingLot(db: D1Database, id: string): Promise<ParkingLot> {
  const lot = await getParkingLot(db, id);
  if (!lot) throw new HttpError(404, "指定した駐車場が見つかりません。");
  return lot;
}

export async function createParkingLot(db: D1Database, input: ParkingLotInput): Promise<ParkingLot> {
  const parkingLotId = crypto.randomUUID();
  const pricingId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { pricing, ...parkingFields } = input;
  await db.batch([
    parkingInsertStatement(db, parkingLotId, parkingFields, now, now),
    pricingInsertStatement(db, {
      ...pricing,
      id: pricingId,
      parkingLotId,
      createdAt: now,
      isCurrent: true,
    }),
  ]);
  return requireParkingLot(db, parkingLotId);
}

export async function updateParkingLot(
  db: D1Database,
  id: string,
  input: ParkingLotInput,
  expectedUpdatedAt: string,
): Promise<ParkingLot> {
  const current = await db
    .prepare("SELECT * FROM pricing_versions WHERE parking_lot_id = ? AND is_current = 1")
    .bind(id)
    .first<PricingRow>();
  if (!current) {
    const exists = await db.prepare("SELECT id FROM parking_lots WHERE id = ?").bind(id).first<{ id: string }>();
    if (!exists) throw new HttpError(404, "指定した駐車場が見つかりません。");
    throw new Error(`Current pricing is missing for parking lot ${id}`);
  }

  const now = new Date(
    Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1),
  ).toISOString();
  const storedEase = parkingEaseForStorage(input.parkingEase);
  const statements: D1PreparedStatement[] = [];

  if (pricingContentChanged(pricingRowToInput(current), input.pricing)) {
    statements.push(
      db
        .prepare(
          `UPDATE pricing_versions SET is_current = 0
           WHERE parking_lot_id = ? AND is_current = 1
             AND EXISTS (
               SELECT 1 FROM parking_lots WHERE id = ? AND updated_at = ?
             )`,
        )
        .bind(id, id, expectedUpdatedAt),
      conditionalPricingInsertStatement(
        db,
        {
          ...input.pricing,
          id: crypto.randomUUID(),
          parkingLotId: id,
          createdAt: now,
          isCurrent: true,
        },
        expectedUpdatedAt,
      ),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE parking_lots SET
          name = ?, address = ?, maps_url = ?, walk_minutes = ?, walk_distance_meters = ?,
          status = ?, parking_ease = ?, parking_ease_evaluated = ?, ease_note = ?, payment_methods = ?,
          recommendation_comment = ?, ai_summary = ?, updated_at = ?
        WHERE id = ? AND updated_at = ?`,
      )
      .bind(
        input.name,
        input.address,
        input.mapsUrl,
        input.walkMinutes,
        input.walkDistanceMeters,
        input.status,
        storedEase.value,
        storedEase.evaluated,
        input.easeNote,
        JSON.stringify(input.paymentMethods),
        input.recommendationComment,
        input.aiSummary,
        now,
        id,
        expectedUpdatedAt,
      ),
  );

  const results = await db.batch(statements);
  if (Number(results.at(-1)?.meta.changes ?? 0) === 0) {
    const exists = await db.prepare("SELECT id FROM parking_lots WHERE id = ?").bind(id).first<{ id: string }>();
    if (!exists) throw new HttpError(404, "指定した駐車場が見つかりません。");
    throw new HttpError(
      409,
      "ほかの画面で先に更新されました。最新情報を読み込み直して、もう一度編集してください。",
    );
  }
  return requireParkingLot(db, id);
}

export async function addAvailability(
  db: D1Database,
  parkingLotId: string,
  input: AvailabilityInput,
): Promise<ParkingLot> {
  await requireParkingLot(db, parkingLotId);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO availability_logs
        (id, parking_lot_id, observed_at, status, memo, day_type, time_period, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      parkingLotId,
      input.observedAt,
      input.status,
      input.memo,
      input.dayType,
      input.timePeriod,
      now,
    )
    .run();
  return requireParkingLot(db, parkingLotId);
}

export async function deleteAvailability(
  db: D1Database,
  parkingLotId: string,
  logId: string,
): Promise<ParkingLot> {
  const result = await db
    .prepare("DELETE FROM availability_logs WHERE id = ? AND parking_lot_id = ?")
    .bind(logId, parkingLotId)
    .run();
  if (result.meta.changes === 0) throw new HttpError(404, "指定した空き状況の記録が見つかりません。");
  return requireParkingLot(db, parkingLotId);
}

export async function addMemo(db: D1Database, parkingLotId: string, body: string): Promise<ParkingLot> {
  await requireParkingLot(db, parkingLotId);
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO memos (id, parking_lot_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), parkingLotId, body, now, now)
    .run();
  return requireParkingLot(db, parkingLotId);
}

export async function updateMemo(
  db: D1Database,
  parkingLotId: string,
  memoId: string,
  body: string,
): Promise<ParkingLot> {
  const result = await db
    .prepare("UPDATE memos SET body = ?, updated_at = ? WHERE id = ? AND parking_lot_id = ?")
    .bind(body, new Date().toISOString(), memoId, parkingLotId)
    .run();
  if (result.meta.changes === 0) throw new HttpError(404, "指定したメモが見つかりません。");
  return requireParkingLot(db, parkingLotId);
}

export async function deleteMemo(
  db: D1Database,
  parkingLotId: string,
  memoId: string,
): Promise<ParkingLot> {
  const result = await db
    .prepare("DELETE FROM memos WHERE id = ? AND parking_lot_id = ?")
    .bind(memoId, parkingLotId)
    .run();
  if (result.meta.changes === 0) throw new HttpError(404, "指定したメモが見つかりません。");
  return requireParkingLot(db, parkingLotId);
}

export function photoObjectKey(parkingLotId: string, photoId: string): string {
  return `${parkingLotId}/${photoId}`;
}

export async function insertPhoto(
  db: D1Database,
  input: Omit<PhotoMetadata, "url">,
): Promise<PhotoMetadata> {
  const objectKey = photoObjectKey(input.parkingLotId, input.id);
  await db
    .prepare(
      `INSERT INTO photos
        (id, parking_lot_id, kind, file_name, content_type, size_bytes, note, object_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.parkingLotId,
      input.kind,
      input.fileName,
      input.contentType,
      input.sizeBytes,
      input.note,
      objectKey,
      input.createdAt,
    )
    .run();
  return { ...input, url: `/api/photos/${encodeURIComponent(input.id)}` };
}

export async function getPhotoRow(db: D1Database, photoId: string): Promise<PhotoRow | null> {
  return db.prepare("SELECT * FROM photos WHERE id = ?").bind(photoId).first<PhotoRow>();
}

export async function deletePhotoMetadata(
  db: D1Database,
  parkingLotId: string,
  photoId: string,
): Promise<PhotoRow> {
  const photo = await db
    .prepare("SELECT * FROM photos WHERE id = ? AND parking_lot_id = ?")
    .bind(photoId, parkingLotId)
    .first<PhotoRow>();
  if (!photo) throw new HttpError(404, "指定した写真が見つかりません。");
  await db.prepare("DELETE FROM photos WHERE id = ? AND parking_lot_id = ?").bind(photoId, parkingLotId).run();
  return photo;
}

function bulkInsertStatements(
  db: D1Database,
  table: string,
  columns: readonly string[],
  rows: readonly unknown[][],
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  const chunkSize = maxRowsPerInsert(columns.length);
  const rowPlaceholder = `(${columns.map(() => "?").join(", ")})`;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const placeholders = chunk.map(() => rowPlaceholder).join(", ");
    statements.push(
      db
        .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`)
        .bind(...chunk.flat()),
    );
  }

  return statements;
}

export async function replaceFromBackup(db: D1Database, backup: BackupEnvelope): Promise<ParkingLot[]> {
  const plan = calculateRestoreQueryPlan(backup);
  if (plan.totalQueries > RESTORE_SAFE_QUERY_LIMIT) {
    throw new HttpError(
      400,
      "このバックアップはデータ件数が多いため復元できません。",
      `この復元には約${plan.totalQueries.toLocaleString("ja-JP")}回のデータベース処理が必要です。`,
    );
  }

  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM photos"),
    db.prepare("DELETE FROM memos"),
    db.prepare("DELETE FROM availability_logs"),
    db.prepare("DELETE FROM pricing_versions"),
    db.prepare("DELETE FROM parking_lots"),
  ];

  const parkingRows: unknown[][] = [];
  const pricingRows: unknown[][] = [];
  const availabilityRows: unknown[][] = [];
  const memoRows: unknown[][] = [];
  const photoRows: unknown[][] = [];

  for (const lot of backup.parkingLots) {
    const { pricingHistory, availabilityLogs, memos, photos } = lot;
    const storedEase = parkingEaseForStorage(lot.parkingEase);
    parkingRows.push([
      lot.id,
      lot.name,
      lot.address,
      lot.mapsUrl,
      lot.walkMinutes,
      lot.walkDistanceMeters,
      lot.status,
      storedEase.value,
      storedEase.evaluated,
      lot.easeNote,
      JSON.stringify(lot.paymentMethods),
      lot.recommendationComment,
      lot.aiSummary,
      lot.createdAt,
      lot.updatedAt,
    ]);
    for (const pricing of pricingHistory) {
      pricingRows.push([
        pricing.id,
        lot.id,
        pricing.sourceText,
        pricing.baseRate,
        pricing.weekdayMaximum,
        pricing.holidayMaximum,
        pricing.nightMaximum,
        pricing.nightHours,
        pricing.maximumRepeat,
        pricing.exceptions,
        JSON.stringify(pricing.patternPrices),
        pricing.changeNote,
        pricing.isCurrent ? 1 : 0,
        pricing.createdAt,
      ]);
    }
    for (const availability of availabilityLogs) {
      availabilityRows.push([
        availability.id,
        lot.id,
        availability.observedAt,
        availability.status,
        availability.memo,
        availability.dayType,
        availability.timePeriod,
        availability.createdAt,
      ]);
    }
    for (const memo of memos) {
      memoRows.push([memo.id, lot.id, memo.body, memo.createdAt, memo.updatedAt]);
    }
    for (const photo of photos) {
      photoRows.push([
        photo.id,
        lot.id,
        photo.kind,
        photo.fileName,
        photo.contentType,
        photo.sizeBytes,
        photo.note,
        photoObjectKey(lot.id, photo.id),
        photo.createdAt,
      ]);
    }
  }

  statements.push(
    ...bulkInsertStatements(
      db,
      "parking_lots",
      [
        "id", "name", "address", "maps_url", "walk_minutes", "walk_distance_meters",
        "status", "parking_ease", "parking_ease_evaluated", "ease_note", "payment_methods",
        "recommendation_comment", "ai_summary", "created_at", "updated_at",
      ],
      parkingRows,
    ),
    ...bulkInsertStatements(
      db,
      "pricing_versions",
      [
        "id", "parking_lot_id", "source_text", "base_rate", "weekday_maximum",
        "holiday_maximum", "night_maximum", "night_hours", "maximum_repeat",
        "exceptions", "pattern_prices", "change_note", "is_current", "created_at",
      ],
      pricingRows,
    ),
    ...bulkInsertStatements(
      db,
      "availability_logs",
      ["id", "parking_lot_id", "observed_at", "status", "memo", "day_type", "time_period", "created_at"],
      availabilityRows,
    ),
    ...bulkInsertStatements(
      db,
      "memos",
      ["id", "parking_lot_id", "body", "created_at", "updated_at"],
      memoRows,
    ),
    ...bulkInsertStatements(
      db,
      "photos",
      ["id", "parking_lot_id", "kind", "file_name", "content_type", "size_bytes", "note", "object_key", "created_at"],
      photoRows,
    ),
  );

  await db.batch(statements);
  return getParkingLots(db, true);
}
