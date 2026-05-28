# presentation-liquid

instyle.group Liquid Glass deck テンプレート（1366×900 landscape）。

## このフォルダの読み方（Claude 向け）

- `meta.json` — テンプレ ID / 利用可能スライド種別 / 制約
- `shell-head.html` — `<!DOCTYPE>` から `<style>` 全文 + `.track` 開始タグまで。**サーバが提供する**ので、生成側で再現してはいけない
- `shell-tail.html` — `.track` 閉じ + chrome + 共通 `<script>`。同じく**サーバが提供する**
- `slides/<TYPE>.html` — 各スライドタイプの完成サンプル

## DO

- 出力は `<!--SLIDE:TYPE-->...<!--/SLIDE-->` で 1 スライドずつ仕切る
- 1 スライドは必ず `<section class="slide slide--TYPE" data-name="..." data-mark="...">...</section>` の形を取る
- 既存の CSS 変数（`--color-*` / `--glass-*` / `--r-*` / `--font-*`）と、`shell-head.html` 内の `<style>` で定義されたクラスだけを使う
- 画像は `<img data-bank-id="img-XX" alt="..." class="...">` で**プレースホルダ参照**だけ書く。`src` は書かない（サーバ側で置換する）
- `data-name` / `data-mark` の値は人間向けのラベルなので、コンテンツに合わせて自然な日本語/英語に書き換えてよい（例: `data-name="調査結果"` `data-mark="Findings"`）
- 暗色スライドにしたいときは `data-dark="true"` を `<section>` に付ける（縦スクロール時のみ効く視覚処理）
- 文言・順序の自由度はあるが、**slides/*.html の DOM 骨格（クラス名・nesting・data-* 属性）は厳格に守る**

## DON'T

- `<!DOCTYPE>` / `<html>` / `<head>` / `<body>` / `<style>` / `<script>` を絶対に書かない（shell が持つ）
- `<section>` の中に `<script>` を書かない
- テンプレに無い CSS 変数や class 名を発明しない（自作スタイルや inline style での新規ルール定義は禁止）
- `<img src="...">` のように実 URL を埋め込まない（必ず `data-bank-id` を使う）
- スライド種別を勝手に増やさない（`meta.json` の `slideTypes` だけが許容される）
- マーカー外にプロローグ / エピローグ / コードブロック / コメンタリ等を出力しない

## スライド種別早見表

| TYPE | 用途 | 主な要素 |
|---|---|---|
| `cover` | 表紙 | `.eyebrow` / `.title-xl` / `.cover-meta` / `.cover-vmark` |
| `section` | 章扉 | `.title-xl` / `.section-rule` / `.lede` |
| `body` | 箇条書き型本文 | `.head` (`.eyebrow` + `.title-m`) / `.bullets > .bullet > .bullet-num + .bullet-body` |
| `two` | 2 カラム本文 + ビジュアル | `.two-text` / `.two-visual` (`.visual-label` + `.visual-frame` + `.visual-caption`) |
| `big` | 大数字 KPI | `.head` / `.bignum-wrap > .bignum > .bignum-value + .bignum-unit` / `.bignum-foot` |
| `quote` | 引用 | `.quote-wrap > .quote-mark + .quote-text + .quote-author` |
| `compare` | 2×2 比較カード | `.head` / `.compare-grid > .compare-card{,.is-warm,.is-tinted,.is-dark}` |
| `image-figure` | 図版 + キャプション (two の派生) | `.two-text` / `.two-visual` で `.visual-frame` を `<img class="visual-img" data-bank-id="...">` に置換 |
| `image-grid` | 画像 2×2 ギャラリー (compare の派生) | `.compare-grid` で各 card に `<img class="grid-img" data-bank-id="...">` |
| `closing` | 締め (常に dark) | `.eyebrow` / `.title-xl` / `.closing-fin` / `.closing-foot` (`.closing-meta` + `.closing-cta`) |

## 順序ヒント

`scaffoldOrder: ["cover", "section?", "body|two|big|image-figure|image-grid|quote|compare", "closing"]`

- 1 枚目は必ず `cover`
- 最終は必ず `closing`（`data-dark="true"` 推奨）
- 章扉は任意（長尺のときだけ `section` を挟む）
