import { Check, Clock3 } from "lucide-react";
import { PATTERN_DEFINITIONS } from "../shared/constants";
import type { PatternId } from "../shared/types";

interface PatternSelectorProps {
  value: PatternId;
  onChange: (value: PatternId) => void;
}

export function PatternSelector({ value, onChange }: PatternSelectorProps) {
  return (
    <section className="pattern-selector" aria-labelledby="pattern-title">
      <h2 id="pattern-title">利用パターン</h2>
      {(["平日", "土日祝"] as const).map((dayLabel) => (
        <fieldset key={dayLabel} className="pattern-group">
          <legend>{dayLabel}</legend>
          <div className="pattern-grid">
            {PATTERN_DEFINITIONS.filter((pattern) => pattern.dayLabel === dayLabel).map((pattern) => {
              const selected = pattern.id === value;
              return (
                <button
                  key={pattern.id}
                  className={`pattern-button${selected ? " pattern-button--selected" : ""}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(pattern.id)}
                >
                  {selected ? <Check className="pattern-button__check" aria-hidden="true" /> : null}
                  <span>{pattern.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="selected-pattern" aria-live="polite">
        <Clock3 aria-hidden="true" />
        <span>{PATTERN_DEFINITIONS.find((pattern) => pattern.id === value)?.fullLabel}</span>
      </div>
    </section>
  );
}
