import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { PATTERN_DEFINITIONS } from "../../shared/constants";
import type {
  ParkingEase,
  ParkingLotInput,
  ParkingStatus,
  PatternId,
  PaymentMethod,
} from "../../shared/types";

export type ParkingEditorMode = "create" | "edit";

export interface ParkingEditorProps {
  mode: ParkingEditorMode;
  initialValue: ParkingLotInput;
  onSubmit: (value: ParkingLotInput) => Promise<string | void>;
  onCancel: () => void;
  onComplete?: (parkingLotId?: string) => void;
  busy?: boolean;
  error?: string | null;
}

type SubmitPhase = "idle" | "saving";

type FieldErrorKey =
  | "name"
  | "mapsUrl"
  | "walkMinutes"
  | "walkDistanceMeters"
  | "paymentMethods"
  | `pattern-${PatternId}`;

type FormErrors = Partial<Record<FieldErrorKey, string>>;

const STATUS_OPTIONS: ReadonlyArray<{
  value: ParkingStatus;
  label: string;
}> = [
  { value: "active", label: "利用中" },
  { value: "excluded", label: "候補から除外" },
  { value: "closed", label: "閉鎖" },
];

const EASE_OPTIONS: ReadonlyArray<{
  value: ParkingEase;
  label: string;
}> = [
  { value: "unrated", label: "未評価" },
  { value: "easy", label: "停めやすい" },
  { value: "normal", label: "普通" },
  { value: "difficult", label: "停めにくい" },
];

const PAYMENT_OPTIONS: ReadonlyArray<{
  value: PaymentMethod;
  label: string;
}> = [
  { value: "cash", label: "現金" },
  { value: "cashless", label: "キャッシュレス" },
  { value: "unknown", label: "不明" },
];

const PRICING_TEXT_FIELDS: ReadonlyArray<{
  key:
    | "baseRate"
    | "weekdayMaximum"
    | "holidayMaximum"
    | "nightMaximum"
    | "nightHours"
    | "maximumRepeat";
  label: string;
  placeholder: string;
}> = [
  {
    key: "baseRate",
    label: "基本料金",
    placeholder: "例：8:00〜20:00 30分 200円",
  },
  {
    key: "weekdayMaximum",
    label: "平日最大料金",
    placeholder: "例：当日24時まで 900円",
  },
  {
    key: "holidayMaximum",
    label: "土日祝最大料金",
    placeholder: "例：当日24時まで 1,200円",
  },
  {
    key: "nightMaximum",
    label: "夜間最大料金",
    placeholder: "例：20:00〜8:00 400円",
  },
  {
    key: "nightHours",
    label: "夜間の対象時間",
    placeholder: "例：20:00〜翌8:00",
  },
  {
    key: "maximumRepeat",
    label: "最大料金の繰り返し条件",
    placeholder: "例：繰り返し適用あり",
  },
];

function cloneParkingLotInput(value: ParkingLotInput): ParkingLotInput {
  return {
    ...value,
    paymentMethods: [...value.paymentMethods],
    pricing: {
      ...value.pricing,
      patternPrices: Object.fromEntries(
        PATTERN_DEFINITIONS.map(({ id }) => [
          id,
          { ...value.pricing.patternPrices[id] },
        ]),
      ) as ParkingLotInput["pricing"]["patternPrices"],
    },
  };
}

function normalizeParkingLotInput(
  value: ParkingLotInput,
  mode: ParkingEditorMode,
): ParkingLotInput {
  return {
    ...cloneParkingLotInput(value),
    name: value.name.trim(),
    address: value.address.trim(),
    mapsUrl: value.mapsUrl.trim(),
    easeNote: value.easeNote,
    recommendationComment: value.recommendationComment,
    aiSummary: value.aiSummary,
    pricing: {
      ...value.pricing,
      sourceText: value.pricing.sourceText,
      baseRate: value.pricing.baseRate.trim(),
      weekdayMaximum: value.pricing.weekdayMaximum.trim(),
      holidayMaximum: value.pricing.holidayMaximum.trim(),
      nightMaximum: value.pricing.nightMaximum.trim(),
      nightHours: value.pricing.nightHours.trim(),
      maximumRepeat: value.pricing.maximumRepeat.trim(),
      exceptions: value.pricing.exceptions,
      patternPrices: Object.fromEntries(
        PATTERN_DEFINITIONS.map(({ id }) => [
          id,
          { ...value.pricing.patternPrices[id] },
        ]),
      ) as ParkingLotInput["pricing"]["patternPrices"],
      changeNote: mode === "edit" ? value.pricing.changeNote : "",
    },
  };
}

