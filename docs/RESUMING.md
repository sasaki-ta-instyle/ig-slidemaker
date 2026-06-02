# ig-slidemaker 再開手順

このドキュメントは、Claude Code セッションを終了したり別の Mac に切り替えた後で、
`ig-slidemaker` の開発・運用作業をスムーズに再開するためのチェックリスト。

> **このアプリの位置づけ:** 単一ページ HTML 出力 (`ig-builder-light`) の姉妹アプリ。
> `multipart/form-data` で 1 ファイル + テンプレ ID + スライド枚数目安 + 任意の追加指示を受け取り、
> `src/templates/<id>/` の規約に沿った **マルチスライド HTML** を Claude がストリーミングで返す。
> SSE は slide 単位（`slide_start` / `slide_delta` / `slide_done`）で流れる。

## 画像処理の現状（Phase 1）

| 入力 | 状態 |
|---|---|
| PDF embedded（`extractPdfEmbedded`） | 実装済（pdfjs operator-list ベースで JPEG/PNG を回収） |
| PDF page capture（`renderPdfPages`） | **未実装**（Phase 2）。`/api/generate` は `progress: pdf_page_capture_skipped` を流して UI に通知する |
| PPTX embedded（`extractPptxEmbedded`） | 実装済（`ppt/media/`） |
| DOCX embedded（`extractDocxEmbedded`） | 実装済（`word/media/`） |
| 単一画像入力（`extractSingleImage`） | 実装済 |

抽出した画像は `ImageBank.finalize()` で WebP 化され、`data:URL` または `<img data-bank-id="img-XX">` プレースホルダ経由で
最終 HTML に貼り込まれる（`applyImageBank`）。

## テンプレ追加方法

`src/templates/<template-id>/` を作って以下を置く:

```
src/templates/<id>/
  meta.json          # id / name / description / slideTypes / viewport 等
  shell-head.html    # <!DOCTYPE html> から <body> 開きまで（CSS 全部入り）
  shell-tail.html    # </body></html>
  slides/<type>.html # cover / agenda / section / body / image-figure / image-grid の 6 種完成サンプル
  README.md          # Claude 向け DO/DON'T
```

`meta.json` の `id` はディレクトリ名と一致必須。`/api/templates` GET で自動列挙される。

> **更新ルール:** このファイルを変更したら必ず main に push して、別 Mac / 別メンバーが
> 最新を取れる状態に保つ。秘密値そのものは絶対に書かない（取得元のリンクのみ）。

---

## 0. このアプリの基本情報

| 項目 | 値 |
|---|---|
| 公開 URL | `https://app.instyle.group/ig-slidemaker/` |
| GitHub | `https://github.com/sasaki-ta-instyle/ig-slidemaker`（Private 想定） |
| ConoHa デプロイ先 | `/var/www/app/ig-slidemaker/` |
| 共有 env | `/var/www/_shared/apps/app-ig-slidemaker.env`（chmod 600） |
| PM2 名 | `app-ig-slidemaker` |
| ポート | `3010` |
| Healthcheck | `/ig-slidemaker/api/health` |
| USE_DB | `false` |

---

## 1. 同じ Mac で再開する

Claude Code を終了しただけなら、以下だけで OK。

```bash
claude
```

このプロジェクトのチャット履歴・memory・state はそのまま残っている。
何も入れなくても前回の文脈のまま再開できる。

---

## 2. 別の Mac（サブ機 / 新メンバー）で再開する

### 2.1 Claude Code 環境を揃える

メイン Mac の `~/.claude` 配下（settings / memory / agents / skills / plugins）は
**`instyle-claude-sasaki` リポジトリ** が同期の正本。bootstrap してメイン機と同じ状態にする。

### 2.2 ソースコードを取得

```bash
mkdir -p ~/Workspace
gh repo clone sasaki-ta-instyle/ig-slidemaker ~/Workspace/ig-slidemaker
cd ~/Workspace/ig-slidemaker
```

### 2.3 ローカル開発に必要なツール

```bash
brew install pnpm
# Redis を使うアプリなら:
# brew install redis && brew services start redis
pnpm install
```

### 2.4 機密情報を配置（git 管理外）

#### `.env.local` — 1Password などから取得して配置

`~/Workspace/ig-slidemaker/.env.local` に必要なキーを揃える（**git に入れない**）。
本番 `app-ig-slidemaker.env` と概ね同じ値で動く。

このアプリで実際に使う env 一覧は **`.env.example` を見る**（ある場合）か、
`src/` 配下で `process.env.XXX` を grep する。

##### よくある取得元

