"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import type { ExpressionSpecification, Map as MaplibreMap } from "maplibre-gl";
import { Place, chipsFor, guidanceFor, typeMeta, unsurveyedFor } from "@/data/places";
import { RouteGlyph, iconMarkup, iconSize, typeIconName, WalkIcon } from "@/lib/typeIcons";
import { color, mapColor } from "@/lib/tokens";
import { HOME_CENTER, HOME_ZOOM } from "@/lib/geo";
import { RouteFetchError, fetchWalkRoute } from "@/lib/routing";
import { useHeading } from "@/lib/useHeading";
import type { RouteFetchFailure, WalkRoute } from "@/lib/routing";
import type { LocateResult, LocationStatus, UserCoords } from "@/lib/useUserLocation";

/**
 * 배경 지도 — OpenFreeMap.
 *
 * ## 왜 CARTO 를 떠났나
 *
 * `basemaps.cartocdn.com` 의 Voyager 를 쓰고 있었는데, CARTO 가 키 없는 사용을
 * 끊고 **모든 타일에 `API KEY REQUIRED` 를 대각선으로 찍어서** 내려보내기
 * 시작했다. 타일은 200 으로 정상적으로 오고 그림에 글자만 박혀 있어, 코드에서는
 * 아무 오류도 나지 않는다. 화면을 열어 봐야 알 수 있는 종류의 고장이다.
 *
 * ## 왜 OpenFreeMap 인가
 *
 * 키도 계정도 없이 쓰는 것이 조건이었다. 이 캠페인 지도는 누가 언제 다시
 * 배포할지 모르는 시안이라, **키를 발급받아 넣는 순간 그 키를 관리하는 사람이
 * 계속 필요해진다.** 남은 후보는 사실상 둘이었다.
 *
 *  - OSM 표준 타일 — 키는 없지만 진한 도로색과 빨간 경계 점선이 우리 파스텔
 *    마커를 덮는다. 배율별 가독성을 잡아 둔 규칙(아래 주석)이 통째로 어긋난다.
 *  - OpenFreeMap positron — 연한 회백 벡터 지도. 톤이 우리 화면에 맞고,
 *    키·요청 수 제한이 없다.
 *
 * 대신 벡터라 렌더링이 WebGL 로 간다. Leaflet 은 그대로 두고 배경 레이어만
 * `maplibre-gl-leaflet` 으로 바꿔 끼웠다 — 마커·클러스터·팝업·경로선은 전부
 * 예전 그대로 Leaflet 이 그린다.
 */
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

/**
 * MapLibre 의 워커를 우리가 직접 가리킨다.
 *
 * 벡터 타일은 **워커 안에서 받아 파싱된다.** 그런데 번들러(Turbopack)를 지나면
 * MapLibre 가 스스로 계산한 워커 주소가 문서 주소(`/`)로 떨어져, `new Worker`
 * 가 HTML 을 자바스크립트로 읽으려다 실패했다. 그 실패는 콘솔에 한 줄
 * ("non-JavaScript MIME type") 을 남길 뿐 지도는 예외 없이 조용하다 —
 * **배경색만 칠해진 빈 지도**가 되고, 타일 요청(.pbf)은 한 번도 나가지 않는다.
 * 네트워크 로그로 확인한 증상이다.
 *
 * 그래서 워커 파일을 `public/maplibre/` 로 복사해 두고 그 주소를 못 박는다.
 * 복사는 `npm run sync:maplibre` 가 하고, `predev`/`prebuild` 에 걸려 있어
 * maplibre-gl 을 올려도 손으로 다시 복사할 일은 없다. 워커가 옆에 있는
 * `maplibre-gl-shared.mjs` 를 상대경로로 부르므로 **둘을 같은 폴더에 둔다.**
 */
const BASEMAP_WORKER = "/maplibre/maplibre-gl-worker.mjs";

const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * 이 브라우저에서 벡터 지도를 그릴 수 있는가.
 *
 * MapLibre 는 컨텍스트를 못 얻으면 생성자에서 던지기도 하고, 비동기 `error`
 * 이벤트로만 알리기도 한다 — 뒤엣것은 try/catch 로 잡히지 않아 **아무 오류도
 * 없이 빈 회색 사각형만 남는다.** 그래서 물어보는 쪽이 확실하다.
 */
function canRenderVector() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * WebGL 이 없는 기기의 후퇴로. 벡터 지도는 캔버스가 열리지 않으면 아무것도
 * 그리지 못하고, 그때 화면에 남는 것은 빈 회색 사각형이다 — 배경이 못생긴
 * 것보다 **지도가 없는 것**이 훨씬 나쁘다.
 */
const FALLBACK_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const FALLBACK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * 손으로 확대할 수 있는 한도.
 *
 * 예전에는 타일 레이어가 이 값을 들고 있었지만, 벡터 배경에는 그 레이어가 없어
 * 지도 자신의 옵션으로 옮겼다. **markercluster 는 지도의 maxZoom 이 유한하지
 * 않으면 붙는 순간 예외를 던지므로**, 이건 있으면 좋은 값이 아니라 없으면 안
 * 되는 값이다.
 */
const MAX_ZOOM = 18;

/**
 * 라벨을 한국어로 세운다.
 *
 * OpenFreeMap 의 기본 스타일은 라틴 이름과 현지 이름을 붙여 `Wirye-daero
 * 위례대로` 처럼 두 번 적는다. 한 줄에 같은 말이 두 번 들어가면 좁은 화면에서
 * 라벨끼리 더 자주 부딪히고, 읽는 사람은 한 번도 읽지 않는 절반을 계속 지나쳐야
 * 한다. 이 화면을 보는 사람은 한국어를 읽는다.
 *
 * 도로 번호(`ref`)를 그리는 층은 건드리지 않는다 — 거기엔 이름이 없다.
 */
const PLACE_LABEL_LAYER = "seoultogether-place-label";

/** 한국어 이름 우선. 없는 곳에서만 원래 이름으로 물러선다. */
const KOREAN_NAME: ExpressionSpecification = [
  "coalesce",
  ["get", "name:ko"],
  ["get", "name"],
  ["get", "name:latin"],
];

function applyKoreanLabels(gl: MaplibreMap) {
  for (const layer of gl.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    const field = layer.layout?.["text-field"];
    if (!field || !JSON.stringify(field).includes('"name')) continue;
    gl.setLayoutProperty(layer.id, "text-field", KOREAN_NAME);
  }
}

/**
 * 배경 지도를 우리 팔레트로 다시 칠한다.
 *
 * 색은 `mapColor`(tokens.ts)에 모여 있고 그 이유도 거기에 적었다. 여기서는
 * **어느 층에 어떤 색을 주는지**만 정한다. 층 이름이 바뀌거나 사라져도
 * `getLayer` 로 걸러 조용히 지나간다 — 배경 스타일은 우리가 만든 것이 아니라
 * 언젠가 바뀐다. 그때 색이 하나 안 먹는 것은 괜찮지만, 지도가 통째로 죽는 것은
 * 안 된다.
 */
type PaintProperty = Parameters<MaplibreMap["setPaintProperty"]>[1];

const BASEMAP_PAINT: ReadonlyArray<readonly [string, PaintProperty, string]> = [
  ["background", "background-color", mapColor.land],
  ["park", "fill-color", mapColor.green],
  ["landcover_wood", "fill-color", mapColor.green],
  ["landuse_residential", "fill-color", mapColor.landuse],
  ["water", "fill-color", mapColor.water],
  ["waterway", "line-color", mapColor.waterway],
  ["building", "fill-color", mapColor.building],
  ["building", "fill-outline-color", mapColor.buildingLine],
  ["highway_motorway_inner", "line-color", mapColor.roadMajor],
  ["highway_motorway_casing", "line-color", mapColor.roadCasing],
  ["highway_motorway_subtle", "line-color", mapColor.roadMinor],
  ["highway_motorway_bridge_inner", "line-color", mapColor.roadMajor],
  ["highway_motorway_bridge_casing", "line-color", mapColor.roadCasing],
  ["highway_major_inner", "line-color", mapColor.roadMajor],
  ["highway_major_casing", "line-color", mapColor.roadCasing],
  ["highway_major_subtle", "line-color", mapColor.roadMinor],
  ["highway_minor", "line-color", mapColor.roadMinor],
  ["highway_path", "line-color", mapColor.roadMinor],
  ["tunnel_motorway_inner", "line-color", mapColor.roadMinor],
  ["tunnel_motorway_casing", "line-color", mapColor.roadCasing],
  ["road_area_pier", "fill-color", mapColor.land],
  ["road_pier", "line-color", mapColor.land],
  ["railway", "line-color", mapColor.rail],
  ["railway_dashline", "line-color", mapColor.railDash],
  ["railway_transit", "line-color", mapColor.rail],
  ["railway_transit_dashline", "line-color", mapColor.railDash],
  ["railway_service", "line-color", mapColor.rail],
  ["railway_service_dashline", "line-color", mapColor.railDash],
  ["boundary_2", "line-color", mapColor.boundary],
  ["boundary_3", "line-color", mapColor.boundary],
  ["boundary_disputed", "line-color", mapColor.boundary],
];

/**
 * 배경 지도의 글자색. 원래 스타일은 검정·회색(#000/#333/#666)을 쓰는데, 크림색
 * 땅 위에서 그것만 중성이라 혼자 차갑게 뜬다. 화면의 글자와 같은 잉크를 쓴다.
 */
