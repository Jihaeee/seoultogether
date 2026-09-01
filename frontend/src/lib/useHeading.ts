"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 내가 보고 있는 방향 — 나침반.
 *
 * 지도의 점이 "여기 있다"까지만 말하면, 길을 나설 때 남는 물음이 하나 있다:
 * **어느 쪽으로 서 있는가.** 유모차를 돌려 세워 가며 지도와 눈앞을 맞춰 보는
 * 그 몇 초를 없애는 것이 이 부채꼴이 하는 일이다.
 *
 * ## 위치와는 다른 센서다
 *
 * 위치는 GPS, 방향은 자력계(나침반)다. 그래서 되는 조건도 따로 논다.
 *
 * - **iOS 13+ 는 따로 허락을 받아야 한다.** `DeviceOrientationEvent.requestPermission()`
 *   은 **사용자 제스처 안에서만** 부를 수 있다(버튼 클릭 핸들러 안). 그래서 이
 *   훅은 스스로 묻지 않고 `request()` 를 밖으로 내보낸다 — 길찾기 확인 버튼과
 *   '내 위치' 버튼이 부른다.
 * - **HTTPS 가 아니면 이벤트가 오지 않는다.** `localhost` 는 예외라 개발 중에는
 *   되지만, 폰에서 `http://192.168.…` 로 열면 방향만 조용히 없다. 그때는
 *   부채꼴이 뜨지 않을 뿐 나머지는 그대로 돈다.
 * - **자력계가 없는 기기(데스크톱 대부분)에는 없다.** 그 경우 GPS 가 주는
 *   진행 방향(`coords.heading`)이 대신 쓰이는데, 그건 *걷고 있을 때만* 나온다.
 *
 * 그래서 이 값은 **없을 수 있는 정보**로 다룬다. 없으면 부채꼴을 그리지 않고,
 * 없다고 안내하지도 않는다 — 방향은 있으면 편한 것이지 없으면 못 걷는 것이
 * 아니다.
 *
 * ## 각도를 이어 붙여 내보내는 이유
 *
 * 나침반은 0~360 을 돈다. 그대로 CSS 회전에 넣으면 359° 에서 1° 로 갈 때
 * 화살표가 **한 바퀴를 거꾸로 돈다.** 그래서 여기서 이어 붙인 각도를
 * 내보낸다(370°, -20° 같은 값이 나온다). 받는 쪽은 그대로 `rotate()` 에
 * 넣으면 되고, 전환 애니메이션이 저절로 짧은 쪽으로 돈다.
 */

/** iOS 만 갖는 필드들. 표준 타입에 없어 여기서 얹는다. */
type CompassEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type PermissionCapableEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/**
 * 이만큼 돌지 않은 갱신은 버린다.
 *
 * 자력계는 가만히 들고 있어도 1~2° 씩 떨린다. 그대로 받으면 부채꼴이 제자리에서
 * 떨고, 갱신마다 리렌더가 돈다. 3° 는 부채꼴 폭(70°)의 4% 라 눈에 띄지 않는다.
 */
const MIN_TURN_DEG = 3;

export interface Heading {
  /**
   * 이어 붙인 각도(도, 시계방향·북이 0). 모르면 `null`.
   * 값의 절대 크기는 뜻이 없다 — 360 을 넘거나 음수일 수 있다. 위 주석 참고.
   */
  deg: number | null;
  /** 이 기기가 허락을 물어야 하는가(iOS). 물을 필요가 없으면 false. */
  needsPermission: boolean;
  /** **사용자 제스처 안에서** 부를 것. 허락을 받았으면 true. */
  request: () => Promise<boolean>;
  /** 센서를 문다. 되돌리는 함수로 놓는다 — 길찾기 중에만 켠다. */
  watch: () => () => void;
}

/**
 * 이벤트에서 나침반 각도를 뽑는다.
 *
 * iOS 는 `webkitCompassHeading` 에 **이미 진북 기준 시계방향** 값을 준다.
 * 그 밖의 기기는 `alpha`(반시계방향)를 주므로 뒤집고, 화면이 가로로 돌아가
 * 있으면 그만큼 되돌린다. 기기를 세워 들면 오차가 커지지만, 지도를 보는
 * 자세는 대체로 눕혀 드는 쪽이다.
 */
