import {
  BACKUP_SCHEMA_VERSION,
  PHOTO_UPLOAD_LIMIT_BYTES,
} from "../src/shared/constants";
import type { BackupEnvelope } from "../src/shared/types";
import {
  assertAuthConfiguration,
  clearSessionCookie,
  createSessionToken,
  getSessionMaxAgeSeconds,
  isAuthenticated,
  sessionCookie,
  verifyAccessCode,
} from "./auth";
import type { Env } from "./env";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  methodNotAllowed,
  readJson,
  requireCsrfHeader,
} from "./http";
import {
  assertLoginAttemptAllowed,
  clearLoginFailures,
  hashLoginClient,
  recordFailedLogin,
} from "./login-rate-limit";
import { readMultipartFormData } from "./multipart";
import {
  addAvailability,
  addMemo,
  createParkingLot,
  deleteAvailability,
  deleteMemo,
  deletePhotoMetadata,
  getParkingLot,
  getParkingLots,
  getPhotoRow,
  insertPhoto,
  photoObjectKey,
  replaceFromBackup,
  requireParkingLot,
  updateMemo,
  updateParkingLot,
} from "./repository";
import {
  isAllowedPhotoContentType,
  normalizePhotoContentType,
  photoSignatureMatches,
  validateAvailabilityInput,
  validateBackupEnvelope,
  validateLoginInput,
  validateMemoInput,
  validateParkingLotInput,
  validateParkingLotUpdate,
  validatePhotoKind,
  validatePhotoNote,
} from "./validation";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const BACKUP_BODY_LIMIT_BYTES = 25 * 1024 * 1024;
const PHOTO_FORM_OVERHEAD_LIMIT_BYTES = 1024 * 1024;

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function pathSegments(pathname: string): string[] {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new HttpError(400, "URLの形式が正しくありません。");
  }
}

function sanitizeFileName(fileName: string): string {
  const lastSegment = fileName.split(/[\\/]/u).at(-1) ?? "";
  const sanitized = [...lastSegment]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("")
    .trim();
  return (sanitized || "photo").slice(0, 255);
}

function parseBackupPayload(value: unknown): unknown {
  let candidate = value;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    typeof (candidate as Record<string, unknown>).backup === "string"
  ) {
    candidate = (candidate as Record<string, unknown>).backup;
  }
  if (typeof candidate !== "string") return candidate;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    throw new HttpError(400, "バックアップJSONの形式が正しくありません。");
  }
}

async function handleAuth(request: Request, env: Env, segments: string[]): Promise<Response | null> {
  if (segments[0] !== "api" || segments[1] !== "auth" || segments.length !== 3) return null;

  if (segments[2] === "session") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse({ authenticated: await isAuthenticated(request, env) });
  }

  if (segments[2] === "login") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    assertAuthConfiguration(env);
    const { code } = validateLoginInput(await readJson(request));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const clientHash = await hashLoginClient(request, env.SESSION_SECRET);
    await assertLoginAttemptAllowed(env.DB, clientHash, nowSeconds);
    if (!(await verifyAccessCode(code, env.ACCESS_CODE))) {
      await recordFailedLogin(env.DB, clientHash, nowSeconds);
      throw new HttpError(401, "アクセスコードが正しくありません。");
    }
    await clearLoginFailures(env.DB, clientHash);
    const maxAgeSeconds = getSessionMaxAgeSeconds(env);
    const token = await createSessionToken(env.SESSION_SECRET, maxAgeSeconds);
    const secure = new URL(request.url).protocol === "https:";
    return jsonResponse(
      { authenticated: true },
      { headers: { "Set-Cookie": sessionCookie(token, maxAgeSeconds, secure) } },
    );
  }

  if (segments[2] === "logout") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const secure = new URL(request.url).protocol === "https:";
    return jsonResponse(
      { authenticated: false },
      { headers: { "Set-Cookie": clearSessionCookie(secure) } },
    );
  }

  return null;
}

