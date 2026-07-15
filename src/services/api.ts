import type {
  AvailabilityLog,
  AvailabilityStatus,
  BackupEnvelope,
  DayType,
  MemoEntry,
  ParkingLot,
  ParkingLotInput,
  PhotoKind,
  PhotoMetadata,
  TimePeriod,
} from "../shared/types";

const API_BASE = "/api";
const MUTATION_HEADER = { "X-Requested-With": "home-parking-hub" };

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasJsonBody = init.body !== undefined && !(init.body instanceof FormData);
  if (hasJsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    for (const [key, value] of Object.entries(MUTATION_HEADER)) {
      headers.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      headers,
    });
  } catch {
    throw new ApiError("通信できませんでした。接続を確認して、もう一度お試しください。", 0);
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("home-parking-hub:auth-expired"));
  }

  if (!response.ok) {
    const fallback = "処理に失敗しました。時間をおいて、もう一度お試しください。";
    try {
      const payload = (await response.json()) as { error?: string };
      throw new ApiError(payload.error || fallback, response.status);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(fallback, response.status);
    }
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface AvailabilityLogInput {
  observedAt: string;
  status: AvailabilityStatus;
  memo: string;
  dayType: DayType;
  timePeriod: TimePeriod;
}

export const api = {
  async getSession(): Promise<boolean> {
    const result = await request<{ authenticated: boolean }>("/auth/session");
    return result.authenticated;
  },

  async login(code: string): Promise<void> {
    await request<{ authenticated: true }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  async logout(): Promise<void> {
    await request<void>("/auth/logout", { method: "POST" });
  },

  async listParking(includeInactive = false): Promise<ParkingLot[]> {
    const query = includeInactive ? "?includeInactive=true" : "";
    const result = await request<{ parkingLots: ParkingLot[] }>(`/parking${query}`);
    return result.parkingLots;
  },

  async getParking(id: string): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(`/parking/${encodeURIComponent(id)}`);
    return result.parkingLot;
  },

  async createParking(input: ParkingLotInput): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>("/parking", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return result.parkingLot;
  },

  async updateParking(
    id: string,
    input: ParkingLotInput,
    expectedUpdatedAt: string,
  ): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(`/parking/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ ...input, expectedUpdatedAt }),
    });
    return result.parkingLot;
  },

  async addAvailability(id: string, input: AvailabilityLogInput): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(
      `/parking/${encodeURIComponent(id)}/availability`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return result.parkingLot;
  },

  async deleteAvailability(id: string, logId: AvailabilityLog["id"]): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(
      `/parking/${encodeURIComponent(id)}/availability/${encodeURIComponent(logId)}`,
      { method: "DELETE" },
    );
    return result.parkingLot;
  },

  async addMemo(id: string, body: string): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(
      `/parking/${encodeURIComponent(id)}/memos`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
    return result.parkingLot;
  },

  async updateMemo(id: string, memoId: MemoEntry["id"], body: string): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(
      `/parking/${encodeURIComponent(id)}/memos/${encodeURIComponent(memoId)}`,
      { method: "PUT", body: JSON.stringify({ body }) },
    );
    return result.parkingLot;
  },

  async deleteMemo(id: string, memoId: MemoEntry["id"]): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(
      `/parking/${encodeURIComponent(id)}/memos/${encodeURIComponent(memoId)}`,
      { method: "DELETE" },
    );
    return result.parkingLot;
  },

  async uploadPhoto(
    id: string,
    file: File,
    kind: PhotoKind,
    note = "",
  ): Promise<PhotoMetadata> {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    body.append("note", note);
    const result = await request<{ photo: PhotoMetadata }>(
      `/parking/${encodeURIComponent(id)}/photos`,
      { method: "POST", body },
    );
    return result.photo;
  },

  async deletePhoto(id: string, photoId: string): Promise<ParkingLot> {
    const result = await request<{ parkingLot: ParkingLot }>(
      `/parking/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`,
      { method: "DELETE" },
    );
    return result.parkingLot;
  },

  async downloadBackup(): Promise<{ blob: Blob; fileName: string }> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/backup`, { credentials: "same-origin" });
    } catch {
      throw new ApiError("バックアップを取得できませんでした。接続を確認してください。", 0);
    }
    if (!response.ok) {
      throw new ApiError("バックアップを書き出せませんでした。", response.status);
    }
    const disposition = response.headers.get("Content-Disposition") || "";
    const fileName = disposition.match(/filename="?([^"]+)"?/)?.[1] || "parking-backup.json";
    return { blob: await response.blob(), fileName };
  },

  async restoreBackup(backup: BackupEnvelope): Promise<ParkingLot[]> {
    const result = await request<{ parkingLots: ParkingLot[] }>("/backup/restore", {
      method: "POST",
      body: JSON.stringify(backup),
    });
    return result.parkingLots;
  },
};
