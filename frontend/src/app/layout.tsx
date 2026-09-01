import type { Metadata, Viewport } from "next";
import { Jua, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

/**
 * 타이포 시스템은 두 벌만 둔다.
 *  - sans (Noto Sans KR) : 본문·UI 전부. 시설명·주소처럼 정확히 읽혀야 하는 정보.
 *  - display (Jua)       : 워드마크와 큰 수치에만. 둥근 획이 아이콘의 파스텔
 *                          스퀘어클과 맞물려 캠페인의 인상을 만든다.
 *
 * 한글 폰트는 서브셋이 많아 `subsets` 를 지정하지 않고 `preload: false` 로
 * 받는다. 서브셋을 latin 으로 좁히면 한글 글리프가 빠져 시스템 폰트로 폴백된다.
 */
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  weight: ["400", "500", "700", "800"],
  display: "swap",
  preload: false,
});

const jua = Jua({
  variable: "--font-jua",
  weight: "400",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "위례 아이편한 지도",
  description:
    "위례동과 인접 생활권의 수유실, 경사로, 엘리베이터, 아이 동반 식당을 한눈에 확인하는 지도",
};

export const viewport: Viewport = {
  themeColor: "#f7f0e5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} ${jua.variable}`}>
      <body>{children}</body>
    </html>
  );
}
