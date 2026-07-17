import { HttpError } from "./http";

const CRLF = new Uint8Array([13, 10]);
const HEADER_SEPARATOR = new Uint8Array([13, 10, 13, 10]);
const MAX_BOUNDARY_LENGTH = 70;
const MAX_PREAMBLE_BYTES = 8 * 1024;
const MAX_PART_COUNT = 16;
const MAX_PART_HEADER_BYTES = 16 * 1024;

interface MultipartParseResult {
  formData: FormData;
  bodyBytes: number;
  usedFallback: boolean;
}

type NativeMultipartParser = (bytes: Uint8Array, contentType: string) => Promise<FormData>;

function startsWithBytes(value: Uint8Array, expected: Uint8Array, offset = 0): boolean {
  if (offset < 0 || offset + expected.length > value.length) return false;
  return expected.every((byte, index) => value[offset + index] === byte);
}

function findBytes(value: Uint8Array, expected: Uint8Array, start: number): number {
  if (expected.length === 0) return start;
  const skip = new Uint32Array(256);
  skip.fill(expected.length);
  for (let index = 0; index < expected.length - 1; index += 1) {
    skip[expected[index]] = expected.length - index - 1;
  }

  let index = Math.max(0, start);
  while (index <= value.length - expected.length) {
    let expectedIndex = expected.length - 1;
    while (expectedIndex >= 0 && value[index + expectedIndex] === expected[expectedIndex]) {
      expectedIndex -= 1;
    }
    if (expectedIndex < 0) return index;
    index += skip[value[index + expected.length - 1]] || 1;
  }
  return -1;
}

function extractBoundary(contentType: string): string {
  if (!/^multipart\/form-data(?:\s*;|\s*$)/iu.test(contentType)) {
    throw new HttpError(415, "写真はフォーム形式で送信してください。");
  }
  const match = contentType.match(/(?:^|;)\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu);
  const boundary = match?.[1] ?? match?.[2] ?? "";
  if (
    boundary.length === 0 ||
    boundary.length > MAX_BOUNDARY_LENGTH ||
    !/^[0-9A-Za-z'()+_,./:=?-]+$/u.test(boundary)
  ) {
    throw new HttpError(400, "写真フォームの境界情報が正しくありません。画面を再読み込みしてください。");
  }
  return boundary;
}

function parseHeaders(bytes: Uint8Array): Map<string, string> {
  if (bytes.length > MAX_PART_HEADER_BYTES) {
    throw new HttpError(400, "写真フォームの項目情報が大きすぎます。");
  }
  const headers = new Map<string, string>();
  const text = new TextDecoder().decode(bytes);
  for (const line of text.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new HttpError(400, "写真フォームの項目情報が正しくありません。");
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(name)) throw new HttpError(400, "写真フォームに重複した項目情報があります。");
    headers.set(name, value);
  }
  return headers;
}

function unescapeQuotedValue(value: string): string {
  return value.replace(/\\(["\\])/gu, "$1");
}

function dispositionParameter(value: string, name: string): string | null {
  const expression = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"((?:\\\\.|[^"])*)"|([^;]*))`, "iu");
  const match = value.match(expression);
  if (!match) return null;
  return unescapeQuotedValue((match[1] ?? match[2] ?? "").trim());
}

function dispositionFileName(value: string): string | null {
  const encoded = value.match(/(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]*)/iu)?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      throw new HttpError(400, "写真ファイル名の形式が正しくありません。");
    }
  }
  return dispositionParameter(value, "filename");
}

function findNextBoundary(value: Uint8Array, marker: Uint8Array, start: number): number {
  let candidate = findBytes(value, marker, start);
  while (candidate >= 0) {
    const suffix = candidate + marker.length;
    if (startsWithBytes(value, CRLF, suffix) || startsWithBytes(value, new Uint8Array([45, 45]), suffix)) {
      return candidate;
    }
    candidate = findBytes(value, marker, candidate + marker.length);
  }
  return -1;
}

function findOpeningBoundary(value: Uint8Array, marker: Uint8Array): number {
  const latestStart = Math.min(MAX_PREAMBLE_BYTES, value.length - marker.length);
  let candidate = findBytes(value, marker, 0);
  while (candidate >= 0 && candidate <= latestStart) {
    const hasValidPrefix = candidate === 0 || startsWithBytes(value, CRLF, candidate - CRLF.length);
    const suffix = candidate + marker.length;
    const hasValidSuffix =
      startsWithBytes(value, CRLF, suffix) ||
      startsWithBytes(value, new Uint8Array([45, 45]), suffix);
    if (hasValidPrefix && hasValidSuffix) return candidate;
    candidate = findBytes(value, marker, candidate + marker.length);
  }
  return -1;
}