function isIntegerInRange(
  value: number | null,
  maximum: number,
): boolean {
  return (
    value === null ||
    (Number.isInteger(value) && value >= 0 && value <= maximum)
  );
}

function isHttpUrl(value: string): boolean {
  if (value === "") {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateParkingLotInput(value: ParkingLotInput): FormErrors {
  const errors: FormErrors = {};

  if (value.name === "") {
    errors.name = "駐車場名を入力してください。";
  }

  if (!isHttpUrl(value.mapsUrl)) {
    errors.mapsUrl =
      "Google マップ URLは https:// または http:// から始まる形で入力してください。";
  }

  if (!isIntegerInRange(value.walkMinutes, 10_000)) {
    errors.walkMinutes =
      "徒歩時間は0以上10,000以下の整数で入力してください。";
  }

  if (!isIntegerInRange(value.walkDistanceMeters, 10_000_000)) {
    errors.walkDistanceMeters =
      "徒歩距離は0以上10,000,000以下の整数で入力してください。";
  }

  if (value.paymentMethods.length === 0) {
    errors.paymentMethods =
      "支払い方法を1つ以上選ぶか、「不明」を選んでください。";
  } else if (
    value.paymentMethods.includes("unknown") &&
    value.paymentMethods.length > 1
  ) {
    errors.paymentMethods =
      "「不明」は「現金」や「キャッシュレス」と同時に選べません。";
  }

  for (const { id } of PATTERN_DEFINITIONS) {
    const patternPrice = value.pricing.patternPrices[id];
    if (!isIntegerInRange(patternPrice.amountYen, 10_000_000)) {
      errors[`pattern-${id}`] =
        "料金は0以上10,000,000以下の整数で入力してください。";
    } else if (
      patternPrice.amountYen === null &&
      !patternPrice.needsConfirmation
    ) {
      errors[`pattern-${id}`] =
        "料金を入力するか、「要確認」を選んでください。";
    }
  }

  return errors;
}

function readOptionalNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

function getErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message.trim() !== "") {
    return `${fallback}\n${reason.message}`;
  }
  return fallback;
}

export function ParkingEditor(props: ParkingEditorProps) {
  const resetKey = `${props.mode}:${JSON.stringify(props.initialValue)}`;
  return <ParkingEditorForm key={resetKey} {...props} />;
}