const BASEMAP_TEXT: ReadonlyArray<readonly [string, string]> = [
  ["label_country_1", color.inkSoft],
  ["label_country_2", color.inkSoft],
  ["label_country_3", color.inkSoft],
  ["label_state", color.muted],
  ["label_city", color.inkSoft],
  ["label_city_capital", color.inkSoft],
  ["label_town", color.inkSoft],
  ["label_village", color.inkSoft],
  ["label_other", color.muted],
  ["highway-name-major", color.muted],
  ["highway-name-minor", color.muted],
  ["highway-name-path", color.muted],
  ["water_name_point_label", color.waterInk],
  ["water_name_line_label", color.waterInk],
  ["waterway_line_label", color.waterInk],
  ["airport", color.muted],
];

function applyBasemapPalette(gl: MaplibreMap) {
  for (const [layer, property, value] of BASEMAP_PAINT) {
    if (gl.getLayer(layer)) gl.setPaintProperty(layer, property, value);
  }
  for (const [layer, value] of BASEMAP_TEXT) {
    if (!gl.getLayer(layer)) continue;
    gl.setPaintProperty(layer, "text-color", value);
    gl.setPaintProperty(layer, "text-halo-color", color.paper);
  }
}

/**
 * 장소 이름을 배경 지도에 되돌린다.
 *
 * positron 은 데이터 위에 깔기 위한 바탕 스타일이라 **이름을 붙이는 층이
 * 물길·도로·행정 지명뿐이다.** 가게도 건물도 이름이 없다. 예전 배경(Voyager)
 * 에는 있던 것이라, 옮기고 나니 "가든파이브가 어디지"에 지도가 답을 못 했다.
 * 마커는 우리 시설만 찍혀 있어서, 그 사이의 빈 땅이 무엇인지 말해 주는 것이
 * 하나도 없는 상태였다.
 *
 * 그래서 `poi` 층을 우리가 직접 얹는다. 스타일을 통째로 바꾸지 않는 이유는
 * 이름만 필요하기 때문이다 — bright/liberty 로 갈아타면 도로색과 건물색이
 * 함께 진해져서, 파스텔 마커가 배경에 묻힌다(§1 의 색 규칙이 지도에서만
 * 깨진다).
 *
 * 세 가지를 눌러 둔다.
 *   · **글자만.** 아이콘은 얹지 않는다. 지도 위의 그림은 우리 시설의 것이어야
 *     한다. 배경의 상점 아이콘이 섞이면 무엇이 조사된 시설인지 흐려진다.
 *   · **z15 부터.** 첫 화면이 z15 다. 그 아래에서는 이름이 아니라 동네가
 *     보여야 한다.
 *   · **rank 20 까지.** OpenMapTiles 의 중요도 순위다. 전부 켜면 한 건물에
 *     들어찬 가게 이름이 마커를 덮는다.
 */
function addPlaceLabels(gl: MaplibreMap) {
  if (gl.getLayer(PLACE_LABEL_LAYER)) return;
  gl.addLayer({
    id: PLACE_LABEL_LAYER,
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "poi",
    minzoom: 15,
    filter: ["all", ["has", "name"], ["<=", ["get", "rank"], 20]],
    layout: {
      "text-field": KOREAN_NAME,
      // 스타일이 이미 싣고 있는 글꼴만 쓸 수 있다. 한글 글리프도 이 이름으로
      // 받아진다(글꼴 서버에서 44032-44287 범위 확인).
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 17, 12],
      "text-max-width": 7,
      "text-padding": 4,
      // 자리가 모자라면 그린 것을 밀어내지 말고 이름 쪽이 빠진다.
      "text-optional": true,
    },
    paint: {
      "text-color": color.muted,
      "text-halo-color": color.paper,
      "text-halo-width": 1.2,
      "text-halo-blur": 0.4,
    },
  });
}

/** 아래쪽에는 출처 표기와 위치 권유 배너가 떠 있어 여백을 조금 더 준다.
    (범례를 걷어내면서 108 → 72 로 줄였다.) */
const FIT_OPTIONS: L.FitBoundsOptions = {
  paddingTopLeft: [48, 48],
  paddingBottomRight: [48, 72],
  // 한 곳만 남았을 때 최대 배율까지 파고들지 않게 한다 — 주변이 안 보이면
  // 그게 어디쯤인지 알 수 없다.
  maxZoom: 16,
};

/** 마커 실루엣: 40px 흰 받침 + 아래로 나온 꼬리. 좌표에 닿는 지점은 꼬리 끝. */
const MARKER_W = 40;
const MARKER_H = 45;

/** 이 정확도보다 흐릿하면 점 하나로 단정하지 않고 오차 원을 함께 그린다. */
const ACCURACY_CIRCLE_MIN_M = 100;

/**
 * 베이스맵 가독성 — 실제 화면을 배율별로 비교해 확인한 것.
 *
 * **아래 관찰은 Carto Voyager 를 보고 적은 것이다.** 배경을 OpenFreeMap
 * positron 으로 옮긴 뒤로는 다시 확인하지 않았다 — 배율 상한(18)은 그대로
 * 두었지만, 어느 배율에서 도로와 라벨이 사라지는지는 새 스타일에서 다시 봐야
 * 한다. positron 은 Voyager 보다 색이 더 빠진 스타일이라 그 경계가 앞당겨질
 * 가능성이 크다.
 *
 * **위례는 아파트 밀집지라, 어느 배율 아래로는 지도가 건물 윤곽만 남는다.**
 * z17 부터 간선도로의 노란색을 거두고 이면도로를 전부 흰색으로 그리는데,
 * 지면도 크림색이라 도로가 도로로 읽히지 않는다. z19 에서는 번지 숫자만 남는다.
 *
 *   z15  간선도로 위계 · 장지천 · 공원 · 도로명 — 첫 화면(HOME_ZOOM)
 *   z16  위례서로 · 위례순환로 · 위례중앙로 라벨이 남는 마지막 배율
 *   z17  라벨과 도로색이 사라지고 건물 덩어리만 남는다
 *   z19  번지 숫자
 *
 * 그래서 손으로 확대할 수 있는 한도를 19 → 18 로 한 단계 줄였다(`MAX_ZOOM`).
 * `L.markerClusterGroup` 은 지도에 붙는 순간 자기 내부 배율 트리를 그때의
 * 지도 maxZoom 으로 얼려 두므로, 이 값은 카드를 선택해 열 때도 일관되게 적용된다.
 *
 * **카드 선택 시 z16 이하로 더 낮추는 상한은 시도했다가 되돌렸다.** 얼어붙은
 * 내부 트리와 어긋나는 순간부터 언클러스터 로직이 멈춰, 특정 마커의 팝업이
 * 영영 열리지 않는 상태가 됐다(거여역처럼 서로 다른 타입의 시설이 같은 역
 * 앞에 모여 44px 반경 안에서 함께 클러스터되는 자리에서 재현됨). 카드 선택은
 * markercluster 의 `zoomToShowLayer` 그대로 쓴다 — z18 까지 파고들 수 있지만,
 * 팝업이 실제로 열리는 쪽이 배율보다 우선한다.
 */
const STEP_ZOOM = 16;

function markerIcon(type: Place["type"]) {
  return L.divIcon({
    className: "marker-wrap",
    html: `<div class="marker"><span class="marker-tail"></span>${iconMarkup(typeIconName[type], iconSize.md)}</div>`,
    iconSize: [MARKER_W, MARKER_H],
    iconAnchor: [MARKER_W / 2, MARKER_H],
    popupAnchor: [0, -MARKER_H + 2],
  });
}

/**
 * 내 위치 마커. 점 위에 **보고 있는 방향**의 부채꼴을 함께 얹는다.
 *
 * 부채꼴은 항상 그려 두고 보이고 안 보이고만 클래스로 바꾼다(`is-on`). 방향은
 * 나침반에서 초당 여러 번 오는데, 그때마다 아이콘 HTML 을 다시 만들면 마커
 * DOM 이 통째로 새로 붙어 맥박 애니메이션이 매번 처음으로 되돌아간다. 각도는
 * 아래 이펙트가 이 요소의 `transform` 만 직접 고쳐 쓴다.
 *
 * 그림 자체는 위(북)를 향해 있고, 회전은 CSS 가 맡는다.
 */