| キー | 取得先 |
|---|---|
| `NEXTAUTH_SECRET` / `TOKEN_ENCRYPTION_KEY` | 1Password、または新規生成（`openssl rand -base64 48` / `openssl rand -hex 32`） |
| `RESEND_API_KEY` | https://resend.com/api-keys |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `*_DATABASE_URL` / DB 接続情報 | 1Password、または ConoHa 上の SQLite なら不要 |
| その他 SaaS のキー | 各サービスのコンソール |

#### `~/.ssh/config` + `conoha_{root,deploy}` 鍵（ConoHa 直接操作が必要な場合）

詳細は `~/Workspace/docs/conoha-setup.md` の **0-11b** を参照。

```bash
chmod 600 ~/.ssh/conoha_root ~/.ssh/conoha_deploy

mkdir -p ~/.ssh && cat >> ~/.ssh/config <<'EOF'

Host conoha-deploy
    HostName 160.251.201.115
    User deploy
    IdentityFile ~/.ssh/conoha_deploy
    IdentitiesOnly yes
    ServerAliveInterval 30

Host conoha-root
    HostName 160.251.201.115
    User root
    IdentityFile ~/.ssh/conoha_root
    IdentitiesOnly yes
    ServerAliveInterval 30
EOF
chmod 600 ~/.ssh/config

# 疎通確認
ssh conoha-deploy 'whoami'  # → deploy
ssh conoha-root   'whoami'  # → root
```

### 2.5 起動

```bash
# DB を使うアプリなら migration を先に
# pnpm migrate

pnpm dev
# → http://localhost:3010/ig-slidemaker/ にアクセス
```

---

## 3. データ・状態の永続化マッピング

| 種類 | 場所 | 引き継ぎ方法 |
|---|---|---|
| ソースコード | GitHub `sasaki-ta-instyle/ig-slidemaker` | `git clone` |
| Claude Code 設定（memory / agents / skills） | `instyle-claude-sasaki` リポジトリ | bootstrap で同期 |
| 本番 Web プロセス（PM2） | ConoHa `app-ig-slidemaker` | 触らない、`deploy-prod.yml` で更新 |
| 本番 env（API キー類） | ConoHa `/var/www/_shared/apps/app-ig-slidemaker.env` | サーバ側永続、`ssh conoha-deploy` で参照可 |
| 本番 DB（SQLite の場合） | ConoHa `/var/www/app/ig-slidemaker/data/...` | サーバ側永続 |
| ConoHa SSH 鍵 | 1Password | 別 Mac で `~/.ssh/` に配置 |
| 各 SaaS のクレジット・課金 | 各サービスのアカウント | ブラウザで確認 |
| ローカル `.env.local` | 各 Mac のローカル | 1Password 経由 or 各 Mac で再生成 |
| ローカル `data/` 配下 | 各 Mac のローカル | **同期しない**（dev 用テストデータ） |

---

## 4. よくある運用コマンド

### 本番に新コードを反映する

```bash
gh workflow run deploy-prod.yml --ref main -R sasaki-ta-instyle/ig-slidemaker
gh run watch -R sasaki-ta-instyle/ig-slidemaker
```

### 本番 env を 1 行だけ書き換える

```bash
ssh conoha-deploy '
sed -i "s|^KEY_NAME=.*|KEY_NAME=new_value|" /var/www/_shared/apps/app-ig-slidemaker.env
cd /var/www/app/ig-slidemaker/current && pm2 startOrReload ecosystem.config.cjs --update-env
'
```

### 本番 PM2 ログを覗く

```bash
ssh conoha-deploy 'pm2 logs app-ig-slidemaker --nostream --lines 50 --raw'
```

### 本番 PM2 再起動

```bash
ssh conoha-deploy 'pm2 restart app-ig-slidemaker --update-env'
```

### ロールバック（手動）

```bash
ssh conoha-deploy '
cd /var/www/app/ig-slidemaker/releases
ls -lt | head -5
ln -sfn <previous-sha> ../current.new && mv -T ../current.new ../current
pm2 reload app-ig-slidemaker --update-env
'
```

GitHub Actions 失敗時は workflow が自動ロールバックする。

---

## 5. 残タスク / 未実装の挙動

新規プロジェクトでは空。Phase が進むたびにここを埋める。

| # | 内容 | 状態 |
|---|---|---|
|  |  |  |

---

## 6. 緊急時の参考

- ConoHa 本番運用 runbook: `~/Workspace/docs/conoha-setup.md`
- ポート台帳: `~/Workspace/docs/conoha-port-registry.md`
- アプリアーカイブ手順: `~/Workspace/docs/conoha-app-archive.md`
- このアプリの `CLAUDE.md`（同階層）: 設計判断・運用ルール