export async function handlePhotoUpload(request: Request, env: Env, parkingLotId: string): Promise<Response> {
  await requireParkingLot(env.DB, parkingLotId);
  const { formData } = await readMultipartFormData(
    request,
    PHOTO_UPLOAD_LIMIT_BYTES + PHOTO_FORM_OVERHEAD_LIMIT_BYTES,
  );
  if (formData.getAll("file").length !== 1 || formData.getAll("kind").length !== 1 || formData.getAll("note").length > 1) {
    throw new HttpError(400, "写真フォームの項目が不足しているか重複しています。");
  }
  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) throw new HttpError(400, "アップロードする写真を選んでください。");
  if (fileValue.size === 0) throw new HttpError(400, "空の写真ファイルは登録できません。");
  if (fileValue.size > PHOTO_UPLOAD_LIMIT_BYTES) throw new HttpError(413, "写真は10MB以下にしてください。");

  const normalizedContentType = normalizePhotoContentType(fileValue.type, fileValue.name);
  if (!isAllowedPhotoContentType(normalizedContentType)) {
    throw new HttpError(415, "JPEG、PNG、WebP、HEIC、HEIF形式の写真だけ登録できます。");
  }
  if (!(await photoSignatureMatches(fileValue, normalizedContentType))) {
    throw new HttpError(400, "写真の内容とファイル形式が一致しません。");
  }

  const kind = validatePhotoKind(formData.get("kind"));
  const note = validatePhotoNote(formData.get("note"));
  const photoId = crypto.randomUUID();
  const objectKey = photoObjectKey(parkingLotId, photoId);
  const createdAt = new Date().toISOString();
  const fileName = sanitizeFileName(fileValue.name);

  await env.PHOTOS.put(objectKey, fileValue.stream(), {
    httpMetadata: { contentType: normalizedContentType },
    customMetadata: {
      parkingLotId,
      photoId,
      originalFileName: fileName,
      kind,
    },
  });

  try {
    const photo = await insertPhoto(env.DB, {
      id: photoId,
      parkingLotId,
      kind,
      fileName,
      contentType: normalizedContentType,
      sizeBytes: fileValue.size,
      note,
      createdAt,
    });
    return jsonResponse({ photo }, { status: 201 });
  } catch (error) {
    await env.PHOTOS.delete(objectKey);
    throw error;
  }
}

export async function handlePhotoRead(env: Env, photoId: string): Promise<Response> {
  const photo = await getPhotoRow(env.DB, photoId);
  if (!photo) throw new HttpError(404, "指定した写真が見つかりません。");
  const object = await env.PHOTOS.get(photo.object_key);
  if (!object) throw new HttpError(404, "写真ファイルが保存先に見つかりません。");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", photo.content_type);
  headers.set("Content-Length", String(object.size));
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

export async function handlePhotoDelete(env: Env, parkingLotId: string, photoId: string): Promise<Response> {
  const photo = await deletePhotoMetadata(env.DB, parkingLotId, photoId);
  try {
    await env.PHOTOS.delete(photo.object_key);
  } catch (error) {
    console.error("Failed to delete orphaned R2 photo object", {
      objectKey: photo.object_key,
      error,
    });
  }
  return jsonResponse({ parkingLot: await requireParkingLot(env.DB, parkingLotId) });
}

async function handleBackup(request: Request, env: Env, segments: string[]): Promise<Response | null> {
  if (segments[0] !== "api" || segments[1] !== "backup") return null;

  if (segments.length === 2) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const parkingLots = await getParkingLots(env.DB, true);
    const backup: BackupEnvelope = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      parkingLots,
      photoBackup: {
        binariesIncluded: false,
        note: "写真のメタデータは含まれますが、R2上の写真ファイル本体はこのJSONに含まれません。",
      },
    };
    const date = backup.exportedAt.slice(0, 10);
    return jsonResponse(backup, {
      headers: { "Content-Disposition": `attachment; filename="home-parking-hub-backup-${date}.json"` },
    });
  }

  if (segments.length === 3 && segments[2] === "restore") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const parsed = parseBackupPayload(await readJson(request, BACKUP_BODY_LIMIT_BYTES));
    const backup = validateBackupEnvelope(parsed);
    const parkingLots = await replaceFromBackup(env.DB, backup);
    return jsonResponse({ parkingLots });
  }

  return null;
}

