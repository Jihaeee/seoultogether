"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { distanceM } from "./geo";
import type { LatLng } from "./geo";

/**
 * 내 위치 — 앱 전체의 단일 출처.
 *
 * 이전에는 길찾기를 누른 순간에만, 목적지 하나당 한 번씩 위치를 물었다.
 * 그래서 (1) 지도를 열어도 내가 어디 있는지 알 수 없었고 (2) 목록을 거리로
 * 정렬할 수 없었으며 (3) 목적지를 바꿀 때마다 권한 카드가 다시 떴다.
 *
 * 위치는 부가 기능이 아니라 **모든 화면의 기준점**이므로 훅 하나가 들고 있고,
 * 목록 정렬·지도 중심·길찾기가 전부 여기서 가져다 쓴다.
 *
 * `watchPosition` 은 **길찾기가 열려 있는 동안에만** 켠다. 유모차를 밀며 여는
 * 화면이라 배터리가 곧 기능이라서, 계속 켜 두지 않고 실제로 걷고 있는 구간
 * — 경로 카드가 떠 있는 동안 — 에만 쓴다. 그 밖에는 "내 위치" 버튼을 누를
 * 때만 잰다.
 *
 * 그래서 좌표를 두 가지로 나눠 내보낸다.
 *
 *   coords     목록 정렬과 카드의 거리 표시가 쓰는 **기준점**. 버튼으로 잴
 *              때만 바뀐다. 걷는 동안 이것까지 따라 움직이면 목록 순서가
 *              계속 뒤집혀, 누르려던 카드가 손가락 밑에서 사라진다.
 *   liveCoords 지도에 찍는 **지금 위치**. 추적 중에는 이쪽만 갱신된다.
 *
 * 추적을 켜지 않은 동안 둘은 같은 값이다.
 */

export interface UserCoords extends LatLng {
  /** 반경 오차(m). 브라우저가 주는 값. */
  accuracy: number;
  /**
   * GPS 가 본 진행 방향(도, 북이 0). **걷고 있을 때만** 나오고 서 있으면 null
   * 이다. 나침반(`useHeading`)이 없는 기기의 대비책이라 여기에만 담아 둔다.
   */
  heading?: number | null;
}

export type LocationStatus =
  /** 아직 묻지 않았다. 지도 위 배너로 권유한다. */
  | "idle"
  | "locating"
  | "ready"
  /** 사용자가 거부했다. 브라우저 설정에서만 되돌릴 수 있다. */
  | "denied"
  /** 지원하지 않거나 측위에 실패했다. 다시 눌러 볼 수 있다. */
  | "unavailable";

/**
 * 측위 한 번의 결과.
 *
 * 실패 사유를 값으로 돌려준다. 부르는 쪽이 `await` 뒤에 `status` 를 다시
 * 읽어 판단하면 안 된다 — 프라미스가 풀리는 마이크로태스크가 React 의
 * 리렌더보다 먼저라, 그 자리에서 읽는 `status` 는 아직 이전 값이다.
 */
export type LocateResult =
  | { ok: true; coords: UserCoords }
  | { ok: false; reason: "denied" | "unavailable" };

export interface UserLocation {
  status: LocationStatus;
  /** 목록 정렬·거리 표시의 기준점. 버튼으로 잴 때만 바뀐다. */
  coords: UserCoords | null;
  /** 가장 최근 좌표. 추적 중에는 이쪽만 계속 갱신된다. */
  liveCoords: UserCoords | null;
  /** 좌표를 확보한다. 이미 있으면 다시 재지 않고 그대로 돌려준다. */
  request: () => Promise<LocateResult>;
  /** 좌표가 있어도 강제로 다시 잰다. */
  refresh: () => Promise<LocateResult>;
  /**
   * 연속 추적을 켠다. 되돌리는 함수를 부르면 끈다 — 이펙트에서 그대로
   * 돌려주면 된다. 여럿이 켜도 실제 `watchPosition` 은 하나만 돈다.
   */
  watch: () => () => void;
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  /** 1분 안에 잰 값이면 그대로 쓴다. 길찾기를 연달아 누를 때 매번 GPS를 깨우지 않는다. */
  maximumAge: 60_000,
};

