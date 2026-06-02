# presentation-liquid — テンプレ規約（Claude 向け DO/DON'T）

instyle.group の Liquid Glass デザインシステムに準拠した landscape プレゼンテーション。
`Workspace/ig-slidemaker-template` を ig-slidemaker のテンプレ規約に分解したもの。

## 基本仕様

| 項目 | 値 |
| --- | --- |
| ビューポート | 1366 × 900（iPad Pro 12.9 横） |
| デザインシステム | Liquid Glass（`design-system_liquid`） |
| フォント | Gen Interface JP / Display |
| カラー | warm-neutral（`#EDE9E0` 系）固定。**パレット切替なし** |
| スライド数上限 | 40 |
| ブラウザナビ | `shell-tail.html` の `<script>` が timeline / overview / fullscreen / swipe / pill nav を担う |

## スライド種別（6 種）

1. `cover` — 表紙（必須・先頭）
2. `agenda` — アジェンダ／目次（5 項目グリッド）
3. `section` — セクション扉
4. `body` — 本文（左リード + 右 3 カード）
5. `image-figure` — 画像 1 枚 + 解説（右サイド）
6. `image-grid` — 画像 2×2 グリッド

`closing` は廃止。最後のスライドは `body` / `section` / `image-figure` で自然に締める。

## DO

- 各スライドは `<section class="slide slide--TYPE" data-slide="TYPE" data-title="NN. ラベル">…</section>` で出力する
- `data-title` は **`NN. 短いラベル`** の形（例: `01. 表紙`）。タイムラインに表示される
- `TYPE` は上記 6 種のいずれか（meta.json `slideTypes` 準拠）
- 画像は `<img data-bank-id="img-XX" alt="…">` プレースホルダで指定（サーバ側で WebP に置換）
- `--color-highlight` (#E2DD2A) は本文中の `<mark>` 専用
- グラスは `--glass-light` / `--glass-warm` / `--glass-tinted` / `--glass-dark` の 4 種から **同一スライドで 3 種まで**
- 既存サンプル `slides/<TYPE>.html` の DOM ツリー / クラス名 / data-* を**そのまま**踏襲。中のテキストだけ差し替える

## DON'T

- `<!DOCTYPE>` / `<html>` / `<head>` / `<body>` / `<style>` / `<script>` を出さない（shell-head/tail で完備）
- 新しいクラス名や CSS 変数を発明しない（shell-head の `<style>` に定義済みのもののみ使用）
- `style="color:…"` / `style="background:…"` などインライン色指定を書かない（クラスで表現）
- `is-active` クラスを明示的に付けない（JS が自動で付ける）
- `<img src="…">` を書かない（必ず `data-bank-id`）

## 出力契約のおさらい

```
<!--SLIDE:cover-->
<section class="slide slide--cover" data-slide="cover" data-title="01. 表紙">
  …
</section>
<!--/SLIDE-->

<!--SLIDE:agenda-->
<section class="slide slide--agenda" data-slide="agenda" data-title="02. アジェンダ">
  …
</section>
<!--/SLIDE-->
```

各スライドは `<!--SLIDE:TYPE-->` 〜 `<!--/SLIDE-->` で挟む。サーバ側 SSE が slide 単位に分割して配信する。
