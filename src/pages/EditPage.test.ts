import { describe, expect, it, vi } from "vitest";
import type { ParkingLot } from "../shared/types";
import { addMemoFromEditScreen } from "../features/parking/edit-memo";

describe("edit screen memo addition", () => {
  it("trims the memo and adds it to the parking lot", async () => {
    const savedLot = { id: "lot-1" } as ParkingLot;
    const addMemo = vi.fn(async () => savedLot);

    const result = await addMemoFromEditScreen(
      "lot-1",
      "  収容台数5台  ",
      addMemo,
    );

    expect(addMemo).toHaveBeenCalledOnce();
    expect(addMemo).toHaveBeenCalledWith("lot-1", "収容台数5台");
    expect(result).toBe(savedLot);
  });

  it("does not send an empty memo", async () => {
    const addMemo = vi.fn(async () => ({ id: "lot-1" }) as ParkingLot);

    await expect(
      addMemoFromEditScreen("lot-1", " \n ", addMemo),
    ).rejects.toThrow("メモ本文を入力してください。");
    expect(addMemo).not.toHaveBeenCalled();
  });
});
