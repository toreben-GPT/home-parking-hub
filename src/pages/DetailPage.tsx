import {
  Banknote,
  Camera,
  ClipboardCopy,
  Clock3,
  CreditCard,
  FileClock,
  FileText,
  Map,
  MessageSquarePlus,
  Pencil,
  Plus,
  Sparkles,
  SquareParking,
  Trash2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { DetailSection } from "../components/DetailSection";
import { Feedback, LoadingView } from "../components/Feedback";
import { api, type AvailabilityLogInput } from "../services/api";
import { PATTERN_DEFINITIONS, PHOTO_UPLOAD_LIMIT_BYTES } from "../shared/constants";
import {
  formatAiAnalysisText,
  formatAvailabilityStatus,
  formatAvailabilitySummary,
  formatJapaneseDateTime,
  formatParkingEase,
  formatParkingStatus,
  formatPaymentMethods,
  formatYen,
  getAvailabilitySummary,
  getAvailabilitySummaryForSegment,
  getRecommendationLabels,
} from "../shared/domain";
import {
  PATTERN_IDS,
  type AvailabilityStatus,
  type DayType,
  type ParkingLot,
  type PatternId,
  type PhotoKind,
  type TimePeriod,
} from "../shared/types";

const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  price_sign: "料金看板",
  entrance: "入口",
  overview: "全景",
  other: "その他",
};

const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  available: "空いていた",
  limited: "残りわずか",
  full: "満車",
};

function currentDateTimeLocal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function inferDayType(value: string): DayType {
  const date = new Date(value);
  const day = date.getDay();
  return day === 0 || day === 6 ? "holiday" : "weekday";
}

function inferTimePeriod(value: string): TimePeriod {
  const hour = new Date(value).getHours();
  return hour >= 18 || hour < 8 ? "night" : "day";
}

function isPatternId(value: string | null): value is PatternId {
  return value !== null && (PATTERN_IDS as readonly string[]).includes(value);
}

function summarizeForAccessibleName(value: string, maximumLength = 24) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumLength) return normalized || "本文なし";
  return `${normalized.slice(0, maximumLength)}…`;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("コピーできませんでした。");
}

