"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Place, PlaceType, chipsFor, places, splitName, typeMeta, whereOf } from "@/data/places";
import { BrandIcon, IconComponent, NoticeIcon, RouteGlyph, iconSize, typeIcons } from "@/lib/typeIcons";
import { distanceM, formatDistance, isWithinCoverage } from "@/lib/geo";
import { useMockLocation } from "@/lib/mockLocation";
import { useUserLocation } from "@/lib/useUserLocation";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const typeOrder: PlaceType[] = ["nursing", "ramp", "elevator", "restaurant"];

const filterOptions: { type: PlaceType | "all"; label: string; Icon?: IconComponent }[] = [
  { type: "all", label: "전체" },
  ...typeOrder.map((type) => ({
    type,
    label: typeMeta[type].label,
    Icon: typeIcons[type],
  })),
];

/**
 * 카드에 노출할 태그 수. 길찾기 버튼과 한 줄에 나란히 앉을 만큼만 — 나머지는
 * 마커 팝업에서 전부 보여 준다.
 *
 * **2 다.** 3 이던 값은 실제로 한 줄에 앉지 못했다: `.place-foot` 폭이 285px
 * 인데 칩 세 개(207) + 길찾기(82) + 간격(8)이 297px 라 12px 넘쳤고, 목록 앞
 * 여덟 장 중 넷이 두 줄로 접혀 카드 높이 편차가 123px(125~248)까지 벌어졌다.
 * 칩 순서는 이미 중요도로 편집되어 있으므로(`chipsFor`) 앞 둘이 알맹이다.
 */
const MAX_CARD_CHIPS = 2;

type SortKey = "distance" | "name";

