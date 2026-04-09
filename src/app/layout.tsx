import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://minionsbid.vercel.app"),
  title: {
    default: "Minions Bid 🍌",
    template: "%s | Minions Bid",
  },
  description: "미니언즈(소모임) 전용 실시간 경매 드래프트 플랫폼",
  keywords: [
    "리그오브레전드",
    "LoL",
    "경매",
    "내전",
    "미니언즈",
    "팀구성",
    "드래프트",
  ],
  authors: [{ name: "Antigravity" }],
  verification: {
    google: "MDjk5WdTY8Pl_7kx3O84WmAebWeKmh2-1BK39ZzeGWA",
  },
  openGraph: {
    title: "Minions Bid 🍌",
    description: "미니언즈(소모임) 전용 실시간 경매 드래프트 플랫폼",
    url: "https://minionsbid.vercel.app",
    siteName: "Minions Bid",
    images: [
      {
        url: "/thumbnail_2.png",
        width: 1200,
        height: 630,
        alt: "Minions Bid Thumbnail",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Minions Bid",
    description: "미니언즈(소모임) 전용 실시간 경매 드래프트 플랫폼",
    images: ["/thumbnail_2.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FDE047",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Minions Bid",
              url: "https://minionsbid.vercel.app",
              description: "미니언즈(소모임) 전용 실시간 경매 드래프트 플랫폼",
              applicationCategory: "GameApplication",
              operatingSystem: "All",
              offers: {
                "@type": "Offer",
                price: "0",
              },
            }),
          }}
        />
      </head>
      <body className={"antialiased min-h-screen"}>{children}</body>
    </html>
  );
}