function userLocationIcon() {
  return L.divIcon({
    className: "user-location-wrap",
    html: `<div class="user-location">
      <span class="user-location-pulse"></span>
      <span class="user-location-cone" aria-hidden="true">
        <svg viewBox="0 0 64 36" preserveAspectRatio="none">
          <defs>
            <linearGradient id="user-cone" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stop-color="${color.accent}" stop-opacity="0.5"/>
              <stop offset="1" stop-color="${color.accent}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="M32 36 8 6a40 40 0 0 1 48 0Z" fill="url(#user-cone)"/>
        </svg>
      </span>
      <span class="user-location-dot"></span>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

/**
 * 겹친 마커를 대신하는 묶음 배지.
 *
 * 시설 색을 섞지 않고 중립 배지에 개수만 적는다. 한 건물에 수유실과 식당이
 * 함께 있으면 섞인 색은 어느 쪽도 뜻하지 않게 되고, "이 색은 이 시설"이라는
 * 규칙(DESIGN.md §1)이 지도에서만 깨진다. 배지는 '아직 정해지지 않은 자리'로
 * 두고, 누르면 뜨는 목록에서 각자의 색으로 돌아온다.
 */
function clusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  return L.divIcon({
    className: "cluster-wrap",
    html: `<div class="cluster"><span class="cluster-count">${count}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

/**
 * markercluster 의 내부 필드. 공개 API 에는 같은 정보가 없어 어쩔 수 없이 본다.
 * 라이브러리를 올릴 때 `leaflet.markercluster-src.js` 의 `_zoomOrSpiderfy` 와
 * `zoomToShowLayer` 를 다시 볼 것 — 그 두 함수가 보는 필드와 같은 것들이다.
 */
interface ClusterInternals {
  _childClusters: ClusterInternals[];
  _childCount: number;
  _zoom: number;
}

/** 이 마커를 지금 담고 있는 묶음. 홀로 서 있으면 화면 밖 배율의 것이 온다. */
function parentClusterOf(marker: L.Marker): L.MarkerCluster | undefined {
  return (marker as unknown as { __parent?: L.MarkerCluster }).__parent;
}

/** 이 묶음 그룹이 얼려 둔 최대 배율(붙을 때 지도에서 가져간 값). */
function clusterMaxZoom(group: L.MarkerClusterGroup, map: L.Map) {
  return (group as unknown as { _maxZoom?: number })._maxZoom ?? map.getMaxZoom();
}

/** 확대 애니메이션이 도는 중인가. 도는 동안의 마커 DOM 은 제자리가 아니다. */
function clusterAnimating(group: L.MarkerClusterGroup) {
  return Boolean((group as unknown as { _inZoomAnimation?: number })._inZoomAnimation);
}

/**
 * 확대하면 갈라지는 묶음인가.
 *
 * markercluster 가 배지 클릭을 처리할 때 쓰는 판정과 같은 것이다 — 자식이
 * 하나뿐인 사슬을 끝까지 따라가, 최대 배율의 묶음이 여전히 같은 수를 담고
 * 있으면 그 묶음은 **어떤 배율에서도 갈라지지 않는다**(좌표가 같다).
 */
function splitsOnZoom(cluster: L.MarkerCluster, maxZoom: number) {
  const top = cluster as unknown as ClusterInternals;
  let bottom = top;
  while (bottom._childClusters.length === 1) bottom = bottom._childClusters[0];
  return !(bottom._zoom === maxZoom && bottom._childCount === top._childCount);
}

/**
 * 팝업이 지도 모서리에 닿지 않게 하는 여백.
 *
 * Leaflet 기본값은 [5, 5] 다. 그런데 `.map-card` 는 `overflow: hidden` 이라
 * 그 5px 너머는 잘려 나간다 — 카드 위쪽의 둥근 모서리와 20px 여백이 사라진
 * 채로, 아이콘이 경계선에 붙어 보였다. 지도 UI 여백(12px)보다 한 단계 넉넉히
 * 잡아 카드가 경계에 얹히지 않게 한다.
 */
const POPUP_AUTOPAN_PADDING: L.PointTuple = [16, 20];

const PLACE_POPUP_OPTIONS: L.PopupOptions = {
  minWidth: 288,
  maxWidth: 288,
  autoPanPadding: POPUP_AUTOPAN_PADDING,
};

/** 배지(40px) 위로 띄운다. 카드가 방금 누른 숫자를 덮으면 어디를 눌렀는지 잃는다. */
const CLUSTER_POPUP_OPTIONS: L.PopupOptions = { ...PLACE_POPUP_OPTIONS, offset: [0, -22] };

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHTML(value: string) {
  return value.replace(/[&<>"]/g, (c) => HTML_ENTITIES[c]);
}

/**
 * 팝업은 문자열 HTML 로 만들지만 스타일 시스템은 그대로 쓴다 — 루트에
 * `data-type` 만 달면 globals.css 의 `[data-type="…"]` 규칙이 `--t-fg`/`--t-bg`
 * 를 심어 주므로, 안쪽 `.chip` 이 시설 색을 알아서 따라간다.
 */
function popupHTML(p: Place) {
  const chips = chipsFor(p)
    .map((d) => `<li class="chip chip-neutral">${escapeHTML(d)}</li>`)
    .join("");

  const rows = [
    p.location && `<p><b>위치</b><span>${escapeHTML(p.location)}</span></p>`,
    `<p><b>주소</b><span>${escapeHTML(p.address)}</span></p>`,
    // 영업시간과 전화는 주소 바로 다음이다 — 갈 수 있나(주소) 다음에 오는
    // 질문이 지금 여나(시간), 물어볼 수 있나(전화)다. 메뉴는 그 뒤.
    p.hours && `<p><b>영업</b><span>${escapeHTML(p.hours)}</span></p>`,
    p.phone &&
      `<p><b>전화</b><span><a class="popup-tel" href="tel:${escapeHTML(p.phone.replace(/[^\d+]/g, ""))}">${escapeHTML(p.phone)}</a></span></p>`,
    p.menu && `<p><b>메뉴</b><span>${escapeHTML(p.menu)}</span></p>`,
    p.kid?.stroller && `<p><b>유모차</b><span>${escapeHTML(p.kid.stroller)}</span></p>`,
    p.extra && `<p><b>참고</b><span>${escapeHTML(p.extra)}</span></p>`,
  ]
    .filter(Boolean)
    .join("");

  // 조사되지 않은 항목은 빈칸으로 두지 않는다. 빈칸은 "없더라"로 읽히고,
  // 사용자는 전화 한 통 없이 유모차를 밀고 나선다.
  const missing = unsurveyedFor(p);
  const gap = missing.length
    ? `<p class="popup-gap">${escapeHTML(missing.join(" · "))}은(는) 아직 조사되지 않았어요.${
        p.naverUrl ? " 네이버 지도에서 확인해 주세요." : ""
      }</p>`
    : "";

  // 설비 제원은 맨 아래, 한 줄로. 유모차를 미는 사람의 판단에는 보탬이 되지
  // 않지만 휠체어 이용자에게는 의미가 있어 버리지 않는다.
  const spec = p.spec?.length
    ? `<p class="popup-spec">${escapeHTML(p.spec.join(" · "))}</p>`
    : "";

  // 안내문은 판단에 쓸 수 있을 때만. 식당 48건은 note 가 조사자료 이름이라
  // 여기서 걸러진다(`guidanceFor`).
  const guidance = guidanceFor(p);

  const naver = p.naverUrl
    ? `<a class="popup-link is-naver" href="${escapeHTML(p.naverUrl)}" target="_blank" rel="noopener noreferrer">네이버 지도에서 보기</a>`
    : "";

  return `<div class="popup" data-type="${p.type}">
  <div class="popup-head">
    ${iconMarkup(typeIconName[p.type], iconSize.lg, "popup-icon")}
    <div>
      <h3>${escapeHTML(p.name)}</h3>
      <div class="popup-type"><span class="chip">${escapeHTML(typeMeta[p.type].label)}</span></div>
    </div>
  </div>
  ${p.summary ? `<p class="popup-summary">${escapeHTML(p.summary)}</p>` : ""}
  <div class="popup-meta">${rows}</div>
  <ul class="popup-chips">${chips}</ul>
  ${gap}
  ${guidance ? `<p class="popup-note">${escapeHTML(guidance)}</p>` : ""}
  ${spec}
  ${naver}
</div>`;
}

/**
 * 겹친 곳들의 목록. 숫자 배지를 누르면 마커를 펼치는 대신 이 카드가 뜬다.
 *
 * 예전에는 markercluster 의 spiderfy 로 마커를 방사형으로 뻗어 놓았다. 아홉
 * 개가 저마다 다리(선)를 달고 나선으로 흩어지는 그림은 지도 위에서 튀는 데다,
 * 어느 것이 무엇인지는 결국 하나씩 눌러 봐야 알 수 있었다 — 펼침이 답한 질문은
 * '몇 개인가'뿐이고 '무엇이 있는가'가 아니었다. 이름을 늘어놓는 목록은 그
 * 질문에 바로 답하고, 좌표가 완전히 같아도 흐트러지지 않는다.
 *
 * 순서는 데이터 순서 그대로다 — 거리순으로 다시 세우지 않는다. 한 점에 겹친
 * 곳들이라 서로 거리가 같다.
 */
function clusterListHTML(places: Place[]) {
  const items = places
    .map(
      (p) => `<li>
    <button type="button" class="cluster-item" data-id="${escapeHTML(p.id)}" data-type="${p.type}">
      ${iconMarkup(typeIconName[p.type], iconSize.sm, "cluster-item-icon")}
      <span class="cluster-item-name">${escapeHTML(p.name)}</span>
      <span class="chip">${escapeHTML(typeMeta[p.type].label)}</span>
    </button>
  </li>`
    )
    .join("");

  return `<div class="cluster-list">
  <p class="cluster-list-head">여기 있는 <b>${places.length}곳</b></p>
  <ul>${items}</ul>
</div>`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * 경로 UI 의 상태. 실패를 한 덩어리로 두지 않는다 — 권한을 거부한 것,
 * 경로 서버에 닿지 못한 것, 계단을 피해서는 갈 길이 없는 것은 사용자가 할 수
 * 있는 일이 전부 다르다. 예전에는 셋 다 "위치 권한을 확인해 주세요" 로 나가서,
 * 권한을 아무리 확인해도 고쳐지지 않는 안내가 됐다.
 */
type RouteFailure = "denied" | "position" | RouteFetchFailure;

/**
 * 경로 요청을 여기서 끊는다.
 *
 * valhalla1.openstreetmap.de 는 무료 공개 인스턴스라 SLA 가 없고, 느려질 때는
 * 응답이 오지 않는 게 아니라 아주 늦게 온다. 시한이 없으면 "경로 찾는 중…"
 * 이 영원히 돌고, 사용자는 앱이 멈춘 줄 안다.
 *
 * 12초였다. 거리 상한(5km)을 걷어내면서 20초로 늘렸다 — 수십 km 짜리 보행
 * 경로는 탐색 자체가 길어서, 예전 시한이면 서버가 멀쩡한데도 시한 초과로
 * 끊긴다. 그러면 "멀어도 길찾기" 가 "멀면 실패" 로 되돌아간다.
 */
const ROUTE_TIMEOUT_MS = 20_000;

type RouteState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "loading" }
  | { kind: "error"; reason: RouteFailure }
  | { kind: "done"; route: WalkRoute };

const ROUTE_ERROR_TEXT: Record<RouteFailure, string> = {
  denied: "위치 권한이 꺼져 있어요. 주소창의 자물쇠에서 위치를 허용해 주세요.",
  position: "지금 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  network: "경로를 가져오지 못했어요. 인터넷 연결을 확인해 주세요.",
  timeout: "경로 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요.",
  noroute: "계단을 피해 갈 수 있는 길을 찾지 못했어요.",
  toofar: "경로 서버가 다루는 거리를 넘었어요. 대중교통은 네이버 지도에서 확인해 주세요.",
};

/** 다시 눌러 볼 만한 실패인가. 같은 답이 돌아올 실패에는 버튼을 주지 않는다. */
const RETRYABLE: ReadonlySet<RouteFailure> = new Set<RouteFailure>([
  "position",
  "timeout",
  "network",
]);

/**
 * 지도가 페이지 스크롤을 가로채지 않게 하는 잠금.
 *
 * 모바일에서 지도는 목록 위(`order: -1`)에 420px 로 앉아 있다. Leaflet 의
 * 기본값(`dragging: true`)이면 화면을 처음 쓸어내릴 때 페이지가 아니라 지도가
 * 끌려서, 목록에 닿으려면 지도를 피해 스와이프해야 한다는 걸 사용자가
 * 알아내야 했다. 유모차를 밀며 한 손으로 보는 화면에서 가장 비싼 실수다.
 *
 * 그래서 손가락 입력일 때는 잠근 채로 시작하고, 지도를 한 번 탭하면 푼다.
 * 마우스는 끄는 데 문제가 없으므로 잠그지 않고, 대신 휠 줌만 끈다 — 페이지를
 * 스크롤하다 지도 위를 지나면 확대되던 문제가 같은 뿌리다.
 */
function isTouchPrimary() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

interface MapViewProps {
  places: Place[];
  visibleIds: Set<string>;
  selectedId: string | null;
  /** 마커를 눌렀을 때 목록 쪽 선택을 함께 옮긴다. */
  onSelect: (id: string) => void;
  routeToId: string | null;
  onClearRoute: () => void;
  userCoords: UserCoords | null;
  locationStatus: LocationStatus;
  /** 데이터 반경 밖에서 열었다. 첫 화면을 내 위치로 옮기지 않는다. */
  outOfCoverage: boolean;
  /** `?loc=…` 로 지정한 테스트 위치를 쓰는 중이다. */
  mockLocation: boolean;
  onRequestLocation: () => Promise<LocateResult>;
  onRefreshLocation: () => Promise<LocateResult>;
}

export default function MapView({
  places,
  visibleIds,
  selectedId,
  onSelect,
  routeToId,
  onClearRoute,
  userCoords,
  locationStatus,
  outOfCoverage,
  mockLocation,
  onRequestLocation,
  onRefreshLocation,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  /** 마커 → 장소 id. 묶음이 돌려주는 자식 마커에서 곳을 되찾을 때 쓴다. */
  const idOfMarkerRef = useRef<Map<L.Marker, string>>(new Map());
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  /** 나침반. 켜고 끄는 것은 아래 이펙트가 한다(길찾기 중에만).
      함수 둘은 훅 안에서 고정돼 있고, 매 갱신마다 새로 오는 것은 각도뿐이다 —
      의존성에 훅이 돌려준 객체를 통째로 넣으면 각도가 바뀔 때마다 센서를
      껐다 켜게 된다. 그래서 필요한 것만 풀어서 쓴다. */
  const { deg: headingDeg, request: requestHeading, watch: watchHeading } = useHeading();

  const [routeState, setRouteState] = useState<RouteState>({ kind: "idle" });
  /** 손가락 입력에서 지도를 아직 잠가 두었는가. 탭 한 번으로 풀린다. */
  const [mapLocked, setMapLocked] = useState(false);
  /** 마커 클릭 핸들러는 지도를 만들 때 한 번만 붙으므로, 매 렌더 새로 오는
      콜백을 ref 로 받아 둔다. */
  const onSelectRef = useRef(onSelect);
  /** 묶음 목록의 클릭 핸들러도 지도를 만들 때 한 번만 붙는다. 같은 이유로 ref. */
  const selectedIdRef = useRef(selectedId);
  const revealPlaceRef = useRef<((id: string) => (() => void) | undefined) | null>(null);
  /** 방금의 선택이 마커 클릭에서 왔는가. 왔다면 지도를 다시 움직이지 않는다 —
      사용자가 이미 보고 누른 마커를 화면 밖으로 밀어낼 이유가 없다. */
  const fromMarkerRef = useRef(false);
  /** 길 안내 목록을 펼쳐 두었는가. 목적지가 바뀌면 접는다. */
  const [stepsOpen, setStepsOpen] = useState(false);
  const requestTokenRef = useRef(0);
  const routeUiRef = useRef<HTMLDivElement>(null);
  /** 마지막으로 화면을 맞춘 결과 집합. null 이면 아직 첫 실행 전. */
  const fittedKeyRef = useRef<string | null>(null);
  /** 내 위치로 첫 화면을 옮긴 적이 있는지. 한 번만 옮기고 이후는 버튼으로만. */
  const centeredOnUserRef = useRef(false);
  /**
   * 길찾기 중 지도가 내 점을 따라가는가.
   *
   * 길찾기를 열면 켜지고, **사용자가 지도를 직접 끌면 풀린다** — 지금 보려고
   * 옮긴 자리를 다음 좌표가 도로 뺏어 가면 지도를 볼 수가 없다. 다시 켜는
   * 길은 '내 위치로 이동' 버튼이다.
   */
  const followRef = useRef(false);
  /** 따라가기가 마지막으로 본 좌표. 첫 좌표에서는 화면을 옮기지 않는다. */
  const followedRef = useRef<L.LatLng | null>(null);

  // 목적지가 바뀌면 이전 경로의 결과·상태를 렌더 중에 즉시 버린다. 이걸
  // 이펙트로 미루면 새 목적지의 카드가 뜨기 전 한 프레임 동안 이전 목적지의
  // 소요시간이나 에러 문구가 그대로 남는다.
  //
  // 새 상태는 여기서 곧바로 정한다. 무엇을 띄울지는 순수한 판단이고(좌표가
  // 있나 · 권한이 거부됐나), 실제 요청만 이펙트가 건다.
  const [prevRouteToId, setPrevRouteToId] = useState(routeToId);
  if (prevRouteToId !== routeToId) {
    setPrevRouteToId(routeToId);
    setStepsOpen(false);
    setRouteState(
      !routeToId
        ? { kind: "idle" }
        : userCoords
          ? // 좌표가 이미 있으면 아무것도 묻지 않는다. 목적지마다 권한 카드를
            // 다시 띄우는 건 이미 "예" 라고 답한 것을 계속 다시 묻는 일이다.
            { kind: "loading" }
          : locationStatus === "denied"
            ? { kind: "error", reason: "denied" }
            : { kind: "confirm" }
    );
  }

  // 마커 클릭 핸들러는 지도를 만들 때 한 번만 붙고 그 뒤로 갱신되지 않으므로,
  // 최신 콜백을 ref 로 흘려 넣는다. 렌더 중에 대입하면 안 된다(react-hooks/refs).
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  /** 선택된 마커만 살짝 키운다. 묶여 있거나 펼쳐지는 중이면 DOM 이 없을 수 있다. */
  const applyActiveMarker = useCallback(() => {
    markersRef.current.forEach((marker, id) => {
      marker.getElement()?.firstElementChild?.classList.toggle("is-active", id === selectedId);
    });
  }, [selectedId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // 손가락 입력이면 끌기를 잠근 채 시작한다(위 `isTouchPrimary` 주석 참고).
    // 휠 줌은 입력 방식과 무관하게 끈다 — 확대/축소 버튼이 이미 있다.
    const locked = isTouchPrimary();
    setMapLocked(locked);

    // setView 는 레이어를 붙이기 전에 와야 한다. Leaflet 은 중심·줌이 정해지지
    // 않은 지도에 레이어를 추가하면 예외를 던진다.
    const map = L.map(containerRef.current, {
      zoomControl: true,
      dragging: !locked,
      scrollWheelZoom: false,
      // 19 까지 열어 두면 번지 숫자만 남은 화면까지 확대된다(위 베이스맵 가독성
      // 주석). 손으로 확대할 여지는 남기되 거기서 끊는다.
      maxZoom: MAX_ZOOM,
    }).setView([HOME_CENTER.lat, HOME_CENTER.lng], HOME_ZOOM);

    // 벡터 배경. WebGL 이 없거나 생성자가 던지면 래스터로 물러선다.
    try {
      if (!canRenderVector()) throw new Error("no webgl");
      setWorkerUrl(BASEMAP_WORKER);
      const basemap = L.maplibreGL({
        style: BASEMAP_STYLE,
        // 출처 표기는 Leaflet 의 것 하나만 둔다. MapLibre 가 자기 캔버스 안에
        // 또 그리면 같은 문장이 두 줄로 겹쳐 앉는다.
        attributionControl: false,
      }).addTo(map);
      basemap.getMaplibreMap().once("load", function dress(this: MaplibreMap) {
        applyBasemapPalette(this);
        applyKoreanLabels(this);
        addPlaceLabels(this);
      });
      map.attributionControl?.addAttribution(BASEMAP_ATTRIBUTION);
    } catch {
      L.tileLayer(FALLBACK_TILES, {
        maxZoom: MAX_ZOOM,
        attribution: FALLBACK_ATTRIBUTION,
      }).addTo(map);
    }
    mapRef.current = map;

    // 사용자가 지도를 끌면 따라가기를 푼다. `dragstart` 는 손·마우스로 끈
    // 경우에만 오고, 우리가 부르는 `panTo`/`setView` 로는 오지 않는다.
    map.on("dragstart", () => {
      followRef.current = false;
    });

    // autoPan 은 팝업이 열리는 그 순간의 크기로 한 번 계산하고 만다. 웹폰트
    // (Pretendard 는 CDN 에서 온다)나 타일 아이콘이 그 뒤에 자리를 잡아 카드가
    // 자라면, 카드는 마커 위에 매달려 있으므로 자란 만큼이 지도 위쪽 밖으로
    // 밀려난다 — 그리고 `.map-card` 의 `overflow: hidden` 이 거기서 잘라낸다.
    // 그려진 다음 프레임에 실제 위치를 다시 재서 모자란 만큼만 밀어 준다.
    map.on("popupopen", (e) => {
      const popup = e.popup;
      requestAnimationFrame(() => {
        // 그 사이에 지도가 걷혔을 수 있다(StrictMode 의 이중 마운트 포함).
        // 사라진 지도에 `panBy` 를 걸면 Leaflet 이 내부에서 던진다.
        if (mapRef.current !== map) return;
        const el = popup.getElement();
        if (!el) return;
        const card = el.getBoundingClientRect();
        const view = map.getContainer().getBoundingClientRect();
        const over = card.top - view.top - POPUP_AUTOPAN_PADDING[1];
        // 지도보다 큰 카드는 밀어도 들어오지 않는다 — 그쪽은 CSS 가 높이를
        // 묶어 카드 안에서 스크롤하게 한다(globals.css 의 max-height).
        if (over > -0.5) return;
        if (card.height + POPUP_AUTOPAN_PADDING[1] * 2 > view.height) return;
        map.panBy([0, over], { animate: false });
      });
    });

    // 지오코딩한 식당 좌표는 건물 단위라 한 건물의 여러 가게가 정확히 같은
    // 점에 놓인다(가든파이브 9곳, 파크하비오 7곳). 묶지 않으면 맨 위 마커
    // 하나만 눌리고 나머지는 지도에서 고를 방법이 없다.
    //
    // `disableClusteringAtZoom` 은 두지 않는다 — 좌표가 완전히 같으면 아무리
    // 확대해도 갈라지지 않으므로, 어느 배율에서 묶기를 그만두는 순간 그
    // 마커들은 다시 서로를 가린다. 대신 끝까지 묶어 두고 목록으로 고르게 한다.
    //
    // 배지 클릭 처리는 라이브러리에서 가져와 아래 `clusterclick` 에서 직접
    // 한다(펼치기 대신 목록). 그래서 두 옵션을 모두 끈다 — 켜 두면 라이브러리의
    // `_zoomOrSpiderfy` 가 같은 클릭에 먼저 반응해 두 번 일이 일어난다.
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      zoomToBoundsOnClick: false,
      maxClusterRadius: 44,
      // 화면 밖 마커를 걷어내지 않는다. 기본값(true)에서는 팝업이 열릴 때
      // `autoPan` 이 지도를 움직이고, 그 moveend 에서 클러스터가 마커를
      // 제거하는데 — `bindPopup` 은 마커의 `remove` 에 `closePopup` 을 걸어
      // 두므로 **방금 연 팝업이 스스로 닫혔다.** 420px 짜리 모바일 지도에서만
      // 팬이 일어나서 모바일에서만 재현됐다. 마커가 67개뿐이라 전부 붙여 두는
      // 비용은 없다.
      removeOutsideVisibleBounds: false,
      iconCreateFunction: clusterIcon,
    });
    cluster.addTo(map);
    clusterRef.current = cluster;

    // 숫자 배지를 눌렀을 때. 확대해서 갈라지는 묶음이면 그 범위로 확대하고,
    // 좌표가 같아 어떤 배율에서도 갈라지지 않는 묶음이면 겹친 곳들의 목록을
    // 띄운다. 앞의 갈래는 라이브러리 기본과 같고, 뒤의 갈래가 펼치기를
    // 대신한다(`clusterListHTML` 주석).
    //
    // 키보드도 같은 길로 온다(`clusterkeypress`). 라이브러리가 그랬듯 엔터만
    // 받는다 — 화살표로 지도를 옮기는 동안 배지가 열리면 안 된다.
    cluster.on("clusterclick clusterkeypress", (e) => {
      const event = e as L.LeafletEvent & {
        propagatedFrom?: L.MarkerCluster;
        originalEvent?: KeyboardEvent;
      };
      if (e.type === "clusterkeypress" && event.originalEvent?.key !== "Enter") return;
      const target = event.propagatedFrom;
      if (!target) return;
      if (splitsOnZoom(target, clusterMaxZoom(cluster, map))) {
        target.zoomToBounds();
        return;
      }

      const ids = new Set(
        target.getAllChildMarkers().map((m: L.Marker) => idOfMarkerRef.current.get(m) ?? "")
      );
      const items = places.filter((p) => ids.has(p.id));
      if (!items.length) return;

      const popup = L.popup({ ...CLUSTER_POPUP_OPTIONS, className: "cluster-popup" })
        .setLatLng(target.getLatLng())
        .setContent(clusterListHTML(items))
        .openOn(map);

      // 목록에서 고르면 카드 클릭과 같은 길로 흘려보낸다 — 선택 이펙트가
      // 같은 자리에 그 곳의 팝업을 다시 연다(`revealPlace`). 팝업을 여기서
      // 닫지 않는 이유는 Leaflet 이 새 팝업을 열 때 앞의 것을 닫기 때문이다.
      popup.getElement()?.addEventListener("click", (ev) => {
        const button = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".cluster-item");
        const id = button?.dataset.id;
        if (!id) return;
        // 방금 고른 곳을 목록에서 다시 누르면 `selectedId` 가 그대로라 선택
        // 이펙트가 돌지 않는다. 그 자리에서 아무 일도 일어나지 않으면 목록이
        // 고장 난 것으로 읽히므로, 그때는 여기서 직접 연다.
        if (id === selectedIdRef.current) revealPlaceRef.current?.(id);
        else onSelectRef.current(id);
      });
    });

    // 좌표가 있는 곳만 마커를 만든다. 주소만 있는 식당은 markersRef 에 아예
    // 들어오지 않으므로, 이후의 표시/선택 로직도 자연히 이들을 건너뛴다.
    const markers = markersRef.current;
    const idOfMarker = idOfMarkerRef.current;
    places.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const marker = L.marker([p.lat, p.lng], { icon: markerIcon(p.type) }).bindPopup(
        popupHTML(p),
        PLACE_POPUP_OPTIONS
      );
      // 여기까지는 목록 → 지도 한 방향뿐이었다. 마커를 눌러도 목록은 아무 일도
      // 하지 않아서, 묶인 아홉 곳을 펼쳐 하나를 고른 뒤 "이게 목록의 어느
      // 가게지"에 답이 없었다. 색으로 잇겠다는 규칙(DESIGN.md §1)이 한쪽
      // 방향으로만 지켜지고 있었다.
      marker.on("click", () => {
        fromMarkerRef.current = true;
        onSelectRef.current(p.id);
        // 팝업도 여기서 직접 연다. 클러스터 그룹에 묶인 마커는 `bindPopup` 이
        // 심어 두는 Leaflet 기본 열기가 걸리지 않아서(브라우저에서 확인:
        // 카드 클릭은 열리는데 마커 클릭은 팝업 창이 아예 뜨지 않았다), 지금까지
        // 마커를 누르면 눈에 보이는 일이 하나도 없었다. 목록 경로가 쓰는
        // `openPopup()` 과 같은 호출을 여기에도 둔다.
        // `isPopupOpen()` 으로 막아 두는 이유: Leaflet 의 기본 열기가 걸리는
        // 경우에는 그쪽이 토글이라, 여기서 무조건 열면 마커를 눌러 닫을 수 없다.
        if (!marker.isPopupOpen()) marker.openPopup();
      });
      markers.set(p.id, marker);
      idOfMarker.set(marker, p.id);
    });
    cluster.addLayers([...markers.values()]);

    // Leaflet caches the container size at init; if layout shifts afterwards
    // (fonts/images loading, sidebar content changing), it leaves stale blank
    // space until told to remeasure.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      cluster.clearLayers();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      userLayerRef.current = null;
      routeLayerRef.current = null;
      markers.clear();
      idOfMarker.clear();
      // 맵이 새로 만들어지면 시작 화면도 다시 위례여야 한다. 이 값을 남겨 두면
      // StrictMode 의 이중 마운트에서 두 번째 마운트가 '이미 맞춘 상태'로 보여
      // 첫 화면 규칙이 통째로 어긋난다.
      fittedKeyRef.current = null;
      centeredOnUserRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;

    // 열려 있던 팝업은 그대로 둔다. 필터에서 빠진 곳의 팝업은 마커가 지도에서
    // 사라지면서 Leaflet 이 함께 닫고, 좌표 위에 직접 띄운 팝업(겹친 곳)은
    // 마커에 매여 있지 않아 남지만 — 그 카드는 방금 사용자가 연 것이고,
    // 닫는 버튼이 있다.
    const toAdd: L.Marker[] = [];
    const toRemove: L.Marker[] = [];
    markersRef.current.forEach((marker, id) => {
      const shouldShow = visibleIds.has(id);
      const isOnMap = cluster.hasLayer(marker);
      if (shouldShow && !isOnMap) toAdd.push(marker);
      if (!shouldShow && isOnMap) toRemove.push(marker);
    });
    if (toRemove.length) cluster.removeLayers(toRemove);
    if (toAdd.length) cluster.addLayers(toAdd);

    // 검색·필터로 남은 곳들에 화면을 맞춘다. 마천역 시설만 골랐는데 화면은
    // 위례에 머물러 있으면, 목록에는 있는데 지도에는 없는 것처럼 보인다.
    //
    // 내용이 실제로 바뀔 때만 움직인다. visibleIds 는 렌더마다 새 Set 이고
    // 정렬 순서도 바뀌므로, 정렬한 id 목록을 키로 쓴다 — 정렬 기준을 바꿨을
    // 뿐인데 지도가 튀지 않아야 한다. 첫 실행은 건너뛴다: 시작 화면은 위례
    // 중심이어야 하고, 그때의 결과는 '전체'라 전 지역이 잡혀 버린다.
    const key = [...visibleIds].sort().join(",");
    if (fittedKeyRef.current === null || fittedKeyRef.current === key) {
      fittedKeyRef.current = key;
      return;
    }
    fittedKeyRef.current = key;

    const points = places
      .filter((p) => visibleIds.has(p.id) && p.lat != null && p.lng != null)
      .map((p) => [p.lat, p.lng] as L.LatLngTuple);
    if (points.length) map.fitBounds(L.latLngBounds(points), FIT_OPTIONS);
    // 결과가 없거나 전부 좌표가 없으면 화면을 건드리지 않는다. 빈 지도로
    // 튀는 것보다 보던 화면이 그대로 있는 편이 낫다.
  }, [visibleIds, places]);

  // 묶이고 갈라질 때마다 마커 DOM 이 새로 만들어진다. 그때마다 선택 표시를
  // 다시 입히지 않으면, 확대해서 드러난 마커의 강조가 사라진다. 필터가 바뀌어
  // 마커가 다시 붙을 때도 마찬가지라 `visibleIds` 를 함께 본다.
  useEffect(() => {
    const cluster = clusterRef.current;
    applyActiveMarker();
    if (!cluster) return;
    cluster.on("animationend", applyActiveMarker);
    return () => {
      cluster.off("animationend", applyActiveMarker);
    };
  }, [applyActiveMarker, visibleIds]);

  /**
   * 고른 곳을 지도에서 연다. 되돌리는 함수는 아직 기다리는 중이던 것을 끊는다.
   *
   * markercluster 의 `zoomToShowLayer` 를 쓰지 않는다. 그 함수는 확대해도
   * 마커가 드러나지 않으면 마지막에 `spiderfy()` 를 부르는데, 펼치기는 걷어낸
   * 동작이다(`clusterListHTML` 주석). 같은 일을 세 갈래로 나눈다.
   *
   *   1. 이미 홀로 서 있으면 그대로 연다.
   *   2. 확대하면 갈라지는 묶음 안이면 그 범위로 확대하고, 다시 1부터 본다.
   *      한 번에 끝나지 않는다 — 가든파이브처럼 갈라지는 묶음 안에 다시
   *      좌표가 같은 아홉 곳이 들어 있으면 두 단계를 거친다.
   *   3. 어떤 배율에서도 갈라지지 않으면 그 좌표 위에 팝업만 연다. 배지는
   *      숫자인 채로 두고, 어느 곳인지는 팝업의 이름이 말한다.
   *
   * 기다리는 방식(`moveend` 와 `animationend` 를 함께 걸고 `_inZoomAnimation`
   * 으로 거른다)은 `zoomToShowLayer` 가 쓰던 것 그대로다. 확대 애니메이션
   * 도중에는 마커 DOM 이 아직 제자리가 아니라, 한쪽만 보면 2번을 3번으로
   * 잘못 읽고 팝업이 엉뚱한 배율에서 열린다.
   */
  const revealPlace = useCallback(
    (id: string) => {
      const map = mapRef.current;
      const group = clusterRef.current;
      const marker = markersRef.current.get(id);
      const place = places.find((p) => p.id === id);
      if (!map || !group || !marker || !place || !group.hasLayer(marker)) return;

      // 확대는 매번 배율을 올리므로 3번에서 멈추지만, 라이브러리가 바뀌어도
      // 여기서 무한히 돌지는 않게 횟수를 막아 둔다.
      let tries = 0;
      let waiting = false;

      const settled = () => {
        const parent = parentClusterOf(marker);
        if (!map.hasLayer(marker) && !(parent && map.hasLayer(parent))) return;
        if (clusterAnimating(group)) return;
        stopWaiting();
        step();
      };

      const stopWaiting = () => {
        if (!waiting) return;
        waiting = false;
        map.off("moveend", settled);
        group.off("animationend", settled);
      };

      const step = () => {
        if (map.hasLayer(marker)) {
          marker.openPopup();
          applyActiveMarker();
          return;
        }

        const parent = parentClusterOf(marker);
        if (parent && tries < 4 && splitsOnZoom(parent, clusterMaxZoom(group, map))) {
          tries += 1;
          waiting = true;
          map.on("moveend", settled);
          group.on("animationend", settled);
          parent.zoomToBounds();
          return;
        }

        L.popup(CLUSTER_POPUP_OPTIONS)
          .setLatLng(marker.getLatLng())
          .setContent(popupHTML(place))
          .openOn(map);
      };

      step();
      return stopWaiting;
    },
    [applyActiveMarker, places]
  );

  useEffect(() => {
    revealPlaceRef.current = revealPlace;
  }, [revealPlace]);

  // 목록에서 고른 곳을 지도에서 연다. 묶여 있어도 `revealPlace` 가 끝까지
  // 데려간다 — 겹친 아홉 곳 중 다섯 번째도 이 경로로 열린다.
  useEffect(() => {
    if (!selectedId) return;
    // 마커를 직접 눌러서 고른 것이라면 팝업은 마커 핸들러가 이미 열었고 화면도
    // 사용자가 맞춰 둔 상태다. 여기서 다시 화면을 움직이면 방금 누른 마커가
    // 발밑에서 움직인다.
    if (fromMarkerRef.current) {
      fromMarkerRef.current = false;
      applyActiveMarker();
      return;
    }
    return revealPlace(selectedId);
  }, [selectedId, applyActiveMarker, revealPlace]);

  /**
   * 부채꼴에 지금 방향을 입힌다.
   *
   * 나침반이 없으면 GPS 가 주는 진행 방향으로 물러선다 — 그건 걷고 있을 때만
   * 나오므로, 자력계 없는 기기에서는 서면 부채꼴이 조용히 사라진다. 둘 다
   * 없으면 그리지 않는다. 방향은 있으면 편한 것이지 없으면 못 걷는 것이 아니라,
   * 없다는 안내도 하지 않는다.
   *
   * 마커를 다시 만들지 않고 `transform` 만 고쳐 쓴다(`userLocationIcon` 주석).
   */
  const applyHeading = useCallback(() => {
    const cone = userMarkerRef.current
      ?.getElement()
      ?.querySelector<HTMLElement>(".user-location-cone");
    if (!cone) return;
    const deg = headingDeg ?? userCoords?.heading ?? null;
    cone.classList.toggle("is-on", deg != null);
    if (deg != null) cone.style.transform = `rotate(${deg.toFixed(1)}deg)`;
  }, [headingDeg, userCoords?.heading]);

  /** 마커를 만드는 이펙트에서 부른다. 각도를 의존성으로 넣으면 각도가 바뀔
      때마다 마커가 새로 붙어, 고치려던 문제를 그대로 되살린다. */
  const applyHeadingRef = useRef(applyHeading);
  useEffect(() => {
    applyHeadingRef.current = applyHeading;
    applyHeading();
  }, [applyHeading]);

  // 나침반도 길찾기 중에만 문다. 위치와 같은 이유(배터리)이고, 방향이 실제로
  // 쓸모 있는 순간도 걷기 시작할 때뿐이다.
  useEffect(() => {
    if (!routeToId) return;
    return watchHeading();
  }, [routeToId, watchHeading]);

  // 내 위치 마커. 정확도가 흐릴 때는 오차 원을 함께 그린다 — 점 하나로
  // 단정해 두면 200m 오차를 200m 인 줄 모르고 거리를 믿게 된다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLayerRef.current) {
      map.removeLayer(userLayerRef.current);
      userLayerRef.current = null;
    }
    if (!userCoords) return;

    const group = L.layerGroup();
    if (userCoords.accuracy > ACCURACY_CIRCLE_MIN_M) {
      L.circle([userCoords.lat, userCoords.lng], {
        radius: userCoords.accuracy,
        color: color.accent,
        weight: 1,
        opacity: 0.4,
        fillColor: color.accent,
        fillOpacity: 0.08,
      }).addTo(group);
    }
    const marker = L.marker([userCoords.lat, userCoords.lng], {
      icon: userLocationIcon(),
      zIndexOffset: 1000,
      interactive: false,
    }).addTo(group);
    group.addTo(map);
    userLayerRef.current = group;
    userMarkerRef.current = marker;
    // 좌표가 바뀌어 마커를 다시 그렸으면 방향도 다시 입힌다 — 위 이펙트는
    // 각도가 바뀔 때만 도는데, 걷는 동안 각도보다 좌표가 먼저 바뀔 수 있다.
    applyHeadingRef.current();

    // 첫 좌표를 받았을 때 한 번만 화면을 옮긴다. 이후에도 따라다니면 지도를
    // 끌어 둔 자리가 자꾸 되돌아간다.
    if (!centeredOnUserRef.current && !outOfCoverage) {
      centeredOnUserRef.current = true;
      map.setView([userCoords.lat, userCoords.lng], HOME_ZOOM);
    }
  }, [userCoords, outOfCoverage]);

  /**
   * 경로를 받아 지도에 그리고 결과를 돌려준다.
   *
   * 상태 갱신은 하지 않는다 — 부르는 쪽이 `.then` 에서 한다. 이펙트 본문에서
   * 곧바로 setState 하는 모양이 되면 렌더가 연쇄로 도는 데다, 지금 무엇이
   * 상태를 바꾸는지도 읽기 어려워진다.
   */
  const runRoute = useCallback(
    (from: UserCoords, avoidStairs: boolean): Promise<WalkRoute | null> => {
      const map = mapRef.current;
      const place = places.find((p) => p.id === routeToId);
      if (!map || !place || place.lat == null || place.lng == null) return Promise.resolve(null);

      const destLat = place.lat;
      const destLng = place.lng;
      const token = requestTokenRef.current;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

      return fetchWalkRoute(
        { lat: from.lat, lng: from.lng },
        { lat: destLat, lng: destLng },
        { avoidStairs, signal: controller.signal }
      )
        .then((route) => {
          // 목적지가 그새 바뀌었으면 그린 것도 결과도 버린다.
          if (token !== requestTokenRef.current) return null;

          const group = L.layerGroup();
          // A light "casing" line under the accent line gives the route a halo so
          // it stays legible over the basemap's own busy road colors/labels.
          L.polyline(route.points, {
            color: color.paper,
            weight: 9,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(group);
          L.polyline(route.points, {
            color: color.accent,
            weight: 5,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(group);
          group.addTo(map);
          routeLayerRef.current = group;

          map.fitBounds(L.latLngBounds([from.lat, from.lng], [destLat, destLng]), {
            padding: [48, 48],
          });

          return route;
        })
        .finally(() => clearTimeout(timer));
    },
    [places, routeToId]
  );

  /** 경로를 그리고 결과를 화면 상태로 옮긴다. 토큰이 지난 요청은 조용히 버린다. */
  const startRouting = useCallback(
    (from: UserCoords, avoidStairs = true) => {
      const token = requestTokenRef.current;
      return runRoute(from, avoidStairs)
        .then((route) => {
          if (token !== requestTokenRef.current || !route) return;
          setRouteState({ kind: "done", route });
        })
        .catch((err: unknown) => {
          if (token !== requestTokenRef.current) return;
          // 실패 사유는 요청 계층이 붙여서 던진다. 계단을 피할 길이 없는 것과
          // 서버에 닿지 못한 것은 사용자가 볼 화면이 다르다.
          setRouteState({
            kind: "error",
            reason: err instanceof RouteFetchError ? err.reason : "network",
          });
        });
    },
    [runRoute]
  );

  /** 확인 카드의 버튼과 '다시 시도'가 함께 쓰는 경로. */
  const locateThenRoute = useCallback(
    async (avoidStairs = true) => {
      const token = requestTokenRef.current;
      setRouteState({ kind: "loading" });
      // 방향 허락도 여기서 함께 묻는다 — 지금 누른 이 탭이 제스처다.
      void requestHeading();
      const result = await onRequestLocation();
      if (token !== requestTokenRef.current) return;
      if (!result.ok) {
        // 실패 사유는 결과에 실려 온다. 여기서 `locationStatus` 를 읽으면
        // 아직 이전 값이라, 방금 거부한 사람에게 "다시 시도" 를 권하게 된다.
        setRouteState({
          kind: "error",
          reason: result.reason === "denied" ? "denied" : "position",
        });
        return;
      }
      await startRouting(result.coords, avoidStairs);
    },
    [onRequestLocation, requestHeading, startRouting]
  );

  // 길찾기를 열 때마다 따라가기를 다시 켠다. 앞선 길찾기에서 지도를 끌어
  // 풀어 두었더라도, 새로 시작한 길에서는 따라가는 것이 기본이다.
  useEffect(() => {
    followRef.current = routeToId != null;
    followedRef.current = null;
  }, [routeToId]);

  // 길찾기 중에는 지도가 내 점을 따라간다. 다만 갱신마다 가운데로 끌어오지는
  // 않는다 — 5m 마다 지도가 들썩이면 읽을 수 없다. 점이 가운데 절반 밖으로
  // 나갔을 때만 옮기므로, 걷는 동안 지도는 몇 걸음에 한 번씩만 움직인다.
  //
  // 첫 좌표에서는 움직이지 않는다. 경로를 그리며 맞춘 화면(출발지~목적지
  // 전체)이 그때 막 잡힌 것이라, 곧바로 내 점으로 당기면 방금 보여 준 전체
  // 그림을 한 프레임 만에 뺏는 셈이 된다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeToId || !userCoords || !followRef.current) return;

    const here = L.latLng(userCoords.lat, userCoords.lng);
    if (!followedRef.current) {
      followedRef.current = here;
      return;
    }
    followedRef.current = here;

    if (map.getBounds().pad(-0.25).contains(here)) return;
    map.panTo(here, { animate: true, duration: 0.6 });
  }, [userCoords, routeToId]);

  // 목적지가 바뀌면 이전 경로를 걷어내고, 좌표가 이미 있으면 곧바로 요청을
  // 건다. 무엇을 띄울지는 위 렌더 구간에서 이미 정해졌고 여기서는 지도를
  // 손보는 일만 한다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    // Starting a route shows its own ask-card; the marker popup opened by
    // card selection would otherwise overlap it and double up as two
    // separate "modals" fighting for attention on the map.
    if (routeToId) map.closePopup();
    requestTokenRef.current += 1;

    if (routeToId && userCoords) void startRouting(userCoords);
    // 목적지가 바뀔 때만 새로 시작한다. userCoords 가 뒤늦게 들어와도 여기서
    // 다시 그리지 않는다 — 그 경우는 사용자가 확인 카드를 누른 것이고,
    // locateThenRoute 가 이어서 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeToId]);

  // Clicking anywhere else — the map itself, a different place's card, the
  // search box — dismisses the route card, same as tapping its own × would.
  // Clicks on a "길찾기" button are excluded so switching straight to a new
  // target while a card is already open works instead of just closing it.
  // 지도 위의 다른 UI(내 위치 버튼·안내 배너)도 제외한다 — 그것들을 누른 것은
  // 경로를 지우겠다는 뜻이 아니다.
  useEffect(() => {
    if (!routeToId) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (routeUiRef.current?.contains(target)) return;
      if (target.closest(".place-foot .btn")) return;
      if (target.closest(".map-ui")) return;
      onClearRoute();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [routeToId, onClearRoute]);

  /**
   * 잠금을 푼다. Leaflet 은 Drag 핸들러가 켜질 때만 컨테이너에
   * `.leaflet-touch-drag`(→ `touch-action: pinch-zoom`)를 붙이므로, 잠겨 있는
   * 동안에는 `.leaflet-touch-zoom` 의 `pan-x pan-y` 만 남아 세로 스와이프가
   * 페이지 스크롤로 그대로 흘러간다. 두 손가락 확대는 잠긴 동안에도 된다.
   */
  const unlockMap = useCallback(() => {
    mapRef.current?.dragging.enable();
    setMapLocked(false);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLocked) return;
    // 마커·클러스터 클릭은 전파가 멎으므로 여기까지 오지 않는다 — 마커를
    // 고르려던 탭이 잠금 해제로 소모되지 않는다.
    map.on("click", unlockMap);
    return () => {
      map.off("click", unlockMap);
    };
  }, [mapLocked, unlockMap]);

  const handleLocateClick = useCallback(async () => {
    // iOS 는 나침반도 따로 허락을 받아야 하고, 그 요청은 **사용자 제스처
    // 안에서만** 통한다(`useHeading` 머리말). 이 버튼과 길찾기 확인 버튼이
    // 그 자리다. 거절해도 위치는 그대로 되므로 결과를 기다리지 않는다.
    void requestHeading();
    const result = await onRefreshLocation();
    const map = mapRef.current;
    if (!result.ok || !map) return;
    map.setView([result.coords.lat, result.coords.lng], Math.max(map.getZoom(), HOME_ZOOM));
    // 이 버튼은 "내 위치를 보여 달라"는 말이다. 길찾기 중에 지도를 끌어
    // 따라가기를 풀어 두었더라도, 여기서 다시 켜는 것이 그 말에 맞다.
    followRef.current = true;
    followedRef.current = L.latLng(result.coords.lat, result.coords.lng);
  }, [onRefreshLocation, requestHeading]);

  /** 안내 목록에서 한 단계를 누르면 그 지점을 보여 준다. */
  const showStep = useCallback((point: [number, number]) => {
    const map = mapRef.current;
    // 전체 경로를 담느라 축소된 화면에서는 "여기서 좌회전" 이 어디를 말하는지
    // 알 수 없다. 그래도 STEP_ZOOM 을 넘기지는 않는다 — 그 위로는 도로명이
    // 사라져서, 붙을수록 오히려 어디인지 알기 어려워진다.
    map?.setView(point, STEP_ZOOM);
  }, []);

  const routeTarget = routeToId ? places.find((p) => p.id === routeToId) : undefined;
  const locating = locationStatus === "locating";

  return (
    <>
      <div ref={containerRef} id="map" />

      {/* 지도 위에 뜨는 것은 한 번에 하나만 둔다. 길찾기 카드가 열려 있는 동안
          권유 배너와 커버리지 안내를 함께 띄우면, 좁은 화면에서 서로 겹치고
          무엇에 답해야 하는지도 흐려진다. 길찾기가 지금 하려는 일이므로 그쪽이
          이긴다 — 배너는 카드를 닫으면 그대로 돌아온다. */}
      {/* 테스트 위치는 조용히 켜져 있으면 안 된다. 진짜 위치인 줄 알고 판단하는
          것이 이 기능의 유일한 위험이므로, 켜져 있는 동안 계속 보이게 둔다.
          길찾기 카드에 밀려 사라지지도 않는다 — 그때가 오히려 헷갈리기 쉽다. */}
      {mockLocation && (
        <p className="mock-badge map-ui">
          테스트 위치 사용 중 <span>실제 내 위치가 아니에요</span>
        </p>
      )}

      {/* 잠겨 있다는 사실을 말해 주지 않으면, 지도를 끌어 보고 안 움직이는
          것을 고장으로 읽는다. 지도 위에 다른 것이 떠 있을 때는 양보한다 —
          길찾기와 커버리지 안내가 지금 답해야 할 물음이고, 이건 참고다. */}
      {mapLocked && !routeToId && !outOfCoverage && (
        <button type="button" className="map-lock-hint map-ui" onClick={unlockMap}>
          지도를 눌러 움직이기
        </button>
      )}

      {!routeToId && locationStatus === "idle" && (
        <div className="locate-invite surface-float map-ui">
          <WalkIcon size={iconSize.md} className="icon-badge" aria-hidden />
          <p>내 주변부터 볼까요? 가까운 순으로 목록을 정렬해 드려요.</p>
          <button type="button" className="btn btn-primary" onClick={() => void onRequestLocation()}>
            위치 허용
          </button>
        </div>
      )}

      {!routeToId && outOfCoverage && (
        <div className="coverage-note surface-float map-ui" role="status">
          위례 생활권에서 멀리 떨어져 있어요. 지도는 위례를 보여 드립니다.
        </div>
      )}

      <button
        type="button"
        className="map-locate map-ui"
        onClick={() => void handleLocateClick()}
        disabled={locating || locationStatus === "denied"}
        aria-label={locating ? "위치 확인 중" : "내 위치로 이동"}
        title={
          locationStatus === "denied"
            ? "위치 권한이 꺼져 있어요. 주소창의 자물쇠에서 켤 수 있습니다."
            : "내 위치로 이동"
        }
      >
        {locating ? (
          <span className="spinner" aria-hidden />
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            <circle cx="12" cy="12" r="3.4" />
            <circle cx="12" cy="12" r="8.4" />
            <path d="M12 1.4v2.4M12 20.2v2.4M22.6 12h-2.4M3.8 12H1.4" />
          </svg>
        )}
      </button>

      {routeToId && routeState.kind === "confirm" && (
        <div className="route-ask surface-float" ref={routeUiRef}>
          <button className="btn-icon route-ask-close" onClick={onClearRoute} aria-label="길찾기 닫기">
            ×
          </button>
          <WalkIcon size={iconSize.xl} className="route-ask-icon icon-badge" aria-hidden />
          <h4>{routeTarget ? `${routeTarget.name}까지 길찾기` : "길찾기"}</h4>
          <p>위치 권한을 허용하면 지금 계신 곳에서부터 도보 경로를 보여드려요.</p>
          <button className="btn btn-primary" onClick={() => void locateThenRoute()}>
            <RouteGlyph size={15} /> 위치 허용하고 시작
          </button>
        </div>
      )}

      {routeToId && (routeState.kind === "loading" || routeState.kind === "error") && (
        <div className="route-status surface-float" role="status" ref={routeUiRef}>
          {routeState.kind === "loading" ? (
            <>
              <span className="spinner" aria-hidden />
              <span>경로 찾는 중…</span>
            </>
          ) : (
            <>
              <span>{ROUTE_ERROR_TEXT[routeState.reason]}</span>
              {/* 실패마다 사용자가 할 수 있는 일이 다르므로 버튼도 달라진다.
                  · noroute        — 다시 눌러도 같은 답이다. 계단을 허용할지 물어본다
                  · denied·toofar  — 이 화면에서 되돌릴 수 없다. 버튼 없음
                  · 나머지         — 서버·통신 문제라 재시도가 통한다 */}
              {routeState.reason === "noroute" ? (
                <button
                  className="btn btn-quiet route-retry"
                  onClick={() => void locateThenRoute(false)}
                >
                  계단 포함해서 보기
                </button>
              ) : routeState.reason === "toofar" && routeTarget?.naverUrl ? (
                // 걸어갈 거리가 아니면 우리가 해 줄 수 있는 게 없다. 대중교통을
                // 다루는 도구로 넘기는 것이 빈손으로 돌려보내는 것보다 낫다.
                <a
                  className="btn btn-quiet route-retry is-naver"
                  href={routeTarget.naverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  네이버 지도 열기
                </a>
              ) : RETRYABLE.has(routeState.reason) ? (
                <button className="btn btn-quiet route-retry" onClick={() => void locateThenRoute()}>
                  다시 시도
                </button>
              ) : null}
            </>
          )}
          <button className="btn-icon" onClick={onClearRoute} aria-label="경로 지우기">
            ×
          </button>
        </div>
      )}

      {/* 로딩·실패에는 role="status" 가 있었는데 성공 카드에는 없어서, 스크린리더
          사용자는 "경로 찾는 중…" 다음이 조용했다. 결과야말로 들려야 하는 말이다. */}
      {routeToId && routeState.kind === "done" && (
        <div className="route-result surface-float" role="status" ref={routeUiRef}>
          <WalkIcon size={iconSize.lg} className="route-result-icon icon-badge" aria-hidden />
          <div className="route-result-text">
            <b>도보 약 {formatDuration(routeState.route.durationMin)}</b>
            <span>
              {routeTarget?.name ?? "목적지"}까지 ·{" "}
              {routeState.route.distanceM >= 1000
                ? `${(routeState.route.distanceM / 1000).toFixed(1)}km`
                : `${routeState.route.distanceM}m`}
            </span>
            {/* 계단을 다루는 방식이 경로마다 다르므로 문구도 갈린다. 이 말은
                경로를 보는 이 자리에 있어야 한다 — 페이지 맨 아래 이용 안내는
                이미 걷기 시작한 사람에게 닿지 않는다.
                "계단 없는 경로" 라고 쓰지 않는 이유는 routing.ts 에 적어 두었다:
                우리가 아는 건 지도에 등록된 계단뿐이다. */}
            <em className="route-result-caveat" data-tone={routeState.route.avoidsStairs ? "ok" : "warn"}>
              {routeState.route.avoidsStairs
                ? "계단·급경사를 피한 경로"
                : "계단이 포함된 경로예요"}
            </em>
          </div>

          {/* 선만 그려 두면 전체 모양은 보여도 어디서 꺾는지를 알 수 없다.
              기본은 접어 둔다 — 지도를 가리지 않으면서, 필요한 사람은 한 번
              눌러 펼치게. */}
          {routeState.route.steps.length > 0 && (
            <button
              type="button"
              className="btn btn-quiet route-steps-toggle"
              aria-expanded={stepsOpen}
              aria-controls="route-steps"
              onClick={() => setStepsOpen((v) => !v)}
            >
              길 안내 {routeState.route.steps.length}
              <span className="route-steps-caret" aria-hidden>
                {stepsOpen ? "▴" : "▾"}
              </span>
            </button>
          )}

          <button className="btn-icon" onClick={onClearRoute} aria-label="경로 지우기">
            ×
          </button>

          {stepsOpen && routeState.route.steps.length > 0 && (
            <ol className="route-steps" id="route-steps">
              {routeState.route.steps.map((step, i) => (
                <li key={`${i}-${step.text}`}>
                  {/* 누르면 그 지점으로 지도를 옮긴다. 목록을 읽다가 "여기가
                      어디지" 싶을 때 지도로 되돌아갈 길을 열어 둔다. */}
                  <button type="button" onClick={() => showStep(step.point)}>
                    <span className="route-step-n">{i + 1}</span>
                    <span className="route-step-text">{step.text}</span>
                    {step.distanceM > 0 && (
                      <span className="route-step-dist">
                        {step.distanceM >= 1000
                          ? `${(step.distanceM / 1000).toFixed(1)}km`
                          : `${step.distanceM}m`}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}
