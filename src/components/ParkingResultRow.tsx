import { Banknote, ChevronRight, Footprints, ParkingCircle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  formatAvailabilitySummary,
  formatPaymentMethods,
  formatYen,
  getAvailabilitySummary,
} from "../shared/domain";
import type { ParkingLot, PatternId, RecommendationLabel } from "../shared/types";

interface ParkingResultRowProps {
  lot: ParkingLot;
  patternId: PatternId;
  rank: number;
  labels: RecommendationLabel[];
}

export function ParkingResultRow({ lot, patternId, rank, labels }: ParkingResultRowProps) {
  const price = lot.currentPricing.patternPrices[patternId];
  const availability = getAvailabilitySummary(lot.availabilityLogs, patternId);

  return (
    <li>
      <Link className="result-row" to={`/parking/${lot.id}?pattern=${patternId}`}>
        <span className="result-row__rank" aria-label={`${rank}位`}>
          {rank}
        </span>
        <div className="result-row__body">
          <strong className="result-row__name">{lot.name}</strong>
          <div className="result-row__facts">
            <span>
              <Footprints aria-hidden="true" />
              {lot.walkMinutes === null ? "徒歩 未登録" : `徒歩${lot.walkMinutes}分`}
            </span>
            <span>
              <Banknote aria-hidden="true" />
              {formatPaymentMethods(lot.paymentMethods)}
            </span>
          </div>
          <div className="result-row__availability">
            <ParkingCircle aria-hidden="true" />
            {formatAvailabilitySummary(availability)}
          </div>
          {labels.length > 0 ? (
            <div className="result-row__labels">
              {labels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className={`result-row__price${price.needsConfirmation ? " result-row__price--unknown" : ""}`}>
          <strong>{formatYen(price)}</strong>
          <ChevronRight aria-hidden="true" />
        </div>
      </Link>
    </li>
  );
}