async function handleParking(request: Request, env: Env, segments: string[], url: URL): Promise<Response | null> {
  if (segments[0] !== "api" || segments[1] !== "parking") return null;

  if (segments.length === 2) {
    if (request.method === "GET") {
      const includeInactive = url.searchParams.get("includeInactive") === "true";
      return jsonResponse({ parkingLots: await getParkingLots(env.DB, includeInactive) });
    }
    if (request.method === "POST") {
      const input = validateParkingLotInput(await readJson(request));
      return jsonResponse({ parkingLot: await createParkingLot(env.DB, input) }, { status: 201 });
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const parkingLotId = segments[2];
  if (segments.length === 3) {
    if (request.method === "GET") {
      const parkingLot = await getParkingLot(env.DB, parkingLotId);
      if (!parkingLot) throw new HttpError(404, "指定した駐車場が見つかりません。");
      return jsonResponse({ parkingLot });
    }
    if (request.method === "PUT") {
      const { input, expectedUpdatedAt } = validateParkingLotUpdate(await readJson(request));
      return jsonResponse({
        parkingLot: await updateParkingLot(env.DB, parkingLotId, input, expectedUpdatedAt),
      });
    }
    return methodNotAllowed(["GET", "PUT"]);
  }

  if (segments[3] === "availability") {
    if (segments.length === 4) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const input = validateAvailabilityInput(await readJson(request));
      return jsonResponse(
        { parkingLot: await addAvailability(env.DB, parkingLotId, input) },
        { status: 201 },
      );
    }
    if (segments.length === 5) {
      if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
      return jsonResponse({
        parkingLot: await deleteAvailability(env.DB, parkingLotId, segments[4]),
      });
    }
  }

  if (segments[3] === "memos") {
    if (segments.length === 4) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const { body } = validateMemoInput(await readJson(request));
      return jsonResponse({ parkingLot: await addMemo(env.DB, parkingLotId, body) }, { status: 201 });
    }
    if (segments.length === 5) {
      const { body } = request.method === "PUT" ? validateMemoInput(await readJson(request)) : { body: "" };
      if (request.method === "PUT") {
        return jsonResponse({ parkingLot: await updateMemo(env.DB, parkingLotId, segments[4], body) });
      }
      if (request.method === "DELETE") {
        return jsonResponse({ parkingLot: await deleteMemo(env.DB, parkingLotId, segments[4]) });
      }
      return methodNotAllowed(["PUT", "DELETE"]);
    }
  }

  if (segments[3] === "photos") {
    if (segments.length === 4) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      return handlePhotoUpload(request, env, parkingLotId);
    }
    if (segments.length === 5) {
      if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
      return handlePhotoDelete(env, parkingLotId, segments[4]);
    }
  }

  return null;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  if (MUTATION_METHODS.has(request.method)) requireCsrfHeader(request);
  const url = new URL(request.url);
  const segments = pathSegments(url.pathname);

  const authResponse = await handleAuth(request, env, segments);
  if (authResponse) return authResponse;

  if (!(await isAuthenticated(request, env))) {
    throw new HttpError(401, "ログインが必要です。");
  }

  if (segments.length === 3 && segments[0] === "api" && segments[1] === "photos") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return handlePhotoRead(env, segments[2]);
  }

  const backupResponse = await handleBackup(request, env, segments);
  if (backupResponse) return backupResponse;

  const parkingResponse = await handleParking(request, env, segments, url);
  if (parkingResponse) return parkingResponse;

  throw new HttpError(404, "指定したAPIが見つかりません。");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request);

    try {
      return await handleApi(request, env);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      console.error("API request failed", error);
      return errorResponse(new HttpError(500, "サーバーで問題が発生しました。しばらくしてから再度お試しください。"));
    }
  },
} satisfies ExportedHandler<Env>;
