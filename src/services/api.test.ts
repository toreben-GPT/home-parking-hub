import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("photo upload request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets fetch generate the multipart boundary instead of setting Content-Type manually", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Content-Type")).toBeNull();
      expect(headers.get("X-Requested-With")).toBe("home-parking-hub");
      expect(init?.body).toBeInstanceOf(FormData);
      return new Response(JSON.stringify({ photo: { id: "photo-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "test.png", {
      type: "image/png",
    });
    await api.uploadPhoto("lot-1", file, "other", "test");

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
