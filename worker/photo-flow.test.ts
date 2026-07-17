import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParkingLot, PhotoMetadata } from "../src/shared/types";
import type { Env } from "./env";

vi.mock("./repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repository")>();
  return {
    ...actual,
    requireParkingLot: vi.fn(),
    insertPhoto: vi.fn(),
    getPhotoRow: vi.fn(),
    deletePhotoMetadata: vi.fn(),
  };
});

import { handlePhotoDelete, handlePhotoRead, handlePhotoUpload } from "./index";
import * as repository from "./repository";

const lot = { id: "lot-1", name: "テスト駐車場", photos: [] } as unknown as ParkingLot;
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("photo R2 and D1 flow", () => {
  let storedBody: Uint8Array | null;
  let storedContentType: string;
  let photoRow: repository.PhotoRow | null;
  let env: Env;
  let r2Put: ReturnType<typeof vi.fn>;
  let r2Get: ReturnType<typeof vi.fn>;
  let r2Delete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storedBody = null;
    storedContentType = "";
    photoRow = null;

    r2Put = vi.fn(async (
      _key: string,
      value: ArrayBuffer | ReadableStream<Uint8Array>,
      options: R2PutOptions,
    ) => {
      storedBody = new Uint8Array(await new Response(value).arrayBuffer());
      storedContentType = options.httpMetadata && "contentType" in options.httpMetadata
        ? options.httpMetadata.contentType ?? ""
        : "";
    });
    r2Get = vi.fn(async () => {
      if (!storedBody) return null;
      const body = new Response(storedBody.slice().buffer).body;
      return {
        body,
        size: storedBody.byteLength,
        httpEtag: '"test-etag"',
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", storedContentType);
        },
      };
    });
    r2Delete = vi.fn(async () => {
      storedBody = null;
    });
    env = {
      DB: {} as D1Database,
      PHOTOS: { put: r2Put, get: r2Get, delete: r2Delete } as unknown as R2Bucket,
    } as Env;

    vi.mocked(repository.requireParkingLot).mockResolvedValue(lot);
    vi.mocked(repository.insertPhoto).mockImplementation(async (_db, input) => {
      photoRow = {
        id: input.id,
        parking_lot_id: input.parkingLotId,
        kind: input.kind,
        file_name: input.fileName,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        note: input.note,
        object_key: `${input.parkingLotId}/${input.id}`,
        created_at: input.createdAt,
      };
      return { ...input, url: `/api/photos/${encodeURIComponent(input.id)}` };
    });
    vi.mocked(repository.getPhotoRow).mockImplementation(async () => photoRow);
    vi.mocked(repository.deletePhotoMetadata).mockImplementation(async () => {
      if (!photoRow) throw new Error("photo missing");
      const deleted = photoRow;
      photoRow = null;
      return deleted;
    });
  });

  it("stores, returns, reads, and deletes one photo across R2 and D1", async () => {
    const formData = new FormData();
    formData.append("file", new File([pngBytes], "料金看板.png", { type: "image/png" }));
    formData.append("kind", "price_sign");
    formData.append("note", "一連テスト");
    const request = new Request("https://example.com/api/parking/lot-1/photos", {
      method: "POST",
      body: formData,
    });

    const uploadResponse = await handlePhotoUpload(request, env, lot.id);
    const uploadPayload = await uploadResponse.json() as { photo: PhotoMetadata };
    expect(uploadResponse.status).toBe(201);
    expect(uploadPayload.photo.fileName).toBe("料金看板.png");
    expect(uploadPayload.photo.url).toBe(`/api/photos/${encodeURIComponent(uploadPayload.photo.id)}`);
    expect(storedBody).toEqual(pngBytes);
    expect(r2Put.mock.calls[0]?.[1]).toBeInstanceOf(ArrayBuffer);
    expect(photoRow?.content_type).toBe("image/png");
    expect(r2Put.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.insertPhoto).mock.invocationCallOrder[0],
    );

    const readResponse = await handlePhotoRead(env, uploadPayload.photo.id);
    expect(readResponse.status).toBe(200);
    expect(readResponse.headers.get("Content-Type")).toBe("image/png");
    expect(readResponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await readResponse.arrayBuffer())).toEqual(pngBytes);

    const deleteResponse = await handlePhotoDelete(env, lot.id, uploadPayload.photo.id);
    expect(deleteResponse.status).toBe(200);
    expect(photoRow).toBeNull();
    expect(storedBody).toBeNull();
    expect(r2Delete).toHaveBeenCalledOnce();
  });
});
