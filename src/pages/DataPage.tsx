import { ChangeEvent, useEffect, useRef, useState } from "react";
import { DatabaseBackup, Download, Info, LogOut, Pencil, RefreshCw, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Feedback, LoadingView } from "../components/Feedback";
import { useAuth } from "../contexts/auth-context";
import { api } from "../services/api";
import { APP_BUILD_TIME, APP_RELEASE_NOTE, APP_VERSION } from "../app-info";
import { SUPPORTED_BACKUP_SCHEMA_VERSIONS } from "../shared/constants";
import type { BackupEnvelope, ParkingLot, ParkingStatus } from "../shared/types";

const STATUS_LABELS: Record<ParkingStatus, string> = {
  active: "利用中",
  excluded: "候補から除外",
  closed: "閉鎖",
};

const APP_BUILD_TIME_LABEL = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
}).format(new Date(APP_BUILD_TIME));

export function DataPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parkingLots, setParkingLots] = useState<ParkingLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"backup" | "restore" | "logout" | "refresh" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingBackup, setPendingBackup] = useState<BackupEnvelope | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");

  async function loadLots(showBusy = false) {
    if (showBusy) setBusy("refresh");
    setError("");
    try {
      setParkingLots(await api.listParking(true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "駐車場データを読み込めませんでした。");
    } finally {
      setLoading(false);
      if (showBusy) setBusy(null);
    }
  }

  useEffect(() => {
    void loadLots();
  }, []);

  async function handleBackup() {
    setBusy("backup");
    setError("");
    setSuccess("");
    try {
      const { blob, fileName } = await api.downloadBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setSuccess("JSONバックアップを書き出しました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "バックアップを書き出せませんでした。");
    } finally {
      setBusy(null);
    }
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPendingBackup(null);
    setPendingFileName("");
    setSuccess("");
    setError("");
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("バックアップファイルが大きすぎます（上限20MB）。");
      event.target.value = "";
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as BackupEnvelope;
      if (
        !SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(parsed.schemaVersion) ||
        !Array.isArray(parsed.parkingLots)
      ) {
        throw new Error("このアプリのバックアップ形式ではありません。");
      }
      setPendingBackup(parsed);
      setPendingFileName(file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "JSONファイルを読み取れませんでした。");
      event.target.value = "";
    }
  }

  async function handleRestore() {
    if (!pendingBackup) return;
    const confirmed = window.confirm(
      `${pendingBackup.parkingLots.length}件のバックアップで、現在の文字データをすべて置き換えます。続けますか？`,
    );
    if (!confirmed) return;
    setBusy("restore");
    setError("");
    setSuccess("");
    try {
      const restored = await api.restoreBackup(pendingBackup);
      setParkingLots(restored);
      setPendingBackup(null);
      setPendingFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess(`${restored.length}件の文字データを復元しました。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "バックアップを復元できませんでした。");
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    setBusy("logout");
    await logout();
  }

  return (
    <main className="screen">
      <AppHeader
        title="データ管理"
        onBack={() => navigate(-1)}
        actions={
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadLots(true)}
            disabled={busy !== null}
            aria-label="最新データへ更新"
          >
            <RefreshCw aria-hidden="true" />
          </button>
        }
      />

      <div className="content-column content-column--narrow">
        {error ? <Feedback tone="error">{error}</Feedback> : null}
        {success ? <Feedback tone="success">{success}</Feedback> : null}

        <section className="data-section" aria-labelledby="backup-title">
          <div className="section-heading">
            <DatabaseBackup aria-hidden="true" />
            <div>
              <h2 id="backup-title">JSONバックアップ</h2>
              <p>文字データをまとめて保存・復元します。</p>
            </div>
          </div>
          <button
            className="button button--secondary button--wide"
            type="button"
            onClick={() => void handleBackup()}
            disabled={busy !== null}
          >
            <Download aria-hidden="true" />
            {busy === "backup" ? "書き出しています…" : "バックアップを書き出す"}
          </button>
          <div className="restore-box">
            <label className="file-button" htmlFor="backup-file">
              <Upload aria-hidden="true" />
              復元するJSONを選ぶ
            </label>
            <input
              ref={fileInputRef}
              id="backup-file"
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleFileSelection(event)}
              disabled={busy !== null}
            />
            {pendingBackup ? (
              <div className="restore-preview">
                <strong>{pendingFileName}</strong>
                <span>
                  {pendingBackup.parkingLots.length}件・
                  {new Date(pendingBackup.exportedAt).toLocaleString("ja-JP")}
                </span>
                <button
                  className="button button--danger button--wide"
                  type="button"
                  onClick={() => void handleRestore()}
                  disabled={busy !== null}
                >
                  {busy === "restore" ? "復元しています…" : "現在のデータを置き換えて復元"}
                </button>
              </div>
            ) : null}
          </div>
          <p className="quiet-note">
            写真本体はR2に分けて保存されるため、このJSONには写真の情報だけが含まれます。
          </p>
        </section>

        <section className="data-section" aria-labelledby="parking-list-title">
          <div className="section-heading">
            <div>
              <h2 id="parking-list-title">登録済み駐車場</h2>
              <p>除外・閉鎖した候補もここから編集できます。</p>
            </div>
          </div>
          {loading ? (
            <LoadingView />
          ) : parkingLots.length === 0 ? (
            <p className="empty-inline">まだ駐車場は登録されていません。</p>
          ) : (
            <ul className="management-list">
              {parkingLots.map((lot) => (
                <li key={lot.id}>
                  <div>
                    <strong>{lot.name}</strong>
                    <span>{STATUS_LABELS[lot.status]}</span>
                  </div>
                  <Link className="icon-button" to={`/parking/${lot.id}/edit`} aria-label={`${lot.name}を編集`}>
                    <Pencil aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="data-section data-section--quiet">
          <h2>この端末のセッション</h2>
          <button
            className="button button--text button--wide"
            type="button"
            onClick={() => void handleLogout()}
            disabled={busy !== null}
          >
            <LogOut aria-hidden="true" />
            {busy === "logout" ? "ログアウトしています…" : "この端末でログアウト"}
          </button>
        </section>

        <section className="data-section data-section--quiet" aria-labelledby="app-info-title">
          <div className="section-heading">
            <Info aria-hidden="true" />
            <div>
              <h2 id="app-info-title">アプリ情報</h2>
              <p>公開中の修正版か確認できます。</p>
            </div>
          </div>
          <dl className="app-info-list">
            <div>
              <dt>バージョン</dt>
              <dd>v{APP_VERSION}</dd>
            </div>
            <div>
              <dt>ビルド日時</dt>
              <dd>{APP_BUILD_TIME_LABEL}</dd>
            </div>
            <div>
              <dt>更新内容</dt>
              <dd>{APP_RELEASE_NOTE}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
