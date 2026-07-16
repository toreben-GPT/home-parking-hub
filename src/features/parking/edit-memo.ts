import type { ParkingLot } from "../../shared/types";

type MemoAdder = (parkingLotId: string, body: string) => Promise<ParkingLot>;

export async function addMemoFromEditScreen(
  parkingLotId: string,
  body: string,
  addMemo: MemoAdder,
): Promise<ParkingLot> {
  const normalizedBody = body.trim();
  if (normalizedBody === "") {
    throw new Error("メモ本文を入力してください。");
  }
  return addMemo(parkingLotId, normalizedBody);
}
