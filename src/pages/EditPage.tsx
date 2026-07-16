import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingView } from "../components/Feedback";
import {
  ParkingEditor,
  type ParkingEditorMode,
} from "../features/parking/ParkingEditor";
import { addMemoFromEditScreen } from "../features/parking/edit-memo";
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
    parkingEase: "unrated",
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
  const [memoBody, setMemoBody] = useState("");
  const [memoBusy, setMemoBusy] = useState(false);
  const [memoError, setMemoError] = useState("");
  const [memoSuccess, setMemoSuccess] = useState("");

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

  const handleMemoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parkingId || memoBusy) return;

    setMemoBusy(true);
    setMemoError("");
    setMemoSuccess("");
    try {
      const saved = await addMemoFromEditScreen(parkingId, memoBody, api.addMemo);
      setLot(saved);
      setMemoBody("");
      setMemoSuccess("メモを追加しました。");
    } catch (caught) {
      setMemoError(
        caught instanceof Error ? caught.message : "メモを追加できませんでした。",
      );
    } finally {
      setMemoBusy(false);
    }
  };

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
      {mode === "edit" && parkingId && lot ? (
        <form
          className="edit-memo-form"
          aria-busy={memoBusy}
          onSubmit={(event) => void handleMemoSubmit(event)}
        >
          <section
            className="parking-editor__section"
            aria-labelledby="edit-memo-heading"
          >
            <div className="parking-editor__section-heading">
              <h2 className="parking-editor__section-title" id="edit-memo-heading">
                メモを追加
              </h2>
              <p className="parking-editor__section-description">
                駐車場情報の変更とは別に、現地で確認したことを追記できます。
              </p>
            </div>
            <div className="parking-editor__field parking-editor__field--wide">
              <label className="parking-editor__label" htmlFor="edit-memo-body">
                管理メモ
              </label>
              <textarea
                className="parking-editor__textarea"
                id="edit-memo-body"
                name="memoBody"
                rows={4}
                maxLength={10_000}
                placeholder="例：収容台数5台。夕方は満車になることがある。"
                value={memoBody}
                disabled={memoBusy}
                aria-invalid={Boolean(memoError)}
                aria-describedby={
                  memoError
                    ? "edit-memo-help edit-memo-error"
                    : "edit-memo-help"
                }
                onChange={(event) => {
                  setMemoBody(event.currentTarget.value);
                  setMemoError("");
                  setMemoSuccess("");
                }}
              />
              <p className="parking-editor__section-description" id="edit-memo-help">
                追加済みのメモの編集・削除は、保存後の詳細画面から行えます。
              </p>
              {memoError ? (
                <p
                  className="parking-editor__field-error"
                  id="edit-memo-error"
                  role="alert"
                >
                  {memoError}
                </p>
              ) : null}
              {memoSuccess ? (
                <p className="edit-memo-form__success" role="status">
                  {memoSuccess}
                </p>
              ) : null}
            </div>
            <div className="edit-memo-form__actions">
              <button
                className="parking-editor__button parking-editor__button--primary"
                type="submit"
                disabled={memoBusy}
              >
                {memoBusy ? "追加中…" : "メモを追加"}
              </button>
            </div>
          </section>
        </form>
      ) : null}
    </main>
  );
}