export function parseMultipartFormDataBytes(bytes: Uint8Array, contentType: string): FormData {
  const boundary = extractBoundary(contentType);
  const encoder = new TextEncoder();
  const openingBoundary = encoder.encode(`--${boundary}`);
  const partBoundary = encoder.encode(`\r\n--${boundary}`);
  const openingBoundaryOffset = findOpeningBoundary(bytes, openingBoundary);
  if (openingBoundaryOffset < 0) {
    throw new HttpError(400, "写真フォームの先頭が正しくありません。");
  }

  const formData = new FormData();
  let position = openingBoundaryOffset + openingBoundary.length;
  let partCount = 0;
  let closed = false;

  while (!closed) {
    if (startsWithBytes(bytes, new Uint8Array([45, 45]), position)) {
      position += 2;
      if (startsWithBytes(bytes, CRLF, position)) position += CRLF.length;
      closed = true;
      break;
    }
    if (!startsWithBytes(bytes, CRLF, position)) {
      throw new HttpError(400, "写真フォームの区切りが正しくありません。");
    }
    position += CRLF.length;
    partCount += 1;
    if (partCount > MAX_PART_COUNT) throw new HttpError(400, "写真フォームの項目が多すぎます。");

    const headerEnd = findBytes(bytes, HEADER_SEPARATOR, position);
    if (headerEnd < 0) throw new HttpError(400, "写真フォームの項目情報が途中で切れています。");
    const headers = parseHeaders(bytes.slice(position, headerEnd));
    const disposition = headers.get("content-disposition") ?? "";
    if (!/^form-data(?:\s*;|\s*$)/iu.test(disposition)) {
      throw new HttpError(400, "写真フォームの項目形式が正しくありません。");
    }
    const name = dispositionParameter(disposition, "name");
    if (!name) throw new HttpError(400, "写真フォームに項目名がありません。");

    const contentStart = headerEnd + HEADER_SEPARATOR.length;
    const boundaryStart = findNextBoundary(bytes, partBoundary, contentStart);
    if (boundaryStart < 0) throw new HttpError(400, "写真フォームの本文が途中で切れています。");
    const content = bytes.slice(contentStart, boundaryStart);
    const fileName = dispositionFileName(disposition);
    if (fileName !== null) {
      const fileContentType = (headers.get("content-type") ?? "application/octet-stream").split(";", 1)[0].trim();
      formData.append(name, new File([content], fileName, { type: fileContentType }));
    } else {
      formData.append(name, new TextDecoder().decode(content));
    }
    position = boundaryStart + partBoundary.length;
  }

  if (!closed || position !== bytes.length) {
    throw new HttpError(400, "写真フォームの末尾が正しくありません。");
  }
  return formData;
}

async function readBodyWithLimit(request: Request, maximumBytes: number): Promise<Uint8Array> {
  if (request.bodyUsed) {
    throw new HttpError(400, "写真データがすでに読み取られています。画面を再読み込みしてください。");
  }
  if (!request.body) throw new HttpError(400, "写真フォームの本文がありません。");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new HttpError(413, "写真は10MB以下にしてください。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function errorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message.slice(0, 300) };
  return { name: "UnknownError", message: String(error).slice(0, 300) };
}

export async function readMultipartFormData(
  request: Request,
  maximumBytes: number,
  nativeParser: NativeMultipartParser = async (bytes, contentType) =>
    new Response(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      { headers: { "Content-Type": contentType } },
    ).formData(),
): Promise<MultipartParseResult> {
  const contentType = request.headers.get("Content-Type") ?? "";
  const boundary = extractBoundary(contentType);
  const contentLengthHeader = request.headers.get("Content-Length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new HttpError(413, "写真は10MB以下にしてください。");
  }

  const bytes = await readBodyWithLimit(request, maximumBytes);
  const openingBoundary = new TextEncoder().encode(`--${boundary}`);
  const openingBoundaryOffset = findOpeningBoundary(bytes, openingBoundary);
  try {
    const formData = await nativeParser(bytes, contentType);
    if (formData.get("file") instanceof File) {
      return { formData, bodyBytes: bytes.byteLength, usedFallback: false };
    }
    throw new TypeError("Native multipart parser did not return a File for the file field");
  } catch (error) {
    try {
      const formData = parseMultipartFormDataBytes(bytes, contentType);
      console.warn("Native multipart parser failed; bounded fallback succeeded", {
        boundaryLength: boundary.length,
        openingBoundaryOffset,
        contentLength,
        bodyBytes: bytes.byteLength,
        nativeError: errorSummary(error),
      });
      return { formData, bodyBytes: bytes.byteLength, usedFallback: true };
    } catch (fallbackError) {
      console.warn("Multipart parsing failed", {
        boundaryLength: boundary.length,
        openingBoundaryOffset,
        contentLength,
        bodyBytes: bytes.byteLength,
        nativeError: errorSummary(error),
        fallbackError: errorSummary(fallbackError),
      });
      if (fallbackError instanceof HttpError) throw fallbackError;
      throw new HttpError(400, "写真フォームを読み取れませんでした。画面を再読み込みして、もう一度お試しください。");
    }
  }
}