/**
 * 추적용 옵션. 한 번 재기와 달리 `maximumAge` 를 짧게 둔다 — 걷는 동안 1분
 * 묵은 좌표를 그대로 쓰면 점이 뒤에서 따라온다.
 */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 5_000,
};

/**
 * 이만큼 움직이지 않은 갱신은 버린다.
 *
 * GPS 는 가만히 서 있어도 몇 미터씩 흔들린다. 그대로 받으면 지도의 점이
 * 제자리에서 떨리고, 좌표가 바뀔 때마다 지도 레이어를 다시 그리게 된다.
 * 유모차 걸음(3.5km/h)으로 5m 는 약 5초라, 이보다 촘촘한 갱신은 정보가 아니다.
 */
const MIN_MOVE_M = 5;

/** 테스트 위치를 쓰는 동안의 빈 추적. 매번 새 함수를 만들지 않도록 밖에 둔다. */
function noWatch(): () => void {
  return () => {};
}

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
  });
}

export interface UseUserLocationOptions {
  /**
   * 지정하면 실제 측위 대신 이 좌표를 쓴다(`?loc=…` 테스트 위치).
   * 켜져 있는 동안 화면에 배지가 뜨므로, 조용히 가짜 위치로 도는 일은 없다.
   */
  override?: UserCoords | null;
}

