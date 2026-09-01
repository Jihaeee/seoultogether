import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 정적 내보내기.
   *
   * 이 앱은 서버에서 할 일이 없다 — 라우트 핸들러도 미들웨어도 없고, 장소
   * 데이터는 `src/data/places.ts` 에 박혀 있으며 지도·위치·경로는 전부
   * 브라우저에서 돈다. 서버 런타임을 띄우면 얻는 것 없이 Netlify 의 Next
   * 런타임이 이 Next 버전을 지원하는지에 배포가 묶인다.
   *
   * `out/` 에 정적 파일만 떨어뜨리면 그 의존이 사라진다. 서버 기능(로그인,
   * DB 조회, 라우트 핸들러)을 넣게 되면 이 줄을 지우고 Netlify Next 런타임으로
   * 갈아타야 한다.
   */
  output: "export",

  images: {
    /**
     * `next/image` 의 최적화는 서버가 있어야 돈다. 정적 내보내기에서는 켜 둔
     * 채로 빌드가 실패한다. 여기서 쓰는 이미지는 전부 로컬 아이콘 PNG 라
     * 최적화를 꺼도 잃는 게 없다.
     */
    unoptimized: true,
  },
};

export default nextConfig;
