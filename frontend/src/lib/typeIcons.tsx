import type { CSSProperties, ReactElement } from "react";
import Image from "next/image";
import type { IconType } from "react-icons";
import { MdDirectionsWalk, MdInfoOutline } from "react-icons/md";
import { PlaceType } from "@/data/places";

/**
 * 아이콘 세트.
 *
 * 그림은 `public/icons/*.png` 원본을 그대로 쓴다. 엘리베이터 하나만 벡터로
 * 다시 그렸다 — 원본의 주황이 경사로의 주황과 거의 같아 지도에서 두 시설이
 * 구분되지 않았기 때문이다. 형태는 원본 엘리베이터를 그대로 옮겼고 색만 옮겼다.
 *
 * **손으로 다시 그리지 말 것.** 원본 아트를 대신 그리려 하면 같은 그림이
 * 나오지 않는다. 새 아이콘이 필요하면 원본과 같은 손으로 그린 PNG 를 받아
 * `ICONS` 에 등록하는 쪽이 맞다.
 *
 * 시설이 아닌 자리(걷기 · 안내)에는 세 번째 종류가 있다 — react-icons 의
 * 글리프를 같은 타일에 얹은 것이다. 손으로 그린 원본이 없는 자리라 직접
 * 그리다 보면 획이 겉돌기 때문에(발자국 PNG 와 손으로 그린 원 안의 i 가 그랬다),
 * 완성된 아이콘 세트에서 가져다 쓴다. **타일은 그대로다** — 아래 규칙이 세
 * 종류 모두에 걸린다.
 *
 * **종류가 섞여도 한 세트로 보여야 한다.** 그래서 벡터 아이콘도 PNG 와
 * 같은 비율(세로가 긴 타일)과 같은 모서리 반경 비율(짧은 변의 24%)로 그린다.
 * 정사각형으로 그리면 필터 칩이나 범례처럼 나란히 놓이는 자리에서 혼자 튄다.
 *
 * 크기는 **높이 기준**이고 너비는 원본 비율로 계산한다. 정사각 박스에 억지로
 * 넣으면 둘 중 하나가 되기 때문이다.
 *   - width/height 를 같은 값으로 강제 → 그림이 18% 눌린다
 *   - object-fit: contain → 눌리지는 않지만 좌우에 빈 띠가 생겨 정렬이 흐트러진다
 *
 * 아이콘 타일의 배경색은 globals.css 의 `--type-*-bg` 토큰과 같은 값이며,
 * 마크업에 `data-type` 을 달면 자동으로 연결된다. 아이콘 위에 배경 타일을
 * 또 덧대지 말 것 — 아이콘 자체가 이미 타일이다.
 */

/** 원본 그림을 그대로 쓰는 아이콘 */
interface ImageSpec {
  kind: "image";
  src: string;
  /** 원본 픽셀 크기. 비율 계산에만 쓴다. 파일을 교체하면 함께 고칠 것. */
  w: number;
  h: number;
}

/** 벡터로 그린 아이콘. w×h 는 viewBox 이자 비율이다. */
interface SvgSpec {
  kind: "svg";
  w: number;
  h: number;
  tile: string;
  radius: number;
  body: string;
}

/**
 * react-icons 글리프를 우리 타일 위에 얹은 아이콘.
 *
 * `box` 는 40.2×48 타일 안에서 글리프가 차지할 정사각형 한 변이다(뷰박스 단위).
 * react-icons 는 24 단위 뷰박스로 그려져 있고 그림이 그 안을 꽉 채우지 않으므로,
 * 옆에 놓이는 손그림 글리프(엘리베이터 19×33)와 눈에 보이는 크기가 맞도록
 * 아이콘마다 따로 잡는다. 위치는 타일 정중앙이다.
 */
interface GlyphSpec {
  kind: "glyph";
  w: number;
  h: number;
  tile: string;
  radius: number;
  /** 글리프 색. react-icons 는 `fill="currentColor"` 라 `color` 로 물린다. */
  color: string;
  Glyph: IconType;
  box: number;
}

type IconSpec = ImageSpec | SvgSpec | GlyphSpec;

