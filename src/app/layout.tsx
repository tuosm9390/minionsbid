import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "League Auction 🍌",
  description: "미니언즈 테마의 리그오브레전드 5인1조 경매 내전 플랫폼",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // headers()를 호출하여 RootLayout을 동적 렌더링(Dynamic Rendering)으로 강제 전환합니다.
  // 이를 통해 Middleware에서 생성한 동적 CSP Nonce가 정적 캐시에 묻히지 않고
  // Next.js에서 생성하는 모든 <script> 태그에 정상적으로 주입됩니다.
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || undefined;

  return (
    <html lang="ko">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
