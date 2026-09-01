import type { LatLng } from "./geo";

/**
 * 도보 경로 — 유모차 기준.
 *
 * ## 왜 OSRM 을 떠났나
 *
 * 이전에는 `routing.openstreetmap.de/routed-foot`(OSRM) 을 썼다. 진짜 보행
 * 프로파일이라 속도는 맞았지만(4.5km/h) 두 가지가 안 됐다.
 *
 *  1. **계단을 피하지 못한다.** OSRM 표준 foot 프로파일은 `highway=steps` 를
 *     걸을 수 있는 길로 본다. 유모차에게는 못 가는 길이다.
 *  2. **계단이 있는지 알려주지도 않는다.** 응답의 구간 정보에 길 종류가 실려
 *     오지 않아(`mode` 는 전부 `"walking"`), 경고를 띄우려 해도 어느 경로에
 *     계단이 있는지 판정할 수 없었다. 그래서 조건 없이 "계단이 포함될 수
 *     있어요" 를 항상 띄우고 있었다.
 *
 * Valhalla 의 보행 costing 에는 `type: "wheelchair"` 가 있다. 계단을 아예
 * 배제하고 급경사에 벌점을 준다. 같은 FOSSGIS 가 공개 인스턴스를 돌리고
 * `Access-Control-Allow-Origin: *` 를 주므로 브라우저에서 바로 부를 수 있다.
 *
 * ## 휠체어 프로파일을 유모차에 쓰는 것에 대해
 *
 * 정확히 같지는 않다. 휠체어 기준은 유모차가 넘을 수 있는 턱도 피하므로 가끔
 * 돌아간다. 반대로 **유모차에만 있는 제약(문 폭, 회전 반경)은 모른다.**
 * 그래도 "계단을 밟지 않는다"는 한 가지가 이 서비스에서 가장 중요하고, 그건
 * 이 프로파일이 지켜 준다.
 *
 * ## 이 함수가 보장하지 못하는 것
 *
 * **"계단 없음"이 아니라 "지도에 등록된 계단을 밟지 않음"이다.** 조사 구역
 * (거여·마천·장지·복정·위례)에 `highway=steps` 가 162개 태깅되어 있어 근거가
 * 빈 것은 아니지만, 태깅되지 않은 계단은 여전히 경로에 들어온다. 화면 문구를
 * "계단 없는 경로"가 아니라 "계단을 피한 경로"로 적는 이유다.
 */

const VALHALLA = "https://valhalla1.openstreetmap.de/route";

/**
 * 유모차를 밀 때의 보행 속도(km/h).
 *
 * Valhalla 기본값은 성인 혼자 걷는 5.1km/h 다. 그 값으로는 2.5km 를 33분이라고
 * 안내하는데, 유모차로는 43분쯤 걸린다. 10분 차이는 아이를 데리고 나선 사람에게
 * 그냥 오차가 아니다. 원격 기본값에 맡기지 않고 여기서 못 박는다.
 */
const STROLLER_SPEED_KMH = 3.5;

/**
 * 길 안내 한 단계. "위례광장로2길에서 좌회전" 처럼 사람이 읽는 문장이다.
 *
 * 선만 그려 놓으면 전체 모양은 보여도 **어디서 꺾는지**를 알 수 없다.
 * 유모차를 밀면서 화면을 크게 볼 수 없는 사람에게는 선보다 이 목록이 지도다.
 */
export interface WalkStep {
  text: string;
  distanceM: number;
  /** 이 단계가 시작되는 좌표. 목록에서 누르면 지도를 여기로 옮긴다. */
  point: [number, number];
}

export interface WalkRoute {
  /** 지도에 그릴 좌표열. `[위도, 경도]` — Leaflet 순서 그대로. */
  points: [number, number][];
  steps: WalkStep[];
  durationMin: number;
  distanceM: number;
  /** 계단을 배제한 프로파일로 뽑은 경로인가. 화면 문구가 이 값으로 갈린다. */
  avoidsStairs: boolean;
}

