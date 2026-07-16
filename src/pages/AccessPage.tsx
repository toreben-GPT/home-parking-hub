import { FormEvent, useState } from "react";
import { KeyRound, ParkingSquare } from "lucide-react";
import { Feedback } from "../components/Feedback";
import { useAuth } from "../contexts/auth-context";

export function AccessPage() {
  const { login } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) {
      setError("共有アクセスコードを入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "アクセスコードを確認できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-screen">
      <section className="access-panel" aria-labelledby="access-title">
        <div className="brand-mark" aria-hidden="true">
          <ParkingSquare />
        </div>
        <h1 id="access-title">駐車場比較</h1>
        <p className="access-panel__lead">
          共有アクセスコードを入力してください。この端末では、通常は次回から入力不要です。
        </p>
        <form className="access-form" onSubmit={handleSubmit}>
          <label htmlFor="access-code">共有アクセスコード</label>
          <div className="input-with-icon">
            <KeyRound aria-hidden="true" />
            <input
              id="access-code"
              name="access-code"
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={busy}
              enterKeyHint="go"
              required
            />
          </div>
          {error ? <Feedback tone="error">{error}</Feedback> : null}
          <button className="button button--primary button--wide" type="submit" disabled={busy}>
            {busy ? "確認しています…" : "アプリを開く"}
          </button>
        </form>
        <p className="access-panel__note">共有コードは公開ページやGitHubには保存されません。</p>
      </section>
    </main>
  );
}