function ParkingEditorForm({
  mode,
  initialValue,
  onSubmit,
  onCancel,
  onComplete,
  busy = false,
  error = null,
}: ParkingEditorProps) {
  const idPrefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(() => cloneParkingLotInput(initialValue));
  const [validationErrors, setValidationErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");

  const isBusy = busy || submitPhase !== "idle";
  const visibleSubmitError = submitError ?? error;
  const validationMessages = Object.entries(validationErrors).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );

  const clearValidationError = (key: FieldErrorKey) => {
    setValidationErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const updatePaymentMethod = (method: PaymentMethod, checked: boolean) => {
    setValue((current) => {
      let paymentMethods: PaymentMethod[];

      if (method === "unknown") {
        paymentMethods = checked ? ["unknown"] : [];
      } else if (checked) {
        paymentMethods = [
          ...current.paymentMethods.filter(
            (currentMethod) =>
              currentMethod !== "unknown" && currentMethod !== method,
          ),
          method,
        ];
      } else {
        paymentMethods = current.paymentMethods.filter(
          (currentMethod) => currentMethod !== method,
        );
      }

      return { ...current, paymentMethods };
    });
    clearValidationError("paymentMethods");
  };

  const updatePatternAmount = (id: PatternId, amountYen: number | null) => {
    setValue((current) => ({
      ...current,
      pricing: {
        ...current.pricing,
        patternPrices: {
          ...current.pricing.patternPrices,
          [id]: {
            ...current.pricing.patternPrices[id],
            amountYen,
          },
        },
      },
    }));
    clearValidationError(`pattern-${id}`);
  };

  const updatePatternConfirmation = (
    id: PatternId,
    needsConfirmation: boolean,
  ) => {
    setValue((current) => ({
      ...current,
      pricing: {
        ...current.pricing,
        patternPrices: {
          ...current.pricing.patternPrices,
          [id]: {
            ...current.pricing.patternPrices[id],
            needsConfirmation,
          },
        },
      },
    }));
    clearValidationError(`pattern-${id}`);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) {
      return;
    }

    const normalizedValue = normalizeParkingLotInput(value, mode);
    const nextErrors = validateParkingLotInput(normalizedValue);
    setValue(normalizedValue);
    setValidationErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => {
        const firstInvalidControl =
          formRef.current?.querySelector<HTMLElement>(
            '[aria-invalid="true"]',
          );
        firstInvalidControl?.focus();
      });
      return;
    }

    try {
      setSubmitPhase("saving");
      const parkingLotId = await onSubmit(normalizedValue);
      onComplete?.(parkingLotId || undefined);
    } catch (reason) {
      setSubmitError(
        getErrorMessage(
          reason,
          "駐車場情報の保存に失敗しました。",
        ),
      );
    } finally {
      setSubmitPhase("idle");
    }
  };

  return (
    <form
      ref={formRef}
      className="parking-editor"
      noValidate
      aria-busy={isBusy}
      onSubmit={handleSubmit}
    >
      <header className="parking-editor__header">
        <div className="parking-editor__heading-group">
          <h1 className="parking-editor__title">
            {mode === "create" ? "駐車場を追加" : "駐車場を編集"}
          </h1>
          <p className="parking-editor__required-note">
            <span aria-hidden="true">*</span> は必須項目です。
          </p>
        </div>
      </header>

      {visibleSubmitError ? (
        <div className="parking-editor__submit-error" role="alert">
          <strong className="parking-editor__submit-error-title">
            保存できませんでした
          </strong>
          <p className="parking-editor__submit-error-message">
            {visibleSubmitError}
          </p>
        </div>
      ) : null}

      {validationMessages.length > 0 ? (
        <div className="parking-editor__validation-summary" role="alert">
          <strong className="parking-editor__validation-summary-title">
            入力内容を確認してください
          </strong>
          <ul className="parking-editor__validation-summary-list">
            {validationMessages.map(([key, message]) => (
              <li
                className="parking-editor__validation-summary-item"
                key={key}
              >
                {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section
        className="parking-editor__section parking-editor__section--basic"
        aria-labelledby={`${idPrefix}-basic-heading`}
      >
        <div className="parking-editor__section-heading">
          <h2
            className="parking-editor__section-title"
            id={`${idPrefix}-basic-heading`}
          >
            基本情報
          </h2>
          <p className="parking-editor__section-description">
            駐車場の場所と、自宅からの目安を入力します。
          </p>
        </div>

        <div className="parking-editor__fields">
          <div className="parking-editor__field parking-editor__field--wide">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-name`}
            >
              駐車場名 <span aria-hidden="true">*</span>
            </label>
            <input
              className="parking-editor__input"
              id={`${idPrefix}-name`}
              name="name"
              type="text"
              required
              maxLength={120}
              autoComplete="off"
              value={value.name}
              disabled={isBusy}
              aria-invalid={Boolean(validationErrors.name)}
              aria-describedby={
                validationErrors.name ? `${idPrefix}-name-error` : undefined
              }
              onChange={(event) => {
                const nextName = event.currentTarget.value;
                setValue((current) => ({
                  ...current,
                  name: nextName,
                }));
                clearValidationError("name");
              }}
            />
            {validationErrors.name ? (
              <p
                className="parking-editor__field-error"
                id={`${idPrefix}-name-error`}
              >
                {validationErrors.name}
              </p>
            ) : null}
          </div>

          <div className="parking-editor__field parking-editor__field--wide">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-address`}
            >
              住所
            </label>
            <input
              className="parking-editor__input"
              id={`${idPrefix}-address`}
              name="address"
              type="text"
              maxLength={300}
              autoComplete="street-address"
              value={value.address}
              disabled={isBusy}
              onChange={(event) => {
                const nextAddress = event.currentTarget.value;
                setValue((current) => ({
                  ...current,
                  address: nextAddress,
                }));
              }}
            />
          </div>

          <div className="parking-editor__field parking-editor__field--wide">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-maps-url`}
            >
              Google マップ URL
            </label>
            <input
              className="parking-editor__input"
              id={`${idPrefix}-maps-url`}
              name="mapsUrl"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={2048}
              placeholder="https://maps.app.goo.gl/..."
              value={value.mapsUrl}
              disabled={isBusy}
              aria-invalid={Boolean(validationErrors.mapsUrl)}
              aria-describedby={
                validationErrors.mapsUrl
                  ? `${idPrefix}-maps-url-error`
                  : undefined
              }
              onChange={(event) => {
                const nextMapsUrl = event.currentTarget.value;
                setValue((current) => ({
                  ...current,
                  mapsUrl: nextMapsUrl,
                }));
                clearValidationError("mapsUrl");
              }}
            />
            {validationErrors.mapsUrl ? (
              <p
                className="parking-editor__field-error"
                id={`${idPrefix}-maps-url-error`}
              >
                {validationErrors.mapsUrl}
              </p>
            ) : null}
          </div>

          <div className="parking-editor__field">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-walk-minutes`}
            >
              徒歩時間（分）
            </label>
            <input
              className="parking-editor__input"
              id={`${idPrefix}-walk-minutes`}
              name="walkMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={10_000}
              step={1}
              placeholder="例：5"
              value={value.walkMinutes ?? ""}
              disabled={isBusy}
              aria-invalid={Boolean(validationErrors.walkMinutes)}
              aria-describedby={
                validationErrors.walkMinutes
                  ? `${idPrefix}-walk-minutes-error`
                  : undefined
              }
              onChange={(event) => {
                const nextWalkMinutes = readOptionalNumber(
                  event.currentTarget.value,
                );
                setValue((current) => ({
                  ...current,
                  walkMinutes: nextWalkMinutes,
                }));
                clearValidationError("walkMinutes");
              }}
            />
            {validationErrors.walkMinutes ? (
              <p
                className="parking-editor__field-error"
                id={`${idPrefix}-walk-minutes-error`}
              >
                {validationErrors.walkMinutes}
              </p>
            ) : null}
          </div>

          <div className="parking-editor__field">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-walk-distance`}
            >
              徒歩距離（m）
            </label>
            <input
              className="parking-editor__input"
              id={`${idPrefix}-walk-distance`}
              name="walkDistanceMeters"
              type="number"
              inputMode="numeric"
              min={0}
              max={10_000_000}
              step={1}
              placeholder="例：350"
              value={value.walkDistanceMeters ?? ""}
              disabled={isBusy}
              aria-invalid={Boolean(validationErrors.walkDistanceMeters)}
              aria-describedby={
                validationErrors.walkDistanceMeters
                  ? `${idPrefix}-walk-distance-error`
                  : undefined
              }
              onChange={(event) => {
                const nextWalkDistance = readOptionalNumber(
                  event.currentTarget.value,
                );
                setValue((current) => ({
                  ...current,
                  walkDistanceMeters: nextWalkDistance,
                }));
                clearValidationError("walkDistanceMeters");
              }}
            />
            {validationErrors.walkDistanceMeters ? (
              <p
                className="parking-editor__field-error"
                id={`${idPrefix}-walk-distance-error`}
              >
                {validationErrors.walkDistanceMeters}
              </p>
            ) : null}
          </div>

          <div className="parking-editor__field">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-status`}
            >
              ステータス
            </label>
            <select
              className="parking-editor__select"
              id={`${idPrefix}-status`}
              name="status"
              value={value.status}
              disabled={isBusy}
              onChange={(event) => {
                const nextStatus = event.currentTarget.value as ParkingStatus;
                setValue((current) => ({
                  ...current,
                  status: nextStatus,
                }));
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section
        className="parking-editor__section parking-editor__section--pricing"
        aria-labelledby={`${idPrefix}-pricing-heading`}
      >
        <div className="parking-editor__section-heading">
          <h2
            className="parking-editor__section-title"
            id={`${idPrefix}-pricing-heading`}
          >
            料金情報
          </h2>
          <p className="parking-editor__section-description">
            看板の記載を残したうえで、比較に使う料金を入力します。
          </p>
        </div>

        <div className="parking-editor__field parking-editor__field--wide">
          <label
            className="parking-editor__label"
            htmlFor={`${idPrefix}-pricing-source`}
          >
            料金看板の原文
          </label>
          <textarea
            className="parking-editor__textarea"
            id={`${idPrefix}-pricing-source`}
            name="pricing.sourceText"
            rows={5}
            maxLength={20_000}
            placeholder="看板に書かれている料金や条件を、できるだけそのまま入力"
            value={value.pricing.sourceText}
            disabled={isBusy}
            onChange={(event) => {
              const nextSourceText = event.currentTarget.value;
              setValue((current) => ({
                ...current,
                pricing: {
                  ...current.pricing,
                  sourceText: nextSourceText,
                },
              }));
            }}
          />
        </div>

        <div className="parking-editor__fields">
          {PRICING_TEXT_FIELDS.map((field) => (
            <div className="parking-editor__field" key={field.key}>
              <label
                className="parking-editor__label"
                htmlFor={`${idPrefix}-pricing-${field.key}`}
              >
                {field.label}
              </label>
              <input
                className="parking-editor__input"
                id={`${idPrefix}-pricing-${field.key}`}
                name={`pricing.${field.key}`}
                type="text"
                maxLength={2000}
                placeholder={field.placeholder}
                value={value.pricing[field.key]}
                disabled={isBusy}
                onChange={(event) => {
                  const nextText = event.currentTarget.value;
                  setValue((current) => ({
                    ...current,
                    pricing: {
                      ...current.pricing,
                      [field.key]: nextText,
                    },
                  }));
                }}
              />
            </div>
          ))}
        </div>

        <div className="parking-editor__field parking-editor__field--wide">
          <label
            className="parking-editor__label"
            htmlFor={`${idPrefix}-pricing-exceptions`}
          >
            例外・注意事項
          </label>
          <textarea
            className="parking-editor__textarea"
            id={`${idPrefix}-pricing-exceptions`}
            name="pricing.exceptions"
            rows={3}
            maxLength={4000}
            placeholder="例：特定日は最大料金の適用なし"
            value={value.pricing.exceptions}
            disabled={isBusy}
            onChange={(event) => {
              const nextExceptions = event.currentTarget.value;
              setValue((current) => ({
                ...current,
                pricing: {
                  ...current.pricing,
                  exceptions: nextExceptions,
                },
              }));
            }}
          />
        </div>

        <fieldset className="parking-editor__fieldset parking-editor__fieldset--patterns">
          <legend className="parking-editor__legend">6パターンの比較料金</legend>
          <p
            className="parking-editor__fieldset-description"
            id={`${idPrefix}-patterns-help`}
          >
            金額がわからない場合は「要確認」を選んでください。
          </p>
          <div className="parking-editor__pattern-list">
            {PATTERN_DEFINITIONS.map((pattern) => {
              const patternPrice = value.pricing.patternPrices[pattern.id];
              const patternError = validationErrors[`pattern-${pattern.id}`];
              return (
                <div className="parking-editor__pattern" key={pattern.id}>
                  <div className="parking-editor__pattern-heading">
                    <span className="parking-editor__pattern-day">
                      {pattern.dayLabel}
                    </span>
                    <strong className="parking-editor__pattern-time">
                      {pattern.shortLabel}
                    </strong>
                  </div>
                  <div className="parking-editor__pattern-controls">
                    <div className="parking-editor__field parking-editor__field--amount">
                      <label
                        className="parking-editor__label"
                        htmlFor={`${idPrefix}-pattern-${pattern.id}-amount`}
                      >
                        料金（円）
                      </label>
                      <input
                        className="parking-editor__input"
                        id={`${idPrefix}-pattern-${pattern.id}-amount`}
                        name={`pricing.patternPrices.${pattern.id}.amountYen`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={10_000_000}
                        step={1}
                        placeholder="金額"
                        value={patternPrice.amountYen ?? ""}
                        disabled={isBusy}
                        aria-label={`${pattern.fullLabel}の料金（円）`}
                        aria-invalid={Boolean(patternError)}
                        aria-describedby={`${idPrefix}-patterns-help${
                          patternError
                            ? ` ${idPrefix}-pattern-${pattern.id}-error`
                            : ""
                        }`}
                        onChange={(event) =>
                          updatePatternAmount(
                            pattern.id,
                            readOptionalNumber(event.currentTarget.value),
                          )
                        }
                      />
                    </div>
                    <label className="parking-editor__check parking-editor__check--confirmation">
                      <input
                        className="parking-editor__checkbox"
                        name={`pricing.patternPrices.${pattern.id}.needsConfirmation`}
                        type="checkbox"
                        checked={patternPrice.needsConfirmation}
                        disabled={isBusy}
                        aria-label={`${pattern.fullLabel}の料金を要確認にする`}
                        onChange={(event) =>
                          updatePatternConfirmation(
                            pattern.id,
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <span className="parking-editor__check-label">要確認</span>
                    </label>
                  </div>
                  {patternError ? (
                    <p
                      className="parking-editor__field-error"
                      id={`${idPrefix}-pattern-${pattern.id}-error`}
                    >
                      {patternError}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>

        {mode === "edit" ? (
          <div className="parking-editor__field parking-editor__field--wide">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-pricing-change-note`}
            >
              今回の料金変更メモ（任意）
            </label>
            <textarea
              className="parking-editor__textarea"
              id={`${idPrefix}-pricing-change-note`}
              name="pricing.changeNote"
              rows={3}
              maxLength={2000}
              placeholder="例：2026年7月、現地看板で最大料金の変更を確認"
              value={value.pricing.changeNote}
              disabled={isBusy}
              onChange={(event) => {
                const nextChangeNote = event.currentTarget.value;
                setValue((current) => ({
                  ...current,
                  pricing: {
                    ...current.pricing,
                    changeNote: nextChangeNote,
                  },
                }));
              }}
            />
          </div>
        ) : null}
      </section>

      <section
        className="parking-editor__section parking-editor__section--evaluation"
        aria-labelledby={`${idPrefix}-evaluation-heading`}
      >
        <div className="parking-editor__section-heading">
          <h2
            className="parking-editor__section-title"
            id={`${idPrefix}-evaluation-heading`}
          >
            利用条件・評価
          </h2>
        </div>

        <fieldset
          className="parking-editor__fieldset parking-editor__fieldset--payments"
          aria-describedby={`${idPrefix}-payment-help${
            validationErrors.paymentMethods
              ? ` ${idPrefix}-payment-error`
              : ""
          }`}
        >
          <legend className="parking-editor__legend">
            支払い方法 <span aria-hidden="true">*</span>
          </legend>
          <p
            className="parking-editor__fieldset-description"
            id={`${idPrefix}-payment-help`}
          >
            現金とキャッシュレスは両方選べます。「不明」は単独で選びます。
          </p>
          <div className="parking-editor__check-group">
            {PAYMENT_OPTIONS.map((option) => (
              <label className="parking-editor__check" key={option.value}>
                <input
                  className="parking-editor__checkbox"
                  name="paymentMethods"
                  type="checkbox"
                  value={option.value}
                  checked={value.paymentMethods.includes(option.value)}
                  disabled={isBusy}
                  aria-invalid={Boolean(validationErrors.paymentMethods)}
                  onChange={(event) =>
                    updatePaymentMethod(option.value, event.currentTarget.checked)
                  }
                />
                <span className="parking-editor__check-label">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
          {validationErrors.paymentMethods ? (
            <p
              className="parking-editor__field-error"
              id={`${idPrefix}-payment-error`}
            >
              {validationErrors.paymentMethods}
            </p>
          ) : null}
        </fieldset>

        <div className="parking-editor__fields">
          <div className="parking-editor__field">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-ease`}
            >
              停めやすさ
            </label>
            <select
              className="parking-editor__select"
              id={`${idPrefix}-ease`}
              name="parkingEase"
              value={value.parkingEase}
              disabled={isBusy}
              onChange={(event) => {
                const nextEase = event.currentTarget.value as ParkingEase;
                setValue((current) => ({
                  ...current,
                  parkingEase: nextEase,
                }));
              }}
            >
              {EASE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="parking-editor__field parking-editor__field--wide">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-ease-note`}
            >
              停めやすさの理由
            </label>
            <textarea
              className="parking-editor__textarea"
              id={`${idPrefix}-ease-note`}
              name="easeNote"
              rows={3}
              maxLength={2000}
              placeholder="例：入口は広いが、奥の車室は切り返しが必要"
              value={value.easeNote}
              disabled={isBusy}
              onChange={(event) => {
                const nextEaseNote = event.currentTarget.value;
                setValue((current) => ({
                  ...current,
                  easeNote: nextEaseNote,
                }));
              }}
            />
          </div>

          <div className="parking-editor__field parking-editor__field--wide">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-recommendation`}
            >
              おすすめコメント
            </label>
            <textarea
              className="parking-editor__textarea"
              id={`${idPrefix}-recommendation`}
              name="recommendationComment"
              rows={3}
              maxLength={4000}
              placeholder="家族で共有したいおすすめポイント"
              value={value.recommendationComment}
              disabled={isBusy}
              onChange={(event) => {
                const nextRecommendation = event.currentTarget.value;
                setValue((current) => ({
                  ...current,
                  recommendationComment: nextRecommendation,
                }));
              }}
            />
          </div>

          <div className="parking-editor__field parking-editor__field--wide">
            <label
              className="parking-editor__label"
              htmlFor={`${idPrefix}-ai-summary`}
            >
              AI要約
            </label>
            <textarea
              className="parking-editor__textarea"
              id={`${idPrefix}-ai-summary`}
              name="aiSummary"
              rows={4}
              maxLength={10_000}
              placeholder="料金や特徴の要約。必要に応じて手動で修正できます。"
              value={value.aiSummary}
              disabled={isBusy}
              onChange={(event) => {
                const nextAiSummary = event.currentTarget.value;
                setValue((current) => ({
                  ...current,
                  aiSummary: nextAiSummary,
                }));
              }}
            />
          </div>
        </div>
      </section>

      <section
        className="parking-editor__section parking-editor__section--photos"
        aria-labelledby={`${idPrefix}-photos-heading`}
      >
        <div className="parking-editor__section-heading">
          <h2
            className="parking-editor__section-title"
            id={`${idPrefix}-photos-heading`}
          >
            写真（任意）
          </h2>
          <p
            className="parking-editor__section-description"
          >
            この内容を保存した後、駐車場の詳細画面から写真を追加できます。
          </p>
        </div>
      </section>

      <div className="parking-editor__actions">
        <button
          className="parking-editor__button parking-editor__button--secondary"
          type="button"
          disabled={isBusy}
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button
          className="parking-editor__button parking-editor__button--primary"
          type="submit"
          disabled={isBusy}
        >
          {isBusy
            ? "保存中…"
            : mode === "create"
              ? "この内容で登録"
              : "変更を保存"}
        </button>
      </div>
    </form>
  );
}

export default ParkingEditor;