// 메뉴까지 검색에 넣는다 — 식당이 50곳으로 늘면서 "칼국수", "돈카츠" 처럼
// 먹고 싶은 것으로 찾는 게 이름으로 찾는 것만큼 자연스러워졌다.
function matches(p: Place, query: string) {
  const haystack = [p.name, p.station, p.location, p.address, p.summary, p.menu, p.extra]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<PlaceType | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeToId, setRouteToId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("distance");

  const mapCardRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 방금의 선택이 어디서 왔는가. 목록과 지도가 서로를 끌어당기다 부딪히는 것을
      막는다 — 카드를 눌렀으면 지도를 보여 주고, 마커를 눌렀으면 카드를 보여 준다. */
  const selectSourceRef = useRef<"list" | "map">("list");

  // `?loc=위례` 같은 테스트 위치. 위례에 가 있지 않아도 길찾기를 확인할 수 있게
  // 하는 장치이고, 켜져 있는 동안 지도에 배지가 뜬다.
  const mockCoords = useMockLocation();
  const location = useUserLocation({ override: mockCoords });
  /** 목록 정렬과 카드의 거리가 쓰는 기준점. 걷는 동안에는 움직이지 않는다. */
  const userCoords = location.coords;

  // 길찾기가 열려 있는 동안에만 위치를 계속 따라간다. 사용자가 실제로 걷고
  // 있다고 말할 수 있는 구간이 여기뿐이라, GPS 를 켜 두는 구간도 여기까지다
  // (`useUserLocation` 머리말). 좌표를 이미 확보한 뒤에만 켜는 이유는,
  // `watchPosition` 도 권한창을 띄우기 때문이다 — 권한은 확인 카드가 묻는다.
  const startWatch = location.watch;
  useEffect(() => {
    if (!routeToId || !userCoords) return;
    return startWatch();
  }, [routeToId, userCoords, startWatch]);

  // 좌표가 없으면 거리순은 계산할 수 없다. 토글은 사용자의 '의도'를 들고 있고
  // 실제로 무엇으로 정렬되는지는 좌표 유무가 정한다 — 나중에 위치를 허용하면
  // 다시 묻지 않고 곧바로 거리순으로 넘어간다.
  const effectiveSort: SortKey = userCoords && sortBy === "distance" ? "distance" : "name";

  // 검색만 적용한 결과. 필터 칩의 개수 배지는 이 집합을 세므로, 칩을 누르기
  // 전에도 "이 검색어에 수유실이 몇 개인지"를 미리 알 수 있다.
  const searchMatched = useMemo(() => {
    const query = search.trim().toLowerCase();
    return places.filter((p) => matches(p, query));
  }, [search]);

  const counts = useMemo(() => {
    const base: Record<PlaceType | "all", number> = {
      all: searchMatched.length,
      nursing: 0,
      ramp: 0,
      elevator: 0,
      restaurant: 0,
    };
    for (const p of searchMatched) base[p.type] += 1;
    return base;
  }, [searchMatched]);

  /** 내 위치에서의 직선거리(m). 좌표가 없는 곳은 값이 없다. */
  const distances = useMemo(() => {
    const out = new Map<string, number>();
    if (!userCoords) return out;
    for (const p of places) {
      if (p.lat == null || p.lng == null) continue;
      out.set(p.id, distanceM(userCoords, { lat: p.lat, lng: p.lng }));
    }
    return out;
  }, [userCoords]);

  const visiblePlaces = useMemo(() => {
    const filtered = searchMatched.filter((p) => activeType === "all" || p.type === activeType);
    if (effectiveSort === "name") {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    // 좌표가 없는 곳은 숨기지 않고 맨 뒤로 보낸다. 거리를 모른다는 것이
    // 목록에서 빠질 이유는 아니다 — 네이버 지도로 넘어가는 길이 있다.
    return [...filtered].sort((a, b) => {
      const da = distances.get(a.id) ?? Infinity;
      const db = distances.get(b.id) ?? Infinity;
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [searchMatched, activeType, effectiveSort, distances]);

  const visibleIds = useMemo(() => new Set(visiblePlaces.map((p) => p.id)), [visiblePlaces]);

  // 좌표가 있는 곳만 지도에 찍힌다. 식당 조사자료는 아직 주소만 있는 항목이
  // 남아 있어, 목록에 보이는 수와 지도에 찍히는 수가 다르다. 그 차이를 숨기지
  // 않고 요약줄에 그대로 적는다.
  const mappedCount = useMemo(
    () => visiblePlaces.filter((p) => p.lat != null && p.lng != null).length,
    [visiblePlaces]
  );

  const outOfCoverage = userCoords != null && !isWithinCoverage(userCoords);

  function resetFilters() {
    setSearch("");
    setActiveType("all");
  }

  /** 카드에서 골랐다. 모바일은 지도가 목록 위에 있어 스크롤 밖일 수 있으므로,
      팝업이 열릴 자리를 함께 보여 준다. 데스크톱에서는 지도가 늘 보이므로
      `nearest` 가 아무 일도 하지 않는다. */
  function selectFromList(id: string) {
    selectSourceRef.current = "list";
    setSelectedId(id);
    mapCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /** 지도의 마커에서 골랐다. 목록 쪽을 맞춰 주는 일은 아래 이펙트가 한다. */
  function selectFromMap(id: string) {
    selectSourceRef.current = "map";
    setSelectedId(id);
  }

  // 마커를 눌러 고르면 그게 목록의 어느 카드인지 알 수 없었다. 지도에서 온
  // 선택일 때만 카드를 보이는 자리로 끌어온다 — 카드에서 온 선택까지 여기서
  // 스크롤하면 방금 누른 카드가 발밑에서 움직인다.
  useEffect(() => {
    if (!selectedId || selectSourceRef.current !== "map") return;
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>(`[data-place-id="${selectedId}"]`);
    if (!list || !card) return;

    // 목록이 자체 스크롤을 가진 데스크톱에서만 움직인다. 모바일은 목록이 페이지
    // 스크롤에 합류해 있어(§6 RESPONSIVE), `scrollIntoView` 가 문서 전체를
    // 끌어 버린다 — 지도를 탭한 사람을 2200px 아래 카드로 데려가고, 지도는
    // 화면 밖으로 나가면서 방금 연 팝업까지 함께 사라졌다.
    if (list.scrollHeight <= list.clientHeight) return;

    // 컨테이너 안에서만 옮긴다. 조상까지 훑는 `scrollIntoView` 와 달리 페이지는
    // 건드리지 않는다.
    const cr = card.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    if (cr.top < lr.top) list.scrollBy({ top: cr.top - lr.top, behavior: "smooth" });
    else if (cr.bottom > lr.bottom)
      list.scrollBy({ top: cr.bottom - lr.bottom, behavior: "smooth" });
  }, [selectedId]);

  function handleSort(key: SortKey) {
    // 권한이 거부된 상태에서 '가까운 순'은 눌려도 아무 일도 하지 않는다.
    // 이유는 바로 아래 `sort-note` 가 계속 말하고 있다.
    if (key === "distance" && location.status === "denied") return;
    setSortBy(key);
    // 아직 위치가 없으면 여기서 물어본다. 비활성 버튼으로 막아 두면 무엇을
    // 눌러야 거리순이 켜지는지 알 수 없다.
    if (key === "distance" && !userCoords) void location.request();
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            <BrandIcon size={iconSize.lg} className="icon-badge" aria-hidden />
            <span className="brand-text">
              <span className="brand-eyebrow">청년기획봉사 · 영유아 부모 캠페인</span>
              <h1 className="brand-name">위례 아이편한 지도</h1>
            </span>
          </div>
          {/* 브랜드 락업 오른쪽이 아니라 그 아래 한 줄을 통째로 쓴다. 이 길이
              (76자)는 어떻게 해도 한 줄에 앉지 않는데, 오른쪽에 두면 두세 줄로
              접히면서 락업과 시각적 무게가 비슷해져 헤더의 위계가 흐려진다.
              폭을 다 쓰면 접히는 줄 수가 줄고, 읽는 순서도 이름 → 설명이 된다. */}
          <p className="header-tagline">
            위례동과 인접 생활권에서 아이와 함께 이동할 때 필요한 수유실, 경사로, 엘리베이터와
            영유아 친화 식당 50곳의 정보를 한눈에 확인해 보세요.
          </p>
        </div>
      </header>

      <main className="shell">
        <section className="panel surface" aria-label="시설 목록">
          <div className="panel-controls">
            <label className="sr-only" htmlFor="place-search">
              시설 검색
            </label>
            {/* 지우기 버튼을 직접 둔다. `type="search"` 의 기본 지우기 버튼은
                WebKit 에만 있어서, 크롬·파이어폭스에서는 검색어를 되돌리려면
                입력창을 눌러 전체 선택하고 지워야 했다. 한 손으로 쓰는 화면에서
                그 동작이 가장 번거롭다. */}
            <div className="search-field">
              <input
                id="place-search"
                className="search"
                type="search"
                /* 검색은 메뉴까지 훑는다(`matches`). placeholder 가 그 사실을 감추면
                   "칼국수"로 찾을 수 있다는 걸 아무도 모른다. */
                placeholder="역명 · 시설명 · 메뉴로 찾아보세요"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="btn-icon search-clear"
                  onClick={() => setSearch("")}
                  aria-label="검색어 지우기"
                >
                  ×
                </button>
              )}
            </div>

            <div className="filters" role="group" aria-label="시설 종류 필터">
              {filterOptions.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  className="filter"
                  data-type={opt.type}
                  /* 결과가 0 인 칩은 눈이 건너뛰게 한 단계 물린다. 누를 수는
                     있게 남겨 둔다 — 0 이라는 사실 자체가 답인 경우가 있고,
                     막아 두면 왜 안 눌리는지를 또 설명해야 한다. */
                  data-empty={counts[opt.type] === 0}
                  aria-pressed={activeType === opt.type}
                  onClick={() => setActiveType(opt.type)}
                >
                  {opt.Icon && <opt.Icon size={iconSize.sm} aria-hidden />}
                  {opt.label}
                  <span className="filter-count">{counts[opt.type]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 정렬 줄은 컨트롤 블록 밖에 둔다. 모바일에서 `.panel-controls` 를
              sticky 로 붙이는데, 정렬과 안내문까지 함께 고정하면 266px — 844px
              화면의 31% 를 목록을 훑는 내내 점유한다. 정렬은 한 번 정하면 다시
              건드리지 않고 안내문은 설명이라, 둘은 스크롤과 함께 흘려보낸다.
              늘 손에 있어야 하는 것은 검색과 필터다. */}
          <div className="sortbar">
              <div className="sort-row">
                <div className="sort" role="group" aria-label="목록 정렬 기준">
                  <button
                    type="button"
                    className="sort-option"
                    aria-pressed={effectiveSort === "distance"}
                    aria-describedby="sort-note"
                    /* `disabled` 가 아니라 `aria-disabled` 다. 진짜로 끄면 포커스가
                       가지 않아, 바로 옆에 붙여 둔 `sort-note` 설명을 스크린리더가
                       읽어 줄 자리가 사라진다. 눌리기는 하되 아무 일도 하지 않고
                       이유만 남긴다. */
                    aria-disabled={location.status === "denied"}
                    onClick={() => handleSort("distance")}
                  >
                    {location.status === "locating" && sortBy === "distance"
                      ? "위치 확인 중…"
                      : "가까운 순"}
                  </button>
                  <button
                    type="button"
                    className="sort-option"
                    aria-pressed={effectiveSort === "name"}
                    onClick={() => handleSort("name")}
                  >
                    이름순
                  </button>
                </div>

                {/* 결과 수. 모바일에서는 목록이 페이지 스크롤에 합류해 바닥의
                    요약줄(.panel-foot)이 카드 67장 아래로 밀려나므로, 그 숫자를
                    여기로 올린다. 데스크톱에서는 바닥 요약줄이 그 일을 하므로
                    CSS 로 감춘다.
                    이 줄은 sticky 영역 밖이라 스크롤과 함께 사라지는데, 정작
                    필요한 "지금 필터의 결과 수"는 sticky 로 남는 필터 칩의 개수
                    배지가 이미 들고 있다(활성 칩의 배지 = 목록 길이). 여기서만
                    더 말하는 것은 '지도에 몇 곳이 찍히는가' 하나다. */}
                <p className="result-count" aria-live="polite">
                  <strong>{visiblePlaces.length}</strong>곳
                  {mappedCount < visiblePlaces.length && ` · 지도 ${mappedCount}`}
                </p>
              </div>
              {/* 거리순이 왜 안 되는지, 혹은 이 숫자가 무엇인지 한 줄로 붙인다.
                  카드마다 '직선'을 적어 두지만 그 뜻은 여기서 한 번 풀어 준다. */}
              <p className="sort-note" id="sort-note">
                {location.status === "denied"
                  ? "위치 권한이 꺼져 있어 가까운 순을 쓸 수 없어요. 브라우저 주소창의 자물쇠에서 켤 수 있습니다."
                  : location.status === "unavailable"
                    ? "위치를 확인하지 못했어요. 가까운 순을 다시 눌러 보세요."
                    : userCoords
                      ? "거리는 실제 걷는 길이 아니라 직선거리예요."
                      : "가까운 순을 누르면 위치를 한 번 물어봅니다."}
              </p>
          </div>

          <div className="list" ref={listRef}>
            {visiblePlaces.length === 0 ? (
              <div className="empty">
                <BrandIcon size={iconSize.xl} className="empty-icon" aria-hidden />
                {/* 검색어가 있을 때와 필터만으로 0건이 됐을 때는 사용자가 할 일이
                    다르다. 필터만 켠 사람에게 "다른 역명으로 찾아보세요"는
                    하지도 않은 일을 다시 하라는 말이 된다. */}
                {search.trim() ? (
                  <p>
                    <strong>&lsquo;{search.trim()}&rsquo; 검색 결과가 없어요</strong>
                    다른 역명 · 시설명 · 메뉴로 찾아보시거나, 검색어를 지우고 전체를
                    둘러보세요.
                  </p>
                ) : (
                  <p>
                    <strong>{typeMeta[activeType as PlaceType]?.label ?? "해당 종류"}이(가)
                    아직 없어요</strong>
                    조사된 곳이 이 종류에는 없습니다. 필터를 지우면 다른 시설을 볼 수
                    있어요.
                  </p>
                )}
                <button type="button" className="btn btn-quiet" onClick={resetFilters}>
                  검색·필터 지우기
                </button>
              </div>
            ) : (
              visiblePlaces.map((p) => {
                const Icon = typeIcons[p.type];
                const isSelected = selectedId === p.id;
                const onMap = p.lat != null && p.lng != null;
                const dist = distances.get(p.id);
                // 제목은 구분어를 뗀 앞부분만. 구분어는 아래 줄이 받는다 —
                // 한 줄짜리 제목에 두면 잘려 나가는 게 정확히 그 부분이었다.
                const { head } = splitName(p.name);
                const where = whereOf(p);
                return (
                  <article
                    key={p.id}
                    className="place-card"
                    data-type={p.type}
                    data-place-id={p.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${p.name} · ${typeMeta[p.type].label}`}
                    onClick={() => selectFromList(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectFromList(p.id);
                      }
                    }}
                  >
                    <Icon size={iconSize.lg} className="place-icon icon-badge" aria-hidden />

                    {/* 타입 칩을 제목 줄에서 뺐다. 300px 중 84px 를 먹는데,
                        왼쪽 아이콘이 이미 같은 색·같은 모양으로 종류를 말하고
                        있어 같은 말을 두 번 하고 있었다. 그 폭을 제목이
                        가져가면서 시설명이 잘리지 않는다. 팝업에는 그대로 둔다. */}
                    <div className="place-head">
                      <h3 className="place-name">{head}</h3>
                      {/* 위치를 아는 동안에는 모든 카드가 같은 자리에 거리를 갖는다.
                          좌표가 없는 곳만 비워 두면 그 카드만 줄이 어긋난다. */}
                      {userCoords &&
                        (dist != null ? (
                          <span className="place-distance">
                            <span className="place-distance-kind">직선</span>{" "}
                            {formatDistance(dist)}
                          </span>
                        ) : (
                          <span className="place-distance is-unknown">위치 미확인</span>
                        ))}
                    </div>

                    <div className="place-detail">
                      {/* 역 시설은 승강장·출구가 곧 이 카드를 옆 카드와 가르는
                          정보다. 라벨("위치") 없이 제목 바로 아래 붙여 부제처럼
                          읽히게 한다. 식당은 그 자리에 한 줄 소개가 온다. */}
                      {where ? (
                        <p className="place-where">{where}</p>
                      ) : p.summary ? (
                        <p className="place-summary">{p.summary}</p>
                      ) : null}
                      {/* 라벨을 떼었다. 위치 행이 부제로 올라간 뒤 남은 메타는
                          주소 하나뿐인데, 2.4em 라벨 열이 값을 40px 들여쓰기해
                          제목·부제·요약(모두 0에서 시작)과 왼쪽 정렬선이
                          어긋났다. 주소는 형태로 알아볼 수 있으므로 라벨 없이 둔다. */}
                      <p className="place-address">{p.address}</p>
                      {/* 마커가 없는 곳은 팝업으로 갈 길이 자체가 없어, 메뉴가
                          데이터에만 있고 화면 어디에도 나오지 않았다 — 그 카드에서만
                          펼친다. 라벨은 열이 아니라 문장 앞에 붙인다(주소와 같은
                          왼쪽 선을 지키려고), 길면 두 줄에서 끊는다.

                          `note` 는 싣지 않는다. 식당 48건의 note 는 전부 조사자료
                          이름이라 이 자리에서 아무것도 말해 주지 않는다
                          (`guidanceFor`). 좌표 없는 5곳은 전부 식당이다. */}
                      {!onMap && p.menu && (
                        <p className="place-menu">
                          <b>메뉴</b> {p.menu}
                        </p>
                      )}
                    </div>

                    <div className="place-foot">
                      <ul className="place-chips">
                        {chipsFor(p)
                          .slice(0, MAX_CARD_CHIPS)
                          .map((d) => (
                            <li key={d} className="chip chip-neutral">
                              {d}
                            </li>
                          ))}
                      </ul>
                      {/* 좌표가 없는 식당은 도보 경로를 그릴 수 없다. 대신 조사
                          자료에 함께 온 네이버 지도 링크로 넘긴다. */}
                      {onMap ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            // 경로 카드는 지도 위에 뜬다. 모바일에서 목록을 한참
                            // 내려온 뒤 눌렀다면 그 카드가 화면 밖이므로, 지도를
                            // 함께 데려온다.
                            selectFromList(p.id);
                            setRouteToId(p.id);
                          }}
                        >
                          <RouteGlyph /> 길찾기
                        </button>
                      ) : p.naverUrl ? (
                        <a
                          className="btn is-naver"
                          href={p.naverUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* 여기서는 RouteGlyph(보내기 화살표)를 뺐다. 같은
                              글리프가 '길찾기'에서 우리가 그리는 경로를 뜻하는데,
                              이 링크는 다른 앱으로 넘긴다 — 같은 표시가 두 가지
                              일을 가리키면 둘 다 흐려진다. 자리는 초록 점이
                              대신 채운다(globals.css `.is-naver`). */}
                          네이버 지도
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* 필터를 바꿔도 몇 건이 됐는지 소리로는 알 수 없었다. 화면에 이미
              있는 숫자에 라이브 리전만 얹는다. */}
          {/* 수와 단위는 붙인다. flex gap 이 사이에 들어가 "67 개 시설" 로
              읽히고 있었다 — 한국어에서 수관형사와 단위는 떨어지지 않는다. */}
          <p className="panel-foot" aria-live="polite">
            <span>
              <strong>{visiblePlaces.length}</strong>개 시설
              {mappedCount < visiblePlaces.length && ` · 지도 표시 ${mappedCount}곳`}
            </span>
          </p>
        </section>

        <section className="map-card surface" aria-label="지도" ref={mapCardRef}>
          <MapView
            places={places}
            visibleIds={visibleIds}
            selectedId={selectedId}
            onSelect={selectFromMap}
            routeToId={routeToId}
            onClearRoute={() => setRouteToId(null)}
            /* 지도에 찍는 점만 추적 좌표를 쓴다. 목록은 기준점 그대로다. */
            userCoords={location.liveCoords}
            locationStatus={location.status}
            outOfCoverage={outOfCoverage}
            mockLocation={mockCoords != null}
            onRequestLocation={location.request}
            onRefreshLocation={location.refresh}
          />
          {/* 범례를 걷어냈다. 바로 왼쪽 패널의 필터 칩이 같은 아이콘 · 같은 라벨을
              개수까지 달고 상시 띄우고 있어, 지도 왼쪽 아래를 영구히 점유할
              이유가 없었다. 되살리려면 여기와 globals.css 의 `.legend` 블록,
              FIT_OPTIONS 의 아래 여백을 함께 되돌릴 것. */}
        </section>
      </main>

      <footer className="notice">
        <div className="notice-card">
          <NoticeIcon size={iconSize.md} className="icon-badge" aria-hidden />
          {/* 걷기 시작한 사람에게 페이지 맨 아래 문단은 닿지 않는다. 여기에는
              어느 화면에도 자리가 없는 것만 남긴다 — 직선거리는 정렬 안내문과
              카드의 '직선' 라벨로, 계단 고지는 경로 결과 카드로(WM-8), 위치
              권한은 길찾기 확인 카드로 각자 쓰이는 자리에 가 있다. */}
          <p className="notice-body">
            <b>이용 전에 확인해 주세요</b>※ 본 페이지는 제공된 시설·식당 조사자료를 캠페인용으로
            재구성한 시안입니다. 식당의 유아의자·유아식기·유모차 출입 정보는 조사 시점 기준이며
            실제 이용 전 매장에 확인해 주세요. 좌표가 없는 식당은 목록에서 선택하면 주소를
            기반으로 위치를 불러옵니다. 지도는 인터넷 연결 시 표시됩니다.
          </p>
        </div>
      </footer>
    </>
  );
}