export function useUserLocation({ override = null }: UseUserLocationOptions = {}): UserLocation {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<UserCoords | null>(null);
  const [liveCoords, setLiveCoords] = useState<UserCoords | null>(null);

  /** 켜 둔 곳의 수. 0 이 되는 순간에만 실제 추적을 끈다. */
  const watcherCountRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  /** 흔들림을 걸러내는 기준이 되는 마지막 좌표. 상태보다 먼저 갱신된다. */
  const lastLiveRef = useRef<UserCoords | null>(null);

  /** 진행 중인 측위. 길찾기 버튼과 배너를 겹쳐 눌러도 GPS 요청은 하나만 나간다. */
  const inFlightRef = useRef<Promise<LocateResult> | null>(null);
  /** 언마운트 후 setState 를 막는다. */
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const run = useCallback((): Promise<LocateResult> => {
    if (inFlightRef.current) return inFlightRef.current;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (aliveRef.current) setStatus("unavailable");
      return Promise.resolve({ ok: false, reason: "unavailable" });
    }

    if (aliveRef.current) setStatus("locating");

    const task = (async (): Promise<LocateResult> => {
      try {
        const pos = await locate();
        const next: UserCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
        };
        if (aliveRef.current) {
          setCoords(next);
          setLiveCoords(next);
          lastLiveRef.current = next;
          setStatus("ready");
        }
        return { ok: true, coords: next };
      } catch (err) {
        // 권한 거부와 측위 실패는 사용자가 할 수 있는 일이 다르다. 거부는
        // 브라우저 설정에서만 풀리고, 실패는 그냥 다시 누르면 된다. 둘을
        // 한 문구로 뭉개면 설정을 아무리 확인해도 안 고쳐지는 안내가 된다.
        const denied =
          typeof GeolocationPositionError !== "undefined" &&
          err instanceof GeolocationPositionError &&
          err.code === err.PERMISSION_DENIED;
        if (aliveRef.current) setStatus(denied ? "denied" : "unavailable");
        return { ok: false, reason: denied ? "denied" : "unavailable" };
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = task;
    return task;
  }, []);

  /**
   * 길찾기가 열려 있는 동안의 연속 추적.
   *
   * 권한을 아직 받지 않았다면 켜지 않는다 — `watchPosition` 도 권한창을 띄우는
   * 부수효과가 있어서, 확인 카드로 물어보기로 한 규칙이 여기서 깨진다.
   * 부르는 쪽(page.tsx)이 좌표를 확보한 뒤에만 켜지만, 훅 안에서도 막아 둔다.
   */
  const watch = useCallback((): (() => void) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return () => {};

    watcherCountRef.current += 1;
    if (watchIdRef.current === null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (!aliveRef.current) return;
          const next: UserCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            // 서 있으면 null 이고, 걸을 때만 값이 온다. 나침반이 없는 기기에서
            // 이것만이라도 있으면 방향을 그릴 수 있다.
            heading: pos.coords.heading,
          };
          // 제자리 흔들림은 버린다. 다만 오차가 눈에 띄게 좁아졌으면 받는다 —
          // 같은 자리라도 "200m 안 어딘가"에서 "10m 안"으로 바뀐 것은 정보다.
          const last = lastLiveRef.current;
          const settled =
            last != null &&
            distanceM(last, next) < MIN_MOVE_M &&
            next.accuracy > last.accuracy * 0.7;
          if (settled) return;
          lastLiveRef.current = next;
          setLiveCoords(next);
        },
        (err) => {
          // 걷는 도중 권한이 꺼질 수 있다(브라우저 설정·OS 위치 끄기). 그때는
          // 조용히 멈추지 말고 상태를 옮겨 둔다 — 화면의 안내가 달라져야 한다.
          if (!aliveRef.current) return;
          if (err.code === err.PERMISSION_DENIED) setStatus("denied");
        },
        WATCH_OPTIONS
      );
    }

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      watcherCountRef.current -= 1;
      if (watcherCountRef.current > 0 || watchIdRef.current === null) return;
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      // 끄면서 마지막 좌표를 기준점으로 올린다. 걷고 난 뒤에도 목록이 출발할
      // 때의 거리를 말하고 있으면 지도의 점과 목록이 서로 다른 곳을 가리킨다.
      // 순서가 바뀌는 것은 이 한 번뿐이고, 그것도 걷는 도중이 아니라 길찾기를
      // 닫는 순간이라 누르려던 카드가 손가락 밑에서 움직이지 않는다.
      const last = lastLiveRef.current;
      if (last && aliveRef.current) setCoords(last);
    };
  }, []);

  // 어떤 이유로든 화면을 떠나면 추적은 끝난다.
  useEffect(
    () => () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        watcherCountRef.current = 0;
      }
    },
    []
  );

  const request = useCallback((): Promise<LocateResult> => {
    if (coords) return Promise.resolve({ ok: true, coords });
    return run();
  }, [coords, run]);

  // 이미 허용해 둔 사용자에게는 아무것도 묻지 않고 바로 잡는다. 아직 정하지
  // 않았다면 여기서 네이티브 권한창을 띄우지 않는다 — 페이지를 열자마자 뜨는
  // 권한창은 내용을 보기도 전에 거부당하고, 한번 거부되면 되돌리기 어렵다.
  // 대신 지도 위 배너로 권유하고, 실제 요청은 사용자가 누를 때 나간다.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      // 테스트 위치를 쓰는 중이면 실제 측위를 건드리지 않는다. 권한창을 띄우는
      // 부수효과가 있어서, 결과를 안 쓸 거면 요청 자체를 하지 말아야 한다.
      if (override) return;
      if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
      try {
        const perm = await navigator.permissions.query({ name: "geolocation" });
        if (cancelled) return;

        const sync = () => {
          if (cancelled || !aliveRef.current) return;
          if (perm.state === "granted") void run();
          else if (perm.state === "denied") setStatus("denied");
        };

        sync();
        perm.addEventListener("change", sync);
        cleanup = () => perm.removeEventListener("change", sync);
      } catch {
        // Safari 는 geolocation 권한 조회를 지원하지 않는다. 배너 경로로 간다.
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [run, override]);

  const overrideResult = useCallback(
    async (): Promise<LocateResult> => ({ ok: true, coords: override! }),
    [override]
  );

  if (override) {
    return {
      status: "ready",
      coords: override,
      liveCoords: override,
      request: overrideResult,
      refresh: overrideResult,
      // 테스트 위치는 움직이지 않는다. 켜고 끄는 시늉만 한다.
      watch: noWatch,
    };
  }

  return { status, coords, liveCoords, request, refresh: run, watch };
}