function headingOf(event: DeviceOrientationEvent): number | null {
  const compass = (event as CompassEvent).webkitCompassHeading;
  if (typeof compass === "number" && Number.isFinite(compass)) return compass;

  // `absolute` 가 아닌 alpha 는 기기를 켠 자리를 0 으로 잡은 상대 각도다.
  // 그걸 방위로 쓰면 엉뚱한 곳을 가리키므로 아예 쓰지 않는다.
  if (!event.absolute || typeof event.alpha !== "number") return null;
  const screenAngle = typeof screen !== "undefined" ? (screen.orientation?.angle ?? 0) : 0;
  return (360 - event.alpha + screenAngle + 360) % 360;
}

export function useHeading(): Heading {
  const [deg, setDeg] = useState<number | null>(null);

  /** 마지막으로 받은 원래 각도(0~360). 회전량을 재는 기준. */
  const rawRef = useRef<number | null>(null);
  /** 이어 붙인 각도. 상태보다 먼저 갱신된다. */
  const continuousRef = useRef(0);
  /** 켜 둔 곳의 수. 0 이 되는 순간에만 실제로 놓는다. */
  const watcherCountRef = useRef(0);
  const listeningRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const handle = useCallback((event: DeviceOrientationEvent) => {
    if (!aliveRef.current) return;
    const raw = headingOf(event);
    if (raw == null) return;

    const last = rawRef.current;
    if (last == null) {
      rawRef.current = raw;
      continuousRef.current = raw;
      setDeg(raw);
      return;
    }

    // 짧은 쪽 회전량. (+540)%360-180 이 -180~180 으로 접어 준다.
    const turn = ((raw - last + 540) % 360) - 180;
    if (Math.abs(turn) < MIN_TURN_DEG) return;
    rawRef.current = raw;
    continuousRef.current += turn;
    setDeg(continuousRef.current);
  }, []);

  const needsPermission =
    typeof window !== "undefined" &&
    typeof (DeviceOrientationEvent as PermissionCapableEvent | undefined)?.requestPermission ===
      "function";

  const request = useCallback(async (): Promise<boolean> => {
    const ask = (DeviceOrientationEvent as PermissionCapableEvent | undefined)?.requestPermission;
    if (typeof ask !== "function") return true; // 물을 필요가 없는 기기
    try {
      return (await ask()) === "granted";
    } catch {
      // 제스처 밖에서 불렀거나 사용자가 닫았다. 방향만 없이 그대로 간다.
      return false;
    }
  }, []);

  const watch = useCallback((): (() => void) => {
    if (typeof window === "undefined") return () => {};

    watcherCountRef.current += 1;
    if (!listeningRef.current) {
      // `deviceorientationabsolute` 가 있으면 그쪽이다 — 안드로이드는 이 이벤트만
      // 진북 기준 alpha 를 준다. iOS 에는 이 이벤트가 없고, 대신 일반
      // `deviceorientation` 에 `webkitCompassHeading` 이 실려 온다.
      const type = "ondeviceorientationabsolute" in window
        ? "deviceorientationabsolute"
        : "deviceorientation";
      window.addEventListener(type, handle as EventListener);
      listeningRef.current = () => window.removeEventListener(type, handle as EventListener);
    }

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      watcherCountRef.current -= 1;
      if (watcherCountRef.current > 0) return;
      listeningRef.current?.();
      listeningRef.current = null;
      // 놓는 순간 각도를 지운다. 마지막으로 본 방향을 계속 그려 두면, 그새
      // 돌아선 사람에게 지도가 틀린 방향을 자신 있게 가리키게 된다.
      rawRef.current = null;
      if (aliveRef.current) setDeg(null);
    };
  }, [handle]);

  useEffect(
    () => () => {
      listeningRef.current?.();
      listeningRef.current = null;
      watcherCountRef.current = 0;
    },
    []
  );

  return { deg, needsPermission, request, watch };
}
