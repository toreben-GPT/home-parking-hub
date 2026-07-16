import { DatabaseBackup, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Feedback, LoadingView } from "../components/Feedback";
import { ParkingResultRow } from "../components/ParkingResultRow";
import { PatternSelector } from "../components/PatternSelector";
import { api } from "../services/api";
import { getRecommendationLabels, sortParkingLots } from "../shared/domain";
import { PATTERN_IDS, type ParkingLot, type PatternId } from "../shared/types";

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPattern = searchParams.get("pattern");
  const patternId: PatternId = PATTERN_IDS.includes(requestedPattern as PatternId)
    ? (requestedPattern as PatternId)
    : "WN-19";
  const [parkingLots, setParkingLots] = useState<ParkingLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError("");
    try {
      setParkingLots(await api.listParking(false));
      setUpdatedAt(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "駐車場データを読み込めませんでした。");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePatternChange = useCallback(
    (nextPattern: PatternId) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("pattern", nextPattern);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const sortedLots = useMemo(() => sortParkingLots(parkingLots, patternId), [parkingLots, patternId]);
  const labels = useMemo(
    () => getRecommendationLabels(parkingLots, patternId),
    [parkingLots, patternId],
  );

  return (
    <main className="screen home-screen">
      <header className="home-header">
        <h1>駐車場比較</h1>
        <button
          className="home-header__refresh"
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          <RefreshCw className={refreshing ? "is-spinning" : ""} aria-hidden="true" />
          <span>{refreshing ? "更新中" : "更新"}</span>
        </button>
      </header>

      <div className="home-content">
        <Link className="button button--primary button--wide add-parking-button" to="/parking/new">
          <Plus aria-hidden="true" />
          駐車場を追加
        </Link>

        <PatternSelector value={patternId} onChange={handlePatternChange} />

        {error ? (
          <div className="home-feedback">
            <Feedback tone="error">{error}</Feedback>
            <button className="button button--secondary button--wide" type="button" onClick={() => void load()}>
              もう一度読み込む
            </button>
          </div>
        ) : null}

        <section className="results-section" aria-labelledby="results-title">
          <div className="results-heading">
            <div>
              <h2 id="results-title">料金の安い順</h2>
              <p>公式料金・順位はおすすめ表示で変わりません</p>
            </div>
            <span>{sortedLots.length}件</span>
          </div>
          {loading ? (
            <LoadingView />
          ) : sortedLots.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon" aria-hidden="true">
                <Plus />
              </div>
              <h3>駐車場を登録しましょう</h3>
              <p>料金看板を確認した駐車場から、1件ずつ追加できます。</p>
              <Link className="button button--primary" to="/parking/new">
                最初の駐車場を追加
              </Link>
            </div>
          ) : (
            <ol className="result-list">
              {sortedLots.map((lot, index) => (
                <ParkingResultRow
                  key={lot.id}
                  lot={lot}
                  patternId={patternId}
                  rank={index + 1}
                  labels={labels.get(lot.id) ?? []}
                />
              ))}
            </ol>
          )}
        </section>

        <Link className="data-management-link" to="/data">
          <DatabaseBackup aria-hidden="true" />
          <span>
            <strong>バックアップ・データ管理</strong>
            <small>
              {updatedAt
                ? `最終読込 ${updatedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                : "JSON書き出し・復元・登録状況"}
            </small>
          </span>
        </Link>
      </div>
    </main>
  );
}
