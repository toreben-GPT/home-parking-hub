# home-parking-hub

自宅周辺の駐車場を、正規料金・徒歩時間・停めやすさ・空き実績で比較する2人用Webアプリです。

主な利用環境はiPhone Safariです。OpenAI APIや有料AI APIは使わず、アプリの維持費を抑える構成にしています。

## v1でできること

- 平日・土日祝の6つの利用パターンから正規料金を比較
- 料金、近さ、停めやすさ、空き実績、名称の順で自動並び替え
- 駐車場の追加・編集
- 料金看板の原文と6パターン料金の保存
- 現金・キャッシュレス・不明の登録
- 写真の保存
- 空き状況ログと集計
- 日時付きメモの追加・編集・削除
- AI分析用データのコピーと、ChatGPTで作った要約の手動保存
- 料金変更履歴
- JSONバックアップと全置換復元
- 共有アクセスコードと90日間の端末セッション

## 構成

| 役割 | 採用構成 |
| --- | --- |
| 画面 | React + TypeScript + Vite |
| 公開/API | Cloudflare Workers |
| 文字データ | Cloudflare D1 |
| 写真 | Cloudflare R2 |
| ソース管理 | GitHub |
| AI分析 | ChatGPTで手動実行（API連携なし） |

Cloudflareの接続前でも、Wranglerのローカル環境でD1・R2を試せます。本番のアカウント接続、秘密値の登録、公開は手動で行います。

## ローカルで動かす

初回だけ次を行います。

1. 依存関係を準備します。

   ```bash
   npm install
   ```

2. `.dev.vars.example`を`.dev.vars`へ複製し、ローカル専用の共有コードと長いランダム文字列を入力します。`.dev.vars`はGitへ送信されません。

3. ローカルD1へテーブルを作ります。

   ```bash
   npm run db:migrate:local
   ```

4. 画面をビルドします。

   ```bash
   npm run build
   ```

5. アプリを起動します。

   ```bash
   npm run worker:dev
   ```

表示されたローカルURLをSafariで開きます。

## 品質確認

```bash
npm run check
```

このコマンドは、静的解析、型チェック、ユニットテスト、本番ビルドを順番に実行します。

## Cloudflareへ接続する

初心者向けの手順は [docs/CLOUDFLARE_SETUP.md](docs/CLOUDFLARE_SETUP.md) にまとめています。

重要:

- 共有アクセスコードをソースコード、GitHub、チャットへ貼り付けないでください。
- `ACCESS_CODE`と`SESSION_SECRET`はCloudflareの「Secret」として登録します。
- `ACCESS_CODE`は20文字以上、`SESSION_SECRET`は32文字以上の別々の値にします。
- D1のマイグレーションを実行するまで、本番データは保存できません。
- JSONバックアップには文字データと写真メタデータが入りますが、写真ファイル本体は入りません。

## 仕様

実装基準は、作成時に添付された `parking_app_spec_v0.3.pdf` です。仕様上未確定だった項目の初期ルールは [docs/DATA_RULES.md](docs/DATA_RULES.md) に記録しています。
