# ig-slidemaker

> **「資料を入れると、プレゼン用のスライドHTMLに。」**
>
> PDF / DOCX / PPTX / 画像 を 1 ファイル投入すると、`src/templates/<template>/` に同梱したプレゼンスライドのテンプレ規約に当てはまった**マルチスライド HTML**（1 ファイル縦並び、印刷で PDF 化可能）を Claude がストリーミングで返す。
>
> 単一ページ HTML 用の `ig-builder-light` から派生した姉妹アプリ。**スライド単位のストリーミング表示**、**埋め込み画像/ページキャプチャの貼り込み**、**テンプレ規約の厳格化**に特化している。

## アーキテクチャ要点

- **Next.js 16 App Router**（Node runtime）。Web 1 プロセスのみ、Runner なし
- 入力: `multipart/form-data` で 1 ファイル（〜25MB）+ `template`(string) + `slideCountHint`(number, 5-40) + `instruction`(string, 任意)
- 抽出層: `src/lib/attachments/`（既存テキスト抽出）+ `src/lib/media/`（画像抽出 / PDF ページキャプチャ / WebP 変換）
- 生成: `anthropic.messages.stream`（system にテンプレ一式 + `design-liquid.md` + 画像メタ一覧、prompt cache 付き）
- 応答: SSE（`progress` / `slide_start` / `slide_delta` / `slide_done` / `done` / `error`）。`X-Accel-Buffering: no` で Nginx バッファ回避
- 後処理: `<img data-bank-id="img-XX">` プレースホルダを data:URL または `/<app>/_ig-slidemaker-assets/<sha>.webp` に置換
- 出力: `<iframe srcdoc>` にライブプレビュー、`@media print { .slide { page-break-after:always } }` で印刷 PDF 対応

## テンプレ規約 `src/templates/<template>/`

- `meta.json` — テンプレ ID / 種別一覧 / 制約
- `tokens.css` — CSS 変数（カラー・余白・角丸）。これ以外の値を生成HTMLで使わない
- `base.html` — 共通 `<head>` と `<style>` 全文を含む最小サンプル1枚
- `slides/<type>.html` — 種別ごとの完成サンプル（cover / agenda / content / image-figure / image-grid / stats / closing 等）
- `README.md` — Claude 向け DO/DON'T

出力契約: `<!--SLIDE:type-->...<!--/SLIDE-->` で各スライドを仕切る。サーバ側 `slideSplitter` が SSE イベントに分割。

## デプロイ設定

| キー | 値 |
|---|---|
| CATEGORY | `app` |
| APP_NAME | `ig-slidemaker` |
| PORT | `3010` |
| 公開URL | `https://app.instyle.group/ig-slidemaker/` |
| HEALTHCHECK_PATH | `/ig-slidemaker/api/health` |
| USE_DB | `false` |
| PM2名 | `app-ig-slidemaker` |
| サーバ側パス | `/var/www/app/ig-slidemaker/` |
| アプリ固有 env | `/var/www/_shared/apps/app-ig-slidemaker.env` |

## 共通アセット (favicon / logo / OGP)

`https://app.instyle.group/_shared/static/{favicon.png, logo.svg, ogp.jpg}` を絶対 URL で `app/layout.tsx` の metadata に指定（詳細: `~/Workspace/docs/conoha-shared-assets.md`）。

## ローカル開発

```bash
pnpm install
pnpm dev
# http://localhost:3010/ig-slidemaker/ でアクセス（basePath 込み）
```

> 初回コミット前に必ず `pnpm install` で `pnpm-lock.yaml` を生成する（GH Actions の `cache: pnpm` が要求）。

## 本番デプロイ

「本番にあげて」と Claude Code に指示すると、`gh workflow run deploy-prod.yml --ref main` で ConoHa にデプロイされる。

## 必要な env

`/var/www/_shared/apps/app-ig-slidemaker.env`（deploy 所有 + chmod 600）に最低：

```
ANTHROPIC_API_KEY=...
# 任意
# ANTHROPIC_MODEL=claude-sonnet-4-6
# 「4. 公開する」を使うときだけ
# PUBLISH_BASE_DIR=/var/www
```

## 初回 ConoHa セットアップ

```bash
# bootstrap-conoha-app.sh が全部やる
bash ~/Workspace/scripts/bootstrap-conoha-app.sh --yes
```

手動で行う場合の Nginx 雛形（2 段 location + SSE 用 buffer off）:

```nginx
location = /ig-slidemaker {
  include snippets/proxy-next.conf;
  proxy_pass http://127.0.0.1:3010;
}
location ^~ /ig-slidemaker/ {
  include snippets/proxy-next.conf;
  proxy_pass http://127.0.0.1:3010;
}
location = /ig-slidemaker/api/generate {
  include snippets/proxy-next.conf;
  proxy_pass http://127.0.0.1:3010;
  proxy_buffering off;
  proxy_cache off;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
}
```

## デザインシステム

本体 UI は **Liquid Glass**（`design-system_liquid` 準拠）。生成スライドはテンプレ側のデザインに従う。

## 中断・再開

`docs/RESUMING.md` を最初に読む。別 Mac から再開する手順、開発中の落とし穴、テスト用ファイル置き場をまとめている。