/** 경로 요청이 실패한 이유. 사용자가 할 수 있는 일이 서로 다르다. */
export type RouteFetchFailure =
  /** 계단을 피해서는 갈 길이 없다. 일반 도보로 물러설지 물어봐야 한다. */
  | "noroute"
  /**
   * 라우터가 거리를 이유로 거절했다(`error_code 154`, 보행 상한 200km).
   *
   * 예전에는 5km 짜리 자체 상한을 두고 그 위를 여기서 막았다. 걸어서 갈 만한
   * 거리가 아닌 곳에 경로를 그려 주면 강 위를 걸으라는 안내처럼 보인다는
   * 이유였는데, 멀어도 일단 길이 보이는 편이 낫다는 판단으로 걷어냈다. 이제
   * 거리 판단은 결과 카드의 소요시간이 대신한다 — 5시간 45분이라고 적혀
   * 있으면 걸어갈 거리가 아니라는 것은 사용자가 안다.
   *
   * 다시 눌러도 같은 답이라 재시도 버튼을 주지 않는다.
   */
  | "toofar"
  /** 시한 초과. 서버가 느린 것이니 기다렸다 다시. */
  | "timeout"
  /** 그 밖의 통신 실패. 내 인터넷을 봐야 한다. */
  | "network";

export class RouteFetchError extends Error {
  constructor(readonly reason: RouteFetchFailure) {
    super(reason);
    this.name = "RouteFetchError";
  }
}

/**
 * Valhalla 가 돌려주는 폴리라인(정밀도 1e6)을 좌표열로 푼다.
 *
 * `shape_format: "geojson"` 을 시도했지만 이 인스턴스는 무시하고 인코딩 문자열을
 * 그대로 준다. 디코더가 20줄이라 의존성을 하나 더 들이는 것보다 낫다.
 * 구글 폴리라인과 같은 알고리즘이고 나누는 값만 1e5 → 1e6 으로 다르다.
 */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / factor, lng / factor]);
  }
  return points;
}

/**
 * 이보다 짧은 구간의 안내는 앞 단계에 합친다.
 *
 * 위례중앙광장→거여역 2.5km 에 안내가 28단계로 오는데, 그중 13개가 25m 미만
 * 이다. "보도에서 우회전 4m" 같은 것은 길 안내가 아니라 **보도 폴리라인이
 * 꺾인 지점**이다 — 우리나라 OSM 은 보도가 잘게 쪼개져 있어 모퉁이마다
 * 안내가 하나씩 생긴다. 그대로 늘어놓으면 진짜 갈림길이 잡음에 묻힌다.
 *
 * 합쳐도 길을 잃지 않는 이유는 지도에 선이 함께 그려져 있기 때문이다. 4m 짜리
 * 꺾임은 선을 따라가면 저절로 지나간다. 대신 **첫 단계와 도착 단계는 길이와
 * 무관하게 남긴다** — 어디서 출발하고 어디서 끝나는지는 지울 수 없다.
 */
const MIN_STEP_DISTANCE_M = 20;

/**
 * 안내 문장 다듬기.
 *
 * 이 인스턴스의 ko-KR 번역에 "급좌회전회전 하여" 처럼 '회전' 이 겹쳐 나오는
 * 자리가 있다. 우리 쪽 버그는 아니지만 화면에 그대로 나가면 앱이 고장 난
 * 것처럼 보인다. 눈에 띄는 중복만 걷어내고 문장 자체는 건드리지 않는다.
 */
function tidyInstruction(text: string): string {
  return text.replace(/회전회전/g, "회전").replace(/\s+/g, " ").trim();
}

function condenseSteps(steps: WalkStep[]): WalkStep[] {
  if (steps.length <= 2) return steps;
  const out: WalkStep[] = [];
  steps.forEach((step, i) => {
    const prev = out[out.length - 1];
    const isLast = i === steps.length - 1;
    if (prev && !isLast && step.distanceM < MIN_STEP_DISTANCE_M) {
      // 합쳐진 거리는 앞 단계로 넘긴다. 거리 합이 총 거리와 어긋나면
      // "다 걸었는데 아직 남았다" 가 된다.
      prev.distanceM += step.distanceM;
      return;
    }
    out.push({ ...step });
  });
  return out;
}