const ICONS = {
  nursing: { kind: "image", src: "/icons/nursing.png", w: 296, h: 350 },
  /* 식당 그림은 원본을 **좌우로 뒤집어** 둔 판이다(숟가락 왼쪽 · 포크 오른쪽).
     다시 그린 게 아니라 이미지 전체의 거울상이라 획과 색은 원본 그대로다 —
     포크·숟가락·하트가 저마다 좌우 대칭이라 뒤집어도 형태가 상하지 않는다.
     `public/icons/source/restaurant.png` 는 뒤집기 전 원본이다. 거기서 다시
     내보내면 이 뒤집기가 사라지므로 함께 되살릴 것(DESIGN.md §3 처리 목록). */
  restaurant: { kind: "image", src: "/icons/restaurant.png", w: 292, h: 350 },
  /* 브랜드 마크 — 큰 핀과 작은 핀.
     
     **이것만 타일이 없다.** 나머지는 전부 파스텔 타일 위의 그림이지만, 브랜드
     마크는 헤더 · 파비콘 · 인쇄물에 같은 형태로 가야 하므로 실루엣 자체가
     마크다. 그래서 `tile: "none"` 이고 비율도 정사각(48×48)이다 — 시설
     아이콘의 세로 타일(40.2×48)을 흉내 내면 오히려 그 세트의 일원처럼 보인다.
     
     **구멍은 색으로 칠하지 않고 뚫는다**(`fill-rule="evenodd"`). 배경색으로
     칠하면 크림 바탕에서만 맞고 흰 배경 · 어두운 탭에서 구멍이 메워진다.
     세 배경에서 같은 그림이 나오는 판을 골랐다.
     
     두 핀을 가르는 것은 **색 차이뿐이다.** 작은 핀 둘레에 배경색 테두리를 둘러
     떼어 놓은 판도 그려 봤지만, 어두운 배경에서 그 테두리가 윤곽선처럼 남아
     속 빈 핀으로 보였다. 겹치는 폭이 2 밖에 안 돼 테두리 없이도 갈라진다.
     
     의미는 시설이 아니라 **함께 가는 두 사람**이다 — 큰 핀이 어른, 작은 핀이
     아이. 이 지도가 한 사람을 위한 것이 아니라는 말을 형태가 한다. */
  brand: {
    kind: "svg",
    w: 48,
    h: 48,
    tile: "none",
    radius: 0,
    /* 그림의 실제 범위는 34×30.6 이라 48 뷰박스에 그대로 두면 44px 자리에서
       31px 짜리로 보인다. 여백을 1 만 남기고 박스를 채우도록 키운다.
       (k = 46/34, 세로는 가운데 정렬) */
    body: `
      <g transform="translate(-8.47 -6.17) scale(1.3529)">
      <path fill="var(--brand-ink)" fill-rule="evenodd" d="M18 7c-6 0-11 5-11 11 0 7.4 11 18 11 18s11-10.6 11-18c0-6-5-11-11-11zM18 22.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z"/>
      <path fill="var(--brand)" fill-rule="evenodd" d="M34 19c-3.9 0-7 3.1-7 7 0 4.7 7 11.6 7 11.6S41 30.7 41 26c0-3.9-3.1-7-7-7zM34 28.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z"/>
      </g>
    `,
  },

  /* 걷기 — 걸어가는 사람. 발자국 두 개를 찍은 PNG 였는데, 다른 아이콘이 전부
     '무엇이 있는가'(수유실 · 휠체어 · 문 · 식기)를 그리는 자리에서 발자국만
     '무엇이 지나갔는가'를 그리고 있었다. 바닥에 남은 자국이라 방향도 읽히지
     않아, 경로 카드에서는 걷는 중인지 걸었는지가 그림으로 구분되지 않았다.
     서 있는 사람으로 바꾼다 — 같은 자리에서 걷는 일 그 자체를 가리킨다. */
  walk: {
    kind: "glyph",
    w: 40.2,
    h: 48,
    tile: "var(--accent-soft)",
    radius: 9.6,
    color: "var(--accent-strong)",
    Glyph: MdDirectionsWalk,
    /* 그림이 24 뷰박스의 세로 21.5 만 쓴다. 엘리베이터 글리프(33)와 키를
       맞추려면 34 가 필요하다(34 × 21.5/24 ≈ 30). */
    box: 34,
  },

  /* 경사로 — 경사면 위의 휠체어. 원본 그림의 구성(머리·등·팔·좌석·다리·바퀴)을
     그대로 옮기되 획을 굵게 올렸다.

     굵은 획에서는 형태끼리 붙어 덩어리가 되기 쉬워, 세 간격을 못 박아 둔다.
       · 등을 길게(13.4→21.6) 잡는다. 짧으면 머리만 큰 사람처럼 보인다.
       · 팔 바(16.6)와 좌석(21.6) 사이 1.6 — 붙으면 몸통이 통짜 블록이 된다
       · 머리 아래(11.9)와 등 위는 반대로 겹쳐 둔다 — 띄우면 머리가 따로 떠서
         사탕처럼 보인다
       · 바퀴 아래는 쐐기 윗면에 살짝 얹는다. 쐐기가 높으면 링이 파묻힌다.
     좌석선이 바퀴 링의 위쪽을 지나는 건 원본과 같은 구성이다. 링 안쪽 구멍만
     열려 있으면 20px 에서도 '바퀴'로 읽힌다. */
  ramp: {
    kind: "svg",
    w: 40.2,
    h: 48,
    tile: "var(--type-ramp-bg)",
    radius: 9.6,
    body: `
      <path d="M4.6 40.2H35.8V33Z" fill="var(--type-ramp-glyph)" stroke="var(--type-ramp-glyph)" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="19" cy="8.4" r="3.5" fill="var(--type-ramp-glyph)"/>
      <g fill="none" stroke="var(--type-ramp-glyph)" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18.4 13.4 16.2 21.6" stroke-width="3.6"/>
        <path d="M17.6 16.6H24" stroke-width="3.2"/>
        <path d="M16.2 21.6H24.8" stroke-width="3.6"/>
        <path d="M24.8 21.6 28.8 26.6" stroke-width="3.6"/>
        <circle cx="17.2" cy="28.6" r="6" stroke-width="3.2"/>
      </g>
    `,
  },

  /* 안내 — 원 안의 i. 푸터 안내문에는 발자국(walk)을 달고 있었는데, 그 문단은
     걷기가 아니라 데이터 출처·마커 정확도·운영 여부 고지다. 도보 소요시간
     한 문장 때문에 발자국을 붙였지만 나머지 두 문장은 걷기와 무관해, 아이콘이
     문단을 잘못 소개하고 있었다. 발자국은 실제로 걷는 자리 — 지도의 길찾기
     확인·결과 카드와 위치 허용 안내 — 에만 남긴다.

     손으로 그리던 것을 완성된 글리프로 바꿨다. 점(r 1.9)과 기둥 사이가 3.3 밖에
     안 떨어져 30px 에서는 둘이 붙어 느낌표처럼 읽혔고, 원과 획의 굵기 비율도
     옆의 손그림들과 어긋나 있었다.

     색은 시설 타입 넷 중 어느 것도 아니어야 한다. 안내문은 특정 시설의 말이
     아니기 때문이다. 그래서 강조색 계열(accent-soft 타일 · accent-strong 글리프,
     4.9:1)을 쓴다. 타일은 40.2×48 — 다른 아이콘과 같은 세로 비율이다. */
  notice: {
    kind: "glyph",
    w: 40.2,
    h: 48,
    tile: "var(--accent-soft)",
    radius: 9.6,
    color: "var(--accent-strong)",
    Glyph: MdInfoOutline,
    /* 원이 24 뷰박스의 20 을 채운다. 전에 쓰던 원(지름 23.2)과 같은 크기로
       두려면 28 이다(28 × 20/24 ≈ 23.3). */
    box: 28,
  },

  /* 엘리베이터 — 문 두 짝과 위아래 화살표. 원본 그림의 구성을 그대로 옮겼다.
     타일은 40.2×48 — 원본 PNG 들과 같은 세로 비율(≈0.84)이다. */
  elevator: {
    kind: "svg",
    w: 40.2,
    h: 48,
    tile: "var(--type-elevator-bg)",
    radius: 9.6,
    body: `
      <rect x="10.6" y="16" width="19" height="18" rx="4.2" fill="none" stroke="var(--type-elevator-glyph)" stroke-width="2.8"/>
      <rect x="14.7" y="19.6" width="4.4" height="10.8" rx="1.3" fill="var(--type-elevator-glyph)"/>
      <rect x="21.1" y="19.6" width="4.4" height="10.8" rx="1.3" fill="var(--type-elevator-glyph)"/>
      <g fill="none" stroke="var(--type-elevator-glyph)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 11.4 20.1 8.3l3.1 3.1"/>
        <path d="M17 38.6 20.1 41.7l3.1-3.1"/>
      </g>
    `,
  },
} as const satisfies Record<string, IconSpec>;

