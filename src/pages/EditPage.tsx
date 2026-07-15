import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingView } from "../components/Feedback";
import {
  ParkingEditor,
  type ParkingEditorMode,
} from "../features/parking/ParkingEditor";
import { api } from "../services/api";
import { EMPTY_PATTERN_PRICES } from "../shared/constants";
import type { ParkingLot, ParkingLotInput } from "../shared/types";

function createInitialValue(): ParkingLotInput {
  return {
    name: "",
    address: "",
    mapsUrl: "",
    walkMinutes: null,
    walkDistanceMeters: null,
    status: "active",
    parkingEase: "normal",
    easeNote: "",
    paymentMethods: ["unknown"],
    recommendationComment: "",
    aiSummary: "",
    pricing: {
      sourceText: "",
      baseRate: "",
      weekdayMaximum: "",
      holidayMaximum: "",
      nightMaximum: "",
      nightHours: "",
      maximumRepeat: "",
      exceptions: "",
      patternPrices: structuredClone(EMPTY_PATTERN_PRICES),
      changeNote: "",
    },
  };
}

function lotToInput(lot: ParkingLot): ParkingLotInput {
  return {
    name: lot.name,
    address: lot.address,
    mapsUrl: lot.mapsUrl,
    walkMinutes: lot.walkMinutes,
    walkDistanceMeters: lot.walkDistanceMeters,
    status: lot.status,
    parkingEase: lot.parkingEase,
    easeNote: lot.easeNote,
    paymentMethods: [...lot.paymentMethods],
    recommendationComment: lot.recommendationComment,
    aiSummary: lot.aiSummary,
    pricing: {
      sourceText: lot.currentPricing.sourceText,
      baseRate: lot.currentPricing.baseRate,
      weekdayMaximum: lot.currentPricing.weekdayMaximum,
      holidayMaximum: lot.currentPricing.holidayMaximum,
      nightMaximum: lot.currentPricing.nightMaximum,
      nightHours: lot.currentPricing.nightHours,
      maximumRepeat: lot.currentPricing.maximumRepeat,
      exceptions: lot.currentPricing.exceptions,
      patternPrices: structuredClone(lot.currentPricing.patternPrices),
      changeNote: "",
    },
  };
}

export function EditPage({ mode }: { mode: ParkingEditorMode }) {
  const navigate = useNavigate();
  const { parkingId } = useParams();
  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !parkingId) return;
    let cancelled = false;
    api
      .getParking(parkingId)
      .then((value) => {
        if (!cancelled) setLot(value);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "駐車場データを読み込めませんでした。");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, parkingId]);

  const initialValue = useMemo(
    () => (lot ? lotToInput(lot) : createInitialValue()),
    [lot],
  );

  const handleSubmit = useCallback(
    async (value: ParkingLotInput) => {
      setError("");
      if (mode === "edit") {
        if (!parkingId || !lot) {
          throw new Error("編集元の駐車場情報を読み込めませんでした。画面を開き直してください。");
        }
        const saved = await api.updateParking(parkingId, value, lot.updatedAt);
        return saved.id;
      }
      const saved = await api.createParking(value);
      return saved.id;
    },
    [lot, mode, parkingId],
  );

  if (loading) {
    return (
      <main className="screen screen--centered">
        <LoadingView label="駐車場データを読み込んでいます" />
      </main>
    );
  }

  if (mode === "edit" && (!parkingId || !lot)) {
    return (
      <main className="screen screen--centered">
        <div className="fatal-state">
          <h1>編集画面を開けませんでした</h1>
          <p>{error || "駐車場が見つかりません。"}</p>
          <button className="button button--secondary" type="button" onClick={() => navigate("/")}>
            ホームへ戻る
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen editor-screen">
      <ParkingEditor
        mode={mode}
        initialValue={initialValue}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
        onComplete={(id) => {
          const detailId = id ?? parkingId;
          if (detailId) {
            navigate(`/parking/${detailId}`, { replace: true });
          }
        }}
        error={error}
      />
    </main>
  );
}