interface ValhallaManeuver {
  instruction?: string;
  /** km */
  length?: number;
  /** 이 단계가 시작되는 지점의 `shape` 인덱스 */
  begin_shape_index?: number;
}

interface ValhallaLeg {
  shape: string;
  maneuvers?: ValhallaManeuver[];
}

interface ValhallaResponse {
  trip?: {
    summary: { length: number; time: number };
    legs: ValhallaLeg[];
  };
  error_code?: number;
  error?: string;
}

/**
 * Valhalla 오류 코드 → 우리 실패 사유. 전부 HTTP 400 으로 오므로 상태 코드만
 * 보고 통신 실패로 넘기면, "계단 없는 길이 없다"는 사실이 "인터넷을 확인
 * 하세요" 로 둔갑한다.
 */
const ERROR_CODE_REASON: Record<number, RouteFetchFailure> = {
  154: "toofar", // Path distance exceeds the max distance limit
  442: "noroute", // No path could be found for input
  443: "noroute", // Exact route match algorithm failed
  444: "noroute", // Route match algorithm failed
};

export interface WalkRouteOptions {
  /** false 면 계단을 허용하는 일반 보행 경로. 회피 경로가 없을 때의 후퇴로. */
  avoidStairs?: boolean;
  signal?: AbortSignal;
}

export async function fetchWalkRoute(
  from: LatLng,
  to: LatLng,
  { avoidStairs = true, signal }: WalkRouteOptions = {}
): Promise<WalkRoute> {
  const body = {
    locations: [
      { lat: from.lat, lon: from.lng },
      { lat: to.lat, lon: to.lng },
    ],
    costing: "pedestrian",
    costing_options: {
      pedestrian: {
        // wheelchair 는 계단을 배제하고 급경사에 벌점을 준다.
        type: avoidStairs ? "wheelchair" : "foot",
        walking_speed: STROLLER_SPEED_KMH,
      },
    },
    // 안내 문장은 한국어로 받는다. 이 인스턴스는 `ko-KR` 을 지원해서
    // "위례광장로2길에서 좌회전" 같은 문장이 그대로 온다 — 우리가 방향 코드를
    // 한국어로 옮길 필요가 없다.
    directions_options: { units: "kilometers", language: "ko-KR" },
  };

  let res: Response;
  try {
    res = await fetch(`${VALHALLA}?json=${encodeURIComponent(JSON.stringify(body))}`, {
      signal,
    });
  } catch (err) {
    throw new RouteFetchError(
      err instanceof DOMException && err.name === "AbortError" ? "timeout" : "network"
    );
  }

  let data: ValhallaResponse;
  try {
    data = (await res.json()) as ValhallaResponse;
  } catch {
    throw new RouteFetchError("network");
  }

  if (data.error_code != null) {
    throw new RouteFetchError(ERROR_CODE_REASON[data.error_code] ?? "network");
  }
  const trip = data.trip;
  if (!res.ok || !trip?.legs?.length) throw new RouteFetchError("network");

  // 구간(leg)마다 shape 를 풀어 이어 붙이고, 안내의 `begin_shape_index` 는
  // 그 구간 안에서의 번호이므로 앞 구간들의 길이만큼 밀어 준다. 목적지가
  // 하나뿐인 지금은 구간도 하나지만, 경유지가 생기면 여기서 어긋난다.
  const points: [number, number][] = [];
  const steps: WalkStep[] = [];

  for (const leg of trip.legs) {
    const offset = points.length;
    const legPoints = decodePolyline(leg.shape);
    points.push(...legPoints);

    for (const m of leg.maneuvers ?? []) {
      const text = m.instruction ? tidyInstruction(m.instruction) : "";
      if (!text) continue;
      const point = points[offset + (m.begin_shape_index ?? 0)] ?? legPoints[0];
      if (!point) continue;
      steps.push({ text, distanceM: Math.round((m.length ?? 0) * 1000), point });
    }
  }

  if (!points.length) throw new RouteFetchError("noroute");

  return {
    points,
    steps: condenseSteps(steps),
    distanceM: Math.round(trip.summary.length * 1000),
    durationMin: Math.round(trip.summary.time / 60),
    avoidsStairs: avoidStairs,
  };
}