export type IconName = keyof typeof ICONS;

export const typeIconName: Record<PlaceType, IconName> = {
  nursing: "nursing",
  ramp: "ramp",
  elevator: "elevator",
  restaurant: "restaurant",
};

/** 주어진 높이에 맞는, 원본 비율 그대로의 크기 */
function boxFor(name: IconName, height: number) {
  const spec: IconSpec = ICONS[name];
  return { width: Math.round((height * spec.w) / spec.h), height };
}

function svgInner(spec: SvgSpec) {
  return `<rect width="${spec.w}" height="${spec.h}" rx="${spec.radius}" fill="${spec.tile}"/>${spec.body}`;
}

/**
 * 아이콘 크기 스케일. **높이** 기준이다. 픽셀 크기는 여기서만 정하고,
 * CSS 는 배치(그리드 위치·정렬·여백)만 맡는다 — 양쪽에 크기를 적어 두면
 * 반드시 어긋난다.
 *
 *   sm 20 · 필터 칩, 지도 범례
 *   md 30 · 지도 마커, 안내문
 *   lg 44 · 목록 카드, 팝업, 헤더 브랜드 마크
 *   xl 56 · 경로 안내 카드, 빈 상태
 *
 * 20px 아래로는 이 타일 아이콘을 쓰지 않는다. 파스텔 타일이 뭉개져 색 얼룩으로만
 * 보이기 때문에, 그보다 작은 자리에는 선으로 그린 `RouteGlyph` 를 쓴다.
 */
