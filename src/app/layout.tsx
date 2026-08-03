import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://app.instyle.group/ig-slidemaker";
const ASSETS = "https://app.instyle.group/_shared/static";

const TITLE = "IG スライドメーカー | INSTYLE GROUP";
const DESCRIPTION =
  "PDF / 画像 / Word / PowerPoint を入れると、instyle.group プレゼンテンプレに沿ったマルチスライド HTML を生成します。";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: `${ASSETS}/favicon.png`, apple: `${ASSETS}/favicon.png` },
  openGraph: {
    type: "website",
    siteName: "INSTYLE GROUP",
    locale: "ja_JP",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${ASSETS}/ogp.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${ASSETS}/ogp.jpg`],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/gen-interface-jp@0.5.0/all.css"
        />
      </head>
      <body>
        <div className="scene-bg" aria-hidden="true" />
        <div className="app">{children}</div>
      </body>
    </html>
  );
}
