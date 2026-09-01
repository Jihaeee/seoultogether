/**
 * 거리 계산과 서비스 커버리지.
 *
 * 목록 정렬(`page.tsx`)과 지도의 첫 화면 판단(`MapView.tsx`)이 같은 기준을
 * 써야 해서 여기 모아 둔다. 둘이 각자 반경을 갖고 있으면, 목록은 "내 주변"을
 * 보여주는데 지도는 위례에 머무는 식으로 어긋난다.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * 첫 화면 기준점 — 위례중앙광장.
 *
 * 데이터 전체(거여·마천·장지·복정·문정·하남)에 맞추면 4.8×2.9km 가 잡혀
 * 위례가 여러 동네 중 하나로 묻힌다. 이 지도를 여는 사람은 위례에 있으므로
 * 자기 동네가 화면 가운데 크게 보이는 편이 낫다.
 */
export const HOME_CENTER: LatLng = { lat: 37.4745, lng: 127.1435 };
export const HOME_ZOOM = 15;

/**
 * 이 반경 밖에서 열면 내 위치로 화면을 옮기지 않는다.
 *
 * 시설이 한 곳도 없는 화면을 띄우느니 위례를 보여 주는 편이 낫다 — 서울
 * 반대편에서 링크를 받아 연 사람에게 자기 동네의 빈 지도를 보여 주면
 * "데이터가 없는 서비스"로 읽힌다. 대신 왜 여기가 보이는지 지도 위에 적는다.
 *
 * 5km 는 데이터가 퍼져 있는 범위(약 4.8km)를 덮는 값이다.
 */
export const COVERAGE_RADIUS_M = 5000;

const EARTH_RADIUS_M = 6_371_000;

/**
 * 두 지점 사이의 **직선거리**(m). 하버사인.
 *
 * 위례 생활권 스케일(수 km)에서는 측지선과의 오차가 1m 미만이라 이걸로 충분하다.
 * 도보 실거리는 이보다 늘 길다 — 그래서 화면에는 반드시 '직선'이라고 적는다
 * (`formatDistance` 를 쓰는 쪽의 책임). 300m 라고 적어 두고 10분을 걷게 하면
 * 다음부터 이 숫자를 믿지 않는다.
 */
export function distanceM(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** `320m` · `1.2km`. 1km 아래는 10m 단위로 끊는다 — 직선거리에 1m 자리는 거짓 정밀도다. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function isWithinCoverage(point: LatLng): boolean {
  return distanceM(point, HOME_CENTER) <= COVERAGE_RADIUS_M;
}
