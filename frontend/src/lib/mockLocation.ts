"use client";

import { useMemo, useSyncExternalStore } from "react";
import { HOME_CENTER } from "./geo";
import type { UserCoords } from "./useUserLocation";

/**
 * URL 로 "내 위치"를 지정하는 테스트 장치.
 *
 * 이 서비스는 반경 5km 안에서만 도보 경로를 안내한다. 그 규칙 자체는 맞지만
 * (강북에서 누르면 20km · 5시간 45분짜리 경로가 한강 다리를 건넌다), 그러면
 * **위례에 가 있지 않은 사람은 길찾기를 한 번도 확인할 수 없다.** 만드는 쪽이
 * 자기 손으로 못 써 보는 기능은 결국 아무도 안 본 채로 배포된다.
 *
 * 크롬 개발자도구의 Sensors → Location 으로도 되지만 그건 데스크톱 전용이고,
 * 정작 이 화면이 쓰이는 자리는 손에 든 폰이다. URL 이면 폰에서도 열린다.
 *
 * ```
 * ?loc=위례                     → 위례중앙광장
 * ?loc=37.4931,127.1442        → 임의 좌표
 * ```
 *
 * **개발 환경으로 막지 않는다.** 캠페인 발표나 QA 처럼 배포된 주소로 보여 줘야
 * 하는 자리가 있고, 막아 두면 그때 또 우회로를 만들게 된다. 대신 이 위치가
 * 켜져 있는 동안에는 지도에 배지를 띄워 **실제 위치가 아님을 계속 알린다** —
 * 조용히 가짜 위치로 동작하는 것이 진짜 위험이다.
 */

/** 이름으로 부를 수 있는 자리. 좌표를 외우지 않아도 되게. */
const NAMED: Record<string, { lat: number; lng: number }> = {
  home: HOME_CENTER,
  위례: HOME_CENTER,
  wirye: HOME_CENTER,
};

/** 테스트 위치의 정확도(m). 오차 원이 그려지지 않도록 충분히 작게 둔다. */
const MOCK_ACCURACY_M = 10;

/**
 * 쿼리스트링에서 테스트 위치를 읽는다. 값이 없거나 형식이 틀리면 `null` —
 * 잘못 쓴 파라미터 때문에 화면이 깨지지는 않게 한다.
 */
export function readMockLocation(search: string): UserCoords | null {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get("loc");
  } catch {
    return null;
  }
  if (!raw) return null;

  const key = raw.trim().toLowerCase();
  const named = NAMED[key] ?? NAMED[raw.trim()];
  if (named) return { ...named, accuracy: MOCK_ACCURACY_M };

  const parts = raw.split(",");
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng, accuracy: MOCK_ACCURACY_M };
}

/* -- 쿼리스트링 구독 -------------------------------------------------------
   서버 렌더에는 쿼리스트링이 없다. 첫 렌더에서 곧바로 `window` 를 읽으면
   서버는 '테스트 위치 없음', 클라이언트는 '있음' 으로 그려 목록 순서가 어긋난다.
   `useSyncExternalStore` 는 서버 스냅샷과 클라이언트 스냅샷을 따로 받아
   이 어긋남을 React 가 알아서 처리한다. */

function subscribeToUrl(onChange: () => void) {
  // 뒤로가기로 `?loc=` 이 붙거나 빠질 수 있다.
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

const getSearch = () => window.location.search;
/** 서버에는 쿼리스트링이 없다 = 테스트 위치도 없다. */
const getServerSearch = () => "";

/** 현재 URL 의 테스트 위치. 없으면 `null`. */
export function useMockLocation(): UserCoords | null {
  const search = useSyncExternalStore(subscribeToUrl, getSearch, getServerSearch);
  return useMemo(() => readMockLocation(search), [search]);
}