export const iconSize = {
  sm: 20,
  md: 30,
  lg: 44,
  xl: 56,
} as const;

/**
 * Leaflet 마커·팝업처럼 React 밖에서 HTML 문자열이 필요한 곳에 쓴다.
 * Leaflet 은 자기 타일을 호스트 페이지의 CSS 리셋으로부터 지키려고
 * 컨테이너 안 그래픽의 크기를 건드린다. 인라인 `!important` 로 이긴다.
 */
export function iconMarkup(name: IconName, height: number, className = "") {
  const spec: IconSpec = ICONS[name];
  const box = boxFor(name, height);
  const cls = className ? ` class="${className}"` : "";
  const size = `width:${box.width}px!important;height:${box.height}px!important;display:block;flex:none`;

  if (spec.kind === "svg") {
    return `<svg viewBox="0 0 ${spec.w} ${spec.h}" fill="none" aria-hidden="true"${cls} style="${size}">${svgInner(spec)}</svg>`;
  }
  // react-icons 글리프는 React 컴포넌트라 문자열로 펴낼 수 없다. 여기 오는
  // 이름은 지금 시설 타입 넷뿐이고 그중에 글리프 아이콘은 없다 — 새로 만든
  // 아이콘을 Leaflet 마커·팝업에도 쓰려면 `svg` 종류로 옮겨 그려야 한다.
  if (spec.kind === "glyph") {
    throw new Error(`iconMarkup: "${name}" 은 react-icons 글리프라 문자열 HTML 로 만들 수 없다`);
  }
  return `<img src="${spec.src}" alt="" width="${box.width}" height="${box.height}"${cls} style="${size}" />`;
}

export interface IconProps {
  /** 아이콘 높이(px). 너비는 원본 비율로 계산된다. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

export type IconComponent = (props: IconProps) => ReactElement;

function makeIcon(name: IconName): IconComponent {
  const spec: IconSpec = ICONS[name];

  function Icon({ size = iconSize.sm, style, className, alt = "" }: IconProps) {
    const box = boxFor(name, size);
    const base: CSSProperties = { display: "block", flex: "none", ...style };

    if (spec.kind === "svg") {
      return (
        <svg
          viewBox={`0 0 ${spec.w} ${spec.h}`}
          width={box.width}
          height={box.height}
          fill="none"
          aria-hidden
          focusable="false"
          className={className}
          style={base}
          dangerouslySetInnerHTML={{ __html: svgInner(spec) }}
        />
      );
    }

    if (spec.kind === "glyph") {
      const { Glyph } = spec;
      return (
        <svg
          viewBox={`0 0 ${spec.w} ${spec.h}`}
          width={box.width}
          height={box.height}
          fill="none"
          aria-hidden
          focusable="false"
          className={className}
          style={base}
        >
          <rect width={spec.w} height={spec.h} rx={spec.radius} fill={spec.tile} />
          {/* 안쪽 `<svg>` 로 들어간다. `size` 가 곧 한 변이고, 24 단위 뷰박스가
              그 안으로 맞춰지므로 우리 좌표계로 그대로 환산된다. */}
          <Glyph
            x={(spec.w - spec.box) / 2}
            y={(spec.h - spec.box) / 2}
            size={spec.box}
            color={spec.color}
          />
        </svg>
      );
    }
    return (
      <Image
        src={spec.src}
        alt={alt}
        width={box.width}
        height={box.height}
        className={className}
        style={base}
      />
    );
  }
  return Icon;
}

export const typeIcons: Record<PlaceType, IconComponent> = {
  nursing: makeIcon("nursing"),
  ramp: makeIcon("ramp"),
  elevator: makeIcon("elevator"),
  restaurant: makeIcon("restaurant"),
};

export const BrandIcon: IconComponent = makeIcon("brand");
export const WalkIcon: IconComponent = makeIcon("walk");
export const NoticeIcon: IconComponent = makeIcon("notice");

/**
 * 길찾기 버튼처럼 글자 옆에 붙는 작은 자리를 위한 선 글리프. 타일이 없으므로
 * 14px 에서도 뭉개지지 않고, `currentColor` 를 따라 버튼의 상태 색을 물려받는다.
 */
export function RouteGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
      aria-hidden
      focusable="false"
    >
      <path d="M21 3 3 10.5l7.5 3 3 7.5L21 3Z" />
    </svg>
  );
}