export function DetailPage() {
  const navigate = useNavigate();
  const { parkingId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedPatternId = searchParams.get("pattern");
  const patternId: PatternId = isPatternId(requestedPatternId) ? requestedPatternId : "WN-19";
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [allLots, setAllLots] = useState<ParkingLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [observedAt, setObservedAt] = useState(currentDateTimeLocal);
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>("available");
  const [dayType, setDayType] = useState<DayType>(() => inferDayType(currentDateTimeLocal()));
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(() => inferTimePeriod(currentDateTimeLocal()));
  const [availabilityMemo, setAvailabilityMemo] = useState("");

  const [memoBody, setMemoBody] = useState("");
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingMemoBody, setEditingMemoBody] = useState("");

  const [photoKind, setPhotoKind] = useState<PhotoKind>("price_sign");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoNote, setPhotoNote] = useState("");

  const load = useCallback(async () => {
    if (!parkingId) {
      setError("駐車場を特定できませんでした。");
      setLoading(false);
      return;
    }
    setError("");
    try {
      const [selectedLot, lots] = await Promise.all([
        api.getParking(parkingId),
        api.listParking(false),
      ]);
      setLot(selectedLot);
      setAllLots(lots);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "駐車場データを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [parkingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recommendationLabels = useMemo(
    () => getRecommendationLabels(allLots, patternId).get(lot?.id ?? "") ?? [],
    [allLots, lot?.id, patternId],
  );

  async function runMutation(
    actionName: string,
    action: () => Promise<ParkingLot>,
    message: string,
  ): Promise<boolean> {
    setBusy(actionName);
    setError("");
    setSuccess("");
    try {
      setLot(await action());
      setSuccess(message);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function handleAvailabilitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot) return;
    const parsedDate = new Date(observedAt);
    if (!Number.isFinite(parsedDate.getTime())) {
      setError("確認日時を入力してください。");
      return;
    }
    const input: AvailabilityLogInput = {
      observedAt: parsedDate.toISOString(),
      status: availabilityStatus,
      memo: availabilityMemo.trim(),
      dayType,
      timePeriod,
    };
    const saved = await runMutation(
      "availability",
      () => api.addAvailability(lot.id, input),
      "空き状況を記録しました。",
    );
    if (saved) setAvailabilityMemo("");
  }

  async function handleMemoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot || !memoBody.trim()) {
      setError("メモ本文を入力してください。");
      return;
    }
    const saved = await runMutation(
      "memo",
      () => api.addMemo(lot.id, memoBody.trim()),
      "メモを追加しました。",
    );
    if (saved) setMemoBody("");
  }

  async function handleMemoUpdate(memoId: string) {
    if (!lot || !editingMemoBody.trim()) {
      setError("メモ本文を入力してください。");
      return;
    }
    const saved = await runMutation(
      "memo-edit",
      () => api.updateMemo(lot.id, memoId, editingMemoBody.trim()),
      "メモを更新しました。",
    );
    if (saved) {
      setEditingMemoId(null);
      setEditingMemoBody("");
    }
  }

  async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot || !photoFile) {
      setError("追加する写真を選んでください。");
      return;
    }
    if (photoFile.size > PHOTO_UPLOAD_LIMIT_BYTES) {
      setError("写真は1枚10MBまでです。");
      return;
    }
    setBusy("photo");
    setError("");
    setSuccess("");
    try {
      const photo = await api.uploadPhoto(lot.id, photoFile, photoKind, photoNote.trim());
      setLot({ ...lot, photos: [photo, ...lot.photos] });
      setPhotoFile(null);
      setPhotoNote("");
      if (photoInputRef.current) photoInputRef.current.value = "";
      setSuccess("写真を追加しました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "写真を保存できませんでした。");
    } finally {
      setBusy("");
    }
  }

  async function handleCopy() {
    if (!lot) return;
    setError("");
    setSuccess("");
    try {
      await copyText(formatAiAnalysisText(lot));
      setSuccess("AI分析用データをコピーしました。ChatGPTへ貼り付けられます。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "コピーできませんでした。");
    }
  }

  if (loading) {
    return (
      <main className="screen screen--centered">
        <LoadingView label="駐車場データを読み込んでいます" />
      </main>
    );
  }

  if (!lot) {
    return (
      <main className="screen screen--centered">
        <div className="fatal-state">
          <h1>駐車場が見つかりません</h1>
          <p>{error}</p>
          <button className="button button--secondary" type="button" onClick={() => navigate("/")}>
            ホームへ戻る
          </button>
        </div>
      </main>
    );
  }

  const selectedPrice = lot.currentPricing.patternPrices[patternId];
  const allAvailability = getAvailabilitySummary(lot.availabilityLogs);

  return (
    <main className="screen detail-screen">
      <AppHeader
        title={lot.name}
        onBack={() => navigate(-1)}
        actions={
          <Link className="icon-button" to={`/parking/${lot.id}/edit`} aria-label="駐車場を編集">
            <Pencil aria-hidden="true" />
          </Link>
        }
      />

      <div className="detail-content">
        {error ? <Feedback tone="error">{error}</Feedback> : null}
        {success ? <Feedback tone="success">{success}</Feedback> : null}

        <section className="detail-summary">
          <div className="detail-summary__price">
            <strong>{formatYen(selectedPrice)}</strong>
            <span>{PATTERN_DEFINITIONS.find((pattern) => pattern.id === patternId)?.fullLabel}</span>
          </div>
          <div className="detail-summary__walk">
            {lot.walkMinutes === null ? "徒歩時間 未登録" : `徒歩${lot.walkMinutes}分`}
            {lot.walkDistanceMeters === null ? "" : `・${lot.walkDistanceMeters}m`}
          </div>
          {recommendationLabels.length > 0 ? (
            <div className="detail-summary__labels">
              {recommendationLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
          ) : null}
          {lot.mapsUrl ? (
            <a className="button button--secondary detail-summary__map" href={lot.mapsUrl} target="_blank" rel="noreferrer">
              <Map aria-hidden="true" />
              Googleマップを開く
            </a>
          ) : null}
          <p className="detail-summary__address">{lot.address || "住所 未登録"}</p>
        </section>

        <DetailSection id="prices-title" title="6パターンの料金" icon={<Banknote aria-hidden="true" />}>
          <dl className="pattern-price-list">
            {PATTERN_DEFINITIONS.map((pattern) => (
              <div key={pattern.id}>
                <dt>{pattern.fullLabel}</dt>
                <dd>{formatYen(lot.currentPricing.patternPrices[pattern.id])}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>

        <DetailSection id="pricing-source-title" title="料金原文と詳細条件" icon={<FileText aria-hidden="true" />}>
          <div className="source-text">{lot.currentPricing.sourceText || "料金原文は未登録です。"}</div>
          <dl className="detail-definition-list">
            <div><dt>基本時間料金</dt><dd>{lot.currentPricing.baseRate || "未登録"}</dd></div>
            <div><dt>平日最大料金</dt><dd>{lot.currentPricing.weekdayMaximum || "未登録"}</dd></div>
            <div><dt>土日祝最大料金</dt><dd>{lot.currentPricing.holidayMaximum || "未登録"}</dd></div>
            <div><dt>夜間最大料金</dt><dd>{lot.currentPricing.nightMaximum || "未登録"}</dd></div>
            <div><dt>夜間対象時間</dt><dd>{lot.currentPricing.nightHours || "未登録"}</dd></div>
            <div><dt>最大料金繰り返し</dt><dd>{lot.currentPricing.maximumRepeat || "未登録"}</dd></div>
            <div><dt>例外・注意事項</dt><dd>{lot.currentPricing.exceptions || "なし"}</dd></div>
          </dl>
        </DetailSection>

        <DetailSection id="conditions-title" title="決済方法・停めやすさ" icon={<CreditCard aria-hidden="true" />}>
          <dl className="detail-definition-list">
            <div><dt>決済方法</dt><dd>{formatPaymentMethods(lot.paymentMethods)}</dd></div>
            <div><dt>停めやすさ</dt><dd>{formatParkingEase(lot.parkingEase)}</dd></div>
            <div><dt>評価理由</dt><dd>{lot.easeNote || "未登録"}</dd></div>
          </dl>
        </DetailSection>

        <DetailSection id="photos-title" title="写真" icon={<Camera aria-hidden="true" />}>
          {lot.photos.length > 0 ? (
            <ul className="photo-grid">
              {lot.photos.map((photo) => (
                <li key={photo.id}>
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    <img src={photo.url} alt={`${lot.name}の${PHOTO_KIND_LABELS[photo.kind]}`} loading="lazy" />
                    <span>{PHOTO_KIND_LABELS[photo.kind]}</span>
                    {photo.note ? <small>{photo.note}</small> : null}
                  </a>
                  <button
                    className="photo-delete"
                    type="button"
                    aria-label={`${formatJapaneseDateTime(photo.createdAt)}の${PHOTO_KIND_LABELS[photo.kind]}「${summarizeForAccessibleName(photo.fileName)}」を削除`}
                    disabled={Boolean(busy)}
                    onClick={() => {
                      if (window.confirm("この写真を削除しますか？")) {
                        void runMutation(
                          "photo-delete",
                          () => api.deletePhoto(lot.id, photo.id),
                          "写真を削除しました。",
                        );
                      }
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="empty-inline">写真はまだありません。</p>}
          <form className="inline-form photo-upload-form" onSubmit={(event) => void handlePhotoUpload(event)}>
            <label>
              種類
              <select
                value={photoKind}
                disabled={busy === "photo"}
                onChange={(event) => setPhotoKind(event.target.value as PhotoKind)}
              >
                {Object.entries(PHOTO_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              写真（1枚10MBまで）
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                disabled={busy === "photo"}
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              写真メモ（任意）
              <textarea
                value={photoNote}
                disabled={busy === "photo"}
                maxLength={2000}
                rows={2}
                onChange={(event) => setPhotoNote(event.target.value)}
              />
            </label>
            <button className="button button--teal" type="submit" disabled={Boolean(busy)}>
              <Plus aria-hidden="true" />
              {busy === "photo" ? "保存中…" : "写真を追加"}
            </button>
          </form>
        </DetailSection>

        <DetailSection id="availability-title" title="空き状況" icon={<SquareParking aria-hidden="true" />}>
          <p className="availability-main">{formatAvailabilitySummary(allAvailability)}</p>
          <div className="availability-breakdown">
            {([
              ["平日夜", "weekday_night"],
              ["土日祝夜", "holiday_night"],
              ["平日日中", "weekday_day"],
              ["土日祝日中", "holiday_day"],
            ] as const).map(([label, segment]) => (
              <div key={segment}>
                <span>{label}</span>
                <strong>{formatAvailabilitySummary(getAvailabilitySummaryForSegment(lot.availabilityLogs, segment)).replace("空き実績：", "")}</strong>
              </div>
            ))}
          </div>
          <form className="inline-form availability-form" onSubmit={(event) => void handleAvailabilitySubmit(event)}>
            <h3>空き状況を記録</h3>
            <label>
              確認日時
              <input
                type="datetime-local"
                value={observedAt}
                disabled={busy === "availability"}
                onChange={(event) => {
                  const next = event.target.value;
                  setObservedAt(next);
                  setDayType(inferDayType(next));
                  setTimePeriod(inferTimePeriod(next));
                }}
                required
              />
            </label>
            <fieldset className="segmented-field">
              <legend>状況</legend>
              <div>
                {(Object.entries(AVAILABILITY_STATUS_LABELS) as [AvailabilityStatus, string][]).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="availability-status"
                      value={value}
                      checked={availabilityStatus === value}
                      disabled={busy === "availability"}
                      onChange={() => setAvailabilityStatus(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="two-field-row">
              <label>
                曜日区分
                <select
                  value={dayType}
                  disabled={busy === "availability"}
                  onChange={(event) => setDayType(event.target.value as DayType)}
                >
                  <option value="weekday">平日</option>
                  <option value="holiday">土日祝</option>
                </select>
              </label>
              <label>
                時間区分
                <select
                  value={timePeriod}
                  disabled={busy === "availability"}
                  onChange={(event) => setTimePeriod(event.target.value as TimePeriod)}
                >
                  <option value="night">夜</option>
                  <option value="day">日中</option>
                </select>
              </label>
            </div>
            <label>
              メモ（任意）
              <textarea
                value={availabilityMemo}
                disabled={busy === "availability"}
                onChange={(event) => setAvailabilityMemo(event.target.value)}
                rows={2}
              />
            </label>
            <button className="button button--teal" type="submit" disabled={Boolean(busy)}>
              <Clock3 aria-hidden="true" />
              {busy === "availability" ? "記録中…" : "記録を追加"}
            </button>
          </form>
          {lot.availabilityLogs.length > 0 ? (
            <ul className="history-list">
              {lot.availabilityLogs.map((log) => (
                <li key={log.id}>
                  <div>
                    <strong>{formatAvailabilityStatus(log.status)}</strong>
                    <span>{formatJapaneseDateTime(log.observedAt)}・{log.dayType === "weekday" ? "平日" : "土日祝"}・{log.timePeriod === "night" ? "夜" : "日中"}</span>
                    {log.memo ? <p>{log.memo}</p> : null}
                  </div>
                  <button
                    className="icon-button icon-button--danger"
                    type="button"
                    aria-label={`${formatJapaneseDateTime(log.observedAt)}の${formatAvailabilityStatus(log.status)}の空き状況ログを削除`}
                    disabled={Boolean(busy)}
                    onClick={() => {
                      if (window.confirm("この空き状況ログを削除しますか？")) {
                        void runMutation(
                          "availability-delete",
                          () => api.deleteAvailability(lot.id, log.id),
                          "空き状況ログを削除しました。",
                        );
                      }
                    }}
                  ><Trash2 aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          ) : null}
        </DetailSection>

        <DetailSection id="memos-title" title="メモ履歴" icon={<MessageSquarePlus aria-hidden="true" />}>
          <form className="inline-form memo-form" onSubmit={(event) => void handleMemoSubmit(event)}>
            <label>
              新しいメモ
              <textarea
                value={memoBody}
                disabled={busy === "memo"}
                onChange={(event) => setMemoBody(event.target.value)}
                rows={3}
              />
            </label>
            <button className="button button--teal" type="submit" disabled={Boolean(busy)}>
              <Plus aria-hidden="true" />
              {busy === "memo" ? "追加中…" : "メモを追加"}
            </button>
          </form>
          {lot.memos.length > 0 ? (
            <ul className="history-list memo-list">
              {lot.memos.map((memo) => (
                <li key={memo.id}>
                  {editingMemoId === memo.id ? (
                    <div className="memo-edit">
                      <textarea
                        aria-label="メモを編集"
                        value={editingMemoBody}
                        disabled={busy === "memo-edit"}
                        onChange={(event) => setEditingMemoBody(event.target.value)}
                        rows={3}
                      />
                      <div>
                        <button
                          className="button button--secondary"
                          type="button"
                          disabled={busy === "memo-edit"}
                          onClick={() => setEditingMemoId(null)}
                        >
                          キャンセル
                        </button>
                        <button
                          className="button button--teal"
                          type="button"
                          disabled={busy === "memo-edit"}
                          onClick={() => void handleMemoUpdate(memo.id)}
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p>{memo.body}</p>
                        <span>{formatJapaneseDateTime(memo.createdAt)}</span>
                      </div>
                      <div className="history-list__actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`${formatJapaneseDateTime(memo.createdAt)}のメモ「${summarizeForAccessibleName(memo.body)}」を編集`}
                          disabled={Boolean(busy)}
                          onClick={() => {
                            setEditingMemoId(memo.id);
                            setEditingMemoBody(memo.body);
                          }}
                        ><Pencil aria-hidden="true" /></button>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          aria-label={`${formatJapaneseDateTime(memo.createdAt)}のメモ「${summarizeForAccessibleName(memo.body)}」を削除`}
                          disabled={Boolean(busy)}
                          onClick={() => {
                            if (window.confirm("このメモを削除しますか？")) {
                              void runMutation("memo-delete", () => api.deleteMemo(lot.id, memo.id), "メモを削除しました。");
                            }
                          }}
                        ><Trash2 aria-hidden="true" /></button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </DetailSection>

        <DetailSection
          id="ai-title"
          title="AI要約・おすすめコメント"
          icon={<Sparkles aria-hidden="true" />}
          action={
            <button className="button button--secondary button--compact" type="button" onClick={() => void handleCopy()}>
              <ClipboardCopy aria-hidden="true" />
              分析用データをコピー
            </button>
          }
        >
          <div className="prose-block">
            <h3>おすすめコメント</h3>
            <p>{lot.recommendationComment || "未登録"}</p>
            <h3>AI要約</h3>
            <p>{lot.aiSummary || "未登録"}</p>
          </div>
          <p className="quiet-note">ChatGPTで作った文章は「編集」から手動で保存できます。</p>
        </DetailSection>

        <DetailSection id="pricing-history-title" title="料金変更履歴" icon={<FileClock aria-hidden="true" />}>
          {lot.pricingHistory.length > 0 ? (
            <ol className="pricing-history">
              {lot.pricingHistory.map((version) => (
                <li key={version.id}>
                  <strong>
                    {formatJapaneseDateTime(version.createdAt)}
                    {version.isCurrent ? "（現在）" : ""}
                  </strong>
                  <span>
                    {version.changeNote ||
                      (lot.pricingHistory.length === 1 ? "初回登録" : "料金情報を更新")}
                  </span>
                  <details>
                    <summary>{version.isCurrent ? "現在の料金詳細" : "当時の料金詳細"}</summary>
                    <div className="pricing-history__details">
                      <pre>{version.sourceText || "料金原文 未登録"}</pre>
                      <dl className="pattern-price-list">
                        {PATTERN_DEFINITIONS.map((pattern) => (
                          <div key={pattern.id}>
                            <dt>{pattern.fullLabel}</dt>
                            <dd>{formatYen(version.patternPrices[pattern.id])}</dd>
                          </div>
                        ))}
                      </dl>
                      <dl className="detail-definition-list">
                        <div><dt>基本時間料金</dt><dd>{version.baseRate || "未登録"}</dd></div>
                        <div><dt>平日最大料金</dt><dd>{version.weekdayMaximum || "未登録"}</dd></div>
                        <div><dt>土日祝最大料金</dt><dd>{version.holidayMaximum || "未登録"}</dd></div>
                        <div><dt>夜間最大料金</dt><dd>{version.nightMaximum || "未登録"}</dd></div>
                        <div><dt>夜間対象時間</dt><dd>{version.nightHours || "未登録"}</dd></div>
                        <div><dt>最大料金繰り返し</dt><dd>{version.maximumRepeat || "未登録"}</dd></div>
                        <div><dt>例外・注意事項</dt><dd>{version.exceptions || "なし"}</dd></div>
                      </dl>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          ) : <p className="empty-inline">過去の料金変更はありません。</p>}
        </DetailSection>

        <DetailSection id="status-title" title="利用状態" icon={<SquareParking aria-hidden="true" />}>
          <p className="status-value">{formatParkingStatus(lot.status)}</p>
          <dl className="detail-definition-list">
            <div><dt>登録日時</dt><dd>{formatJapaneseDateTime(lot.createdAt)}</dd></div>
            <div><dt>更新日時</dt><dd>{formatJapaneseDateTime(lot.updatedAt)}</dd></div>
          </dl>
        </DetailSection>

        <Link className="button button--secondary button--wide detail-edit-button" to={`/parking/${lot.id}/edit`}>
          <Pencil aria-hidden="true" />
          この駐車場を編集
        </Link>
      </div>
    </main>
  );
}
