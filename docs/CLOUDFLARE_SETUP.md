# Cloudflare手動接続ガイド

このファイルは、アプリ完成後にCloudflareへ接続するための初心者向け手順です。共有アクセスコードや秘密の文字列は、GitHubやチャットへ貼り付けないでください。

## このアプリで使うCloudflareサービス

- Workers: Web画面とAPIを同じURLで公開
- D1: 駐車場、料金、空きログ、メモなどの文字データを共有保存
- R2: 料金看板などの写真を非公開で保存

想定名:

- Worker: `home-parking-hub`
- D1 database: `home-parking-hub-db`
- D1 binding: `DB`
- R2 bucket: `home-parking-hub-photos`
- R2 binding: `PHOTOS`
- Secrets: `ACCESS_CODE`, `SESSION_SECRET`

名前を変更する場合は、Cloudflare側と `wrangler.jsonc` の両方を一致させます。

## 1. GitHubを接続

1. Cloudflare Dashboardを開きます。
2. **Workers & Pages** → **Create application** を開きます。
3. GitHubを選び、`toreben-GPT/home-parking-hub`を接続します。
4. Production branchは `main` を選びます。
5. Build commandは `npm run build` にします。
6. Deploy commandは `npx wrangler deploy` にします。
7. Root directoryは空欄（リポジトリ直下）のままにします。

この時点で秘密値が未登録なら、最初の公開は失敗しても問題ありません。秘密値をコードへ仮置きしないで、次の手順で登録します。

## 2. D1とR2を確認

`wrangler.jsonc`にはD1とR2のBinding名が記載されています。Cloudflareの自動作成を使う場合でも、公開後に次を確認してください。

- D1のBinding名が `DB`
- R2のBinding名が `PHOTOS`
- それぞれが意図したDatabase/Bucketへ接続されている

Dashboardで手動作成する場合:

1. D1 Databaseを `home-parking-hub-db` という名前で作成します。
2. R2 Bucketを `home-parking-hub-photos` という名前で作成します。
3. Workerの **Settings** → **Bindings** で、D1を `DB`、R2を `PHOTOS` として追加します。

## 3. Secretを登録

Workerの **Settings** → **Variables and Secrets** で、次の2つを「Secret」として追加します。

### ACCESS_CODE

2人だけが知っている共有アクセスコードです。

- 名前: `ACCESS_CODE`
- 値: 自分で決めた20文字以上の共有コード

### SESSION_SECRET

ログイン済みセッションへ署名するための、長いランダム文字列です。共有アクセスコードとは別の値にします。

- 名前: `SESSION_SECRET`
- 値: パスワード管理アプリ等で生成した32文字以上のランダム文字列

どちらも「Text」や通常のVariableではなく「Secret」にします。
2つは必ず別の値にしてください。

## 4. D1へテーブルを作成

Cloudflareへログイン済みのMacから、プロジェクト直下で次を実行します。

```bash
npm run db:migrate:remote
```

この操作は `migrations/` のSQLを本番D1へ適用します。実行前に、対象Database名が `home-parking-hub-db` であることを確認してください。

## 5. 再公開

CloudflareのBuildを再実行するか、`main`への次回pushで自動公開します。

公開後に次を確認します。

1. 公開URLでアクセスコード画面が出る
2. 正しい共有コードで入れる
3. 駐車場を1件追加できる
4. 画面更新後もデータが残る
5. 写真を1枚追加し、再表示できる
6. もう1台の端末で同じ駐車場が見える
7. JSONを書き出せる
8. iPhone Safariで横スクロール、入力時ズーム、操作不能がない

## 6. 全端末をログアウトさせたい場合

`SESSION_SECRET`を新しいランダム文字列へ変更すると、既存セッションの署名が無効になり、全端末で再ログインが必要になります。

`ACCESS_CODE`も変更すれば、以後は新しい共有コードだけが使えます。

## 困ったとき

- 「保存できません」: D1 Binding `DB`とマイグレーションを確認
- 「写真を保存できません」: R2 Binding `PHOTOS`を確認
- 「サーバー設定が未完了」: `ACCESS_CODE`と`SESSION_SECRET`がSecretとして登録されているか確認
- 公開画面が古い: Cloudflare Buildの完了、対象branch、最新commitを確認

秘密値そのものではなく、エラー画面や設定名だけを共有すれば安全に調査できます。
