import { describe, expect, it, vi } from "vitest";
import { HttpError } from "./http";
import { parseMultipartFormDataBytes, readMultipartFormData } from "./multipart";

const encoder = new TextEncoder();

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function requestBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function safariMultipartBody(boundary: string, fileBytes: Uint8Array): Uint8Array {
  return joinBytes([
    encoder.encode(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="料金看板.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`,
    ),
    fileBytes,
    encoder.encode(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="kind"\r\n\r\n` +
      `price_sign\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="note"\r\n\r\n` +
      `Safariから送信\r\n` +
      `--${boundary}--\r\n`,
    ),
  ]);
}

describe("bounded multipart parser", () => {
  const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

  it("parses Safari-style UTF-8 filenames without changing the boundary", async () => {
    const formData = parseMultipartFormDataBytes(
      safariMultipartBody(boundary, png),
      `multipart/form-data; boundary=${boundary}`,
    );
    const file = formData.get("file");

    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("料金看板.png");
    expect((file as File).type).toBe("image/png");
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(png);
    expect(formData.get("kind")).toBe("price_sign");
    expect(formData.get("note")).toBe("Safariから送信");
  });

  it("accepts a quoted boundary and recovers when the native parser throws", async () => {
    const bytes = safariMultipartBody(boundary, png);
    const request = new Request("https://example.com/upload", {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary="${boundary}"` },
      body: requestBody(bytes),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await readMultipartFormData(
      request,
      1024,
      async () => { throw new TypeError("simulated workerd parser failure"); },
    );

    expect(result.usedFallback).toBe(true);
    expect(result.bodyBytes).toBe(bytes.byteLength);
    expect(result.formData.get("file")).toBeInstanceOf(File);
    expect(warn).toHaveBeenCalledWith(
      "Native multipart parser failed; bounded fallback succeeded",
      expect.objectContaining({ bodyBytes: bytes.byteLength, boundaryLength: boundary.length }),
    );
    warn.mockRestore();
  });

  it("rejects a missing boundary, a truncated body, and an oversized body", async () => {
    expect(() => parseMultipartFormDataBytes(png, "multipart/form-data")).toThrow(HttpError);

    const bytes = safariMultipartBody(boundary, png);
    expect(() =>
      parseMultipartFormDataBytes(bytes.slice(0, -8), `multipart/form-data; boundary=${boundary}`),
    ).toThrowError(/途中で切れています/u);

    const request = new Request("https://example.com/upload", {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: requestBody(bytes),
    });
    await expect(readMultipartFormData(request, bytes.byteLength - 1)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects a request body that was already consumed", async () => {
    const bytes = safariMultipartBody(boundary, png);
    const request = new Request("https://example.com/upload", {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: requestBody(bytes),
    });
    await request.arrayBuffer();
    await expect(readMultipartFormData(request, 1024)).rejects.toMatchObject({ status: 400 });
  });
});
