export type PlaceType = "nursing" | "ramp" | "elevator" | "restaurant";

/**
 * 개찰구를 기준으로 한 위치.
 *
 * 부모가 역 시설을 두고 가장 먼저 묻는 것은 제원이 아니라 **"표를 찍어야
 * 쓸 수 있나"** 다. 수유실이 개찰구 밖에 있으면 지나가다 들를 수 있고,
 * 안에 있으면 그 역을 이용할 때만 쓸 수 있다. 엘리베이터는 한 대로 지상까지
 * 못 가는 경우가 있어 더 중요하다 — 승강장 엘리베이터를 타고 올라와도
 * 개찰구를 나가면 출구 엘리베이터를 한 번 더 타야 한다.
 *
 * 조사 원문의 `내부`/`외부`·승강장 위치 표기(`개롱 방면 6-2` 처럼 호차 번호로
 * 적힌 것은 운임구역 안의 승강장이다)에서 옮긴 값이며, 원문에 근거가 없으면
 * 비워 둔다. 비어 있으면 카드에 `개찰구 확인 필요` 태그가 붙는다.
 */
export type GateSide = "inside" | "outside";

export const gateLabel: Record<GateSide, string> = {
  inside: "개찰구 안",
  outside: "개찰구 밖",
};

/**
 * 식당의 영유아 편의 정보.
 *
 * `highchair` · `utensil` · `stroller` 는 조사 자료의 세 항목을 그대로 옮긴
 * 것이라 `false` 는 **없음**을 뜻한다. `changingTable` 은 조사 항목에 아예
 * 없었으므로 `false`(없음)와 `undefined`(아직 안 물어봄)를 구분한다 —
 * 조사되지 않은 것을 '없음'으로 적어 두면, 있는 곳을 놓치게 된다.
 */
export interface KidFriendly {
  /** 유아의자 */
  highchair: boolean;
  /** 유아식기 */
  utensil: boolean;
  /**
   * 기저귀 교환대. 수유실 다음으로 큰 니즈인데 1차 조사에 항목이 없었다.
   * 전 항목이 `undefined` 이며 WM-5 조사에서 함께 채운다.
   */
  changingTable?: boolean;
  /**
   * 유모차 출입 원문. 조건이 붙는 경우가 많아 문장을 그대로 둔다.
   * 앞글자가 `O`/`○` 면 가능, `△` 면 조건부(층·엘리베이터 확인 필요),
   * 없으면 조사되지 않은 것. 판정은 `chipsFor` 한 곳에서만 한다.
   */
  stroller: string | null;
}

export interface Place {
  id: string;
  type: PlaceType;
  station: string;
  name: string;
  address: string;
  /**
   * 지도 좌표. 없으면 마커를 만들지 않고 목록에서만 보여 주며, 길찾기 대신
   * `naverUrl` 로 넘긴다. 식당 5곳이 아직 좌표가 없다.
   */
  lat?: number;
  lng?: number;
  /**
   * 좌표를 주소에서 지오코딩해 얻었다는 표시(Nominatim, 번지 단위 일치 확인).
   * 정확도는 **건물 단위**다 — 한 건물에 여러 식당이 있으면 좌표가 겹친다
   * (가든파이브라이프 9곳, 송파대로 111 7곳, 그 밖 3곳·2곳). 층·호수까지는
   * 알 수 없다. 겹친 마커는 지도에서 묶어 펼치게 한다 — `MapView` 의 클러스터.
   */
  geocoded?: boolean;
  /** 역사 안에서의 위치 안내. 역 시설(수유실·경사로·엘리베이터)에만 있다. */
  location?: string;
  /** 개찰구 기준 위치. 역 시설에만 있다. 조사 근거가 없으면 비워 둔다. */
  gate?: GateSide;
  /** 짧은 태그. 역 시설의 편의사항. */
  details?: string[];
  /**
   * 설비 제원(정원·정격하중). **1차 노출에서 뺀다.**
   * 정격하중 1,000kg 은 유모차를 미는 사람의 판단에 아무것도 보태지 않는다.
   * 버리지는 않고 팝업 맨 아래에만 남긴다 — 휠체어 이용자에게는 의미가 있고,
   * 조사 원문을 지우면 나중에 출처를 되짚을 수 없다.
   */
  spec?: string[];
  /** 식당 한 줄 소개 */
  summary?: string;
  /** 식당: 아이가 먹기 좋은 메뉴 */
  menu?: string;
  /** 식당: 영유아 편의 정보 */
  kid?: KidFriendly;
  /** 식당: 주차·위치 등 그 밖의 방문 정보 */
  extra?: string;
  /**
   * 영업시간·브레이크타임. **1차 조사에 없던 항목이라 현재 전 항목이 비어 있다.**
   *
   * 헛걸음의 가장 큰 원인이고, 아이를 데리고 나선 뒤의 헛걸음은 어른 혼자일
   * 때와 무게가 다르다. 값이 들어오면 카드와 팝업이 알아서 보여 주도록 렌더링은
   * 미리 붙여 두었다 — 조사만 채우면 코드를 고칠 일이 없다.
   */
  hours?: string;
  /**
   * 전화번호. 위와 같이 아직 비어 있다.
   * "유모차 확인 필요" 같은 조건부 판정은 결국 전화로만 풀리는데, 지금은 걸
   * 번호가 없어서 사용자가 직접 검색해야 한다.
   */
  phone?: string;
  /** 네이버 지도 링크. 좌표가 없는 식당에는 이것이 유일한 길안내 수단이다. */
  naverUrl?: string;
  note: string;
}

/**
 * 시설명을 제목과 구분어로 나눈다. `거여역 엘리베이터 · 개롱 방면 6-2`
 * → `{ head: "거여역 엘리베이터", qualifier: "개롱 방면 6-2" }`
 *
 * 같은 역에 엘리베이터가 둘씩 있어 이름 끝에 승강장·출구를 붙여 두었는데,
 * 카드 제목은 한 줄이라 **잘려 나가는 부분이 정확히 그 구분어**였다
 * (`거여역 엘리베이터…` 두 장). 구분어를 제목에서 떼어 아래 줄에 내리면,
 * 제목이 짧아져 잘리지 않고 구분어도 자기 자리를 갖는다.
 *
 * 지도 마커 팝업은 폭이 288px 로 넉넉하고 두 줄까지 허용하므로 이름을 그대로
 * 쓴다 — 나누는 것은 카드 쪽 사정이다.
 */
export function splitName(name: string): { head: string; qualifier: string | null } {
  const i = name.indexOf(" · ");
  return i === -1
    ? { head: name, qualifier: null }
    : { head: name.slice(0, i), qualifier: name.slice(i + 3) };
}

/**
 * 카드 제목 아래 한 줄로 붙는 위치. 역 시설에만 있다.
 *
 * `location` 을 먼저 쓴다 — 이름의 구분어보다 늘 같거나 더 자세하다
 * (`2번 출구` vs `2번 출구 측`). 원문에 `location` 이 없으면 구분어로 채운다.
 */
export function whereOf(p: Place): string | null {
  return p.location ?? splitName(p.name).qualifier;
}

/**
 * 카드와 팝업에 쓸 짧은 태그.
 *
 * 역 시설은 **개찰구 위치를 맨 앞에** 두고 조사 항목(`details`)이 뒤따른다.
 * 카드에 보이는 태그는 세 개뿐이라(`MAX_CARD_CHIPS`) 무엇을 첫 자리에 둘지가
 * 곧 편집이다 — 손소독제 유무보다 표를 찍어야 하는지가 먼저다.
 *
 * 식당은 영유아 편의를 짧은 라벨로 바꿔 쓴다. 조사 원문("O (1층, 유모차 반입
 * 가능)")은 칩에 넣기엔 길다.
 *
 * 판정은 전부 여기 한 곳에서만 한다.
 */
export function chipsFor(p: Place): string[] {
  if (!p.kid) {
    const out: string[] = [];
    // 개찰구 정보가 없는 역 시설은 '없음'이 아니라 '아직 모름'이다. 빈칸으로
    // 두면 개찰구 밖이라고 넘겨짚게 되므로, 모른다는 사실 자체를 태그로 남긴다.
    if (p.type !== "restaurant") {
      out.push(p.gate ? gateLabel[p.gate] : "개찰구 확인 필요");
    }
    return [...out, ...(p.details ?? [])];
  }
  // 순서가 곧 편집이다. 카드에는 세 개만 보이므로(`MAX_CARD_CHIPS`) 문 앞에서
  // 되돌아가게 만드는 것부터 앞에 둔다.
  //   유모차   — 못 들어가면 나머지는 볼 것도 없다
  //   기저귀   — 못 갈면 오래 못 앉아 있는다
  //   의자·식기 — 있으면 편하지만 없다고 발길을 돌리진 않는다
  const out: string[] = [];
  const s = p.kid.stroller ?? "";
  // 조건부(△)를 '가능'으로 뭉뚱그리면, 2층 매장에 유모차를 끌고 갔다가
  // 헛걸음하게 된다. 확인이 필요하다는 사실 자체를 태그로 남긴다.
  if (/^[Oo○]/.test(s)) out.push("유모차 반입");
  else if (s.startsWith("△")) out.push("유모차 확인 필요");
  // `undefined`(미조사)는 태그를 만들지 않는다 — 48곳 전부에 "기저귀 확인 필요"
  // 가 붙으면 그건 정보가 아니라 배경 소음이 되고, 정작 읽어야 할 유모차 태그를
  // 밀어낸다. 조사되지 않았다는 사실은 팝업에서 한 번만 말한다.
  if (p.kid.changingTable === true) out.push("기저귀교환대");
  if (p.kid.highchair) out.push("유아의자");
  if (p.kid.utensil) out.push("유아식기");
  return out;
}

/**
 * 이 식당에서 아직 조사되지 않은 방문 정보.
 *
 * 지금은 48곳 전부가 영업시간·전화번호를 갖고 있지 않다. 비어 있는 자리를
 * 그냥 비워 두면 "조사했더니 없더라"로 읽히고, 사용자는 확인 없이 나선다.
 * 무엇을 모르는지 이름을 붙여 말해 주고 네이버 지도로 넘긴다.
 */
export function unsurveyedFor(p: Place): string[] {
  if (!p.kid) return [];
  const out: string[] = [];
  if (!p.hours) out.push("영업시간");
  if (!p.phone) out.push("전화번호");
  if (p.kid.changingTable === undefined) out.push("기저귀 교환대");
  return out;
}

/**
 * `note` 가 출처 표기로 쓰인 경우들. 화면에 정보로 싣지 않는다.
 *
 * `note` 필드가 두 가지 일을 겸하고 있다. 역 시설 19건은 진짜 안내다 —
 * "표를 찍지 않고 들를 수 있습니다", "지상으로 나가려면 개찰구 밖 엘리베이터를
 * 한 번 더 타야 해요". 판단에 곧바로 쓰이는 문장이다.
 *
 * 반면 **식당 48건은 전부 같은 한 줄**이고 그 내용이 조사자료 이름이다.
 * 팝업 48장에 구분선까지 두고 같은 문구를 띄우면 그건 정보가 아니라 배경
 * 소음이 된다 — "기저귀 확인 필요" 칩을 48곳에 달지 않은 것과 같은 이유다.
 * 출처는 페이지 하단 이용 안내가 이미 한 번 말한다.
 */
const SOURCE_NOTES: ReadonlySet<string> = new Set(["영유아 친화 식당 조사자료"]);

/**
 * 판단에 쓸 수 있는 안내문. 출처 표기뿐이면 `null`.
 *
 * 문장으로 걸러 내는 이유는, 나중에 식당별 실제 안내가 조사되면 코드를 고치지
 * 않고 그대로 뜨게 하려는 것이다. 타입으로 끊으면 그때 다시 손대야 한다.
 */
export function guidanceFor(p: Place): string | null {
  const note = p.note.trim();
  return note && !SOURCE_NOTES.has(note) ? note : null;
}

export const typeMeta: Record<PlaceType, { label: string }> = {
  nursing: { label: "수유실" },
  ramp: { label: "경사로" },
  elevator: { label: "엘리베이터" },
  restaurant: { label: "식당" },
};

export const places: Place[] = [
  {
    id: "nursing-geoyeo",
    type: "nursing",
    station: "거여",
    name: "거여역 가족수유실",
    address: "서울특별시 송파구 오금로 지하499(거여동)",
    lat: 37.4931,
    lng: 127.1442,
    location: "B1 고객안전실 인접",
    gate: "inside",
    details: ["손소독제", "기저귀교환대", "기저귀수거함", "수유용 칸막이", "2인용 소파", "탁자"],
    note: "표를 찍고 들어가야 닿습니다. 고객안전실을 거치지 않고 바로 이용할 수 있어요.",
  },
  {
    id: "nursing-jangji",
    type: "nursing",
    station: "장지",
    name: "장지역 모유수유실",
    address: "서울특별시 송파구 송파대로 지하82(장지동)",
    lat: 37.4787,
    lng: 127.1262,
    location: "B1 화장실 옆",
    gate: "outside",
    details: ["손소독제", "기저귀교환대", "기저귀수거함", "수유용 칸막이", "2인용 소파"],
    note: "표를 찍지 않고 들를 수 있습니다. 개찰구 밖 화장실 옆이에요.",
  },
  {
    id: "ramp-geoyeo",
    type: "ramp",
    station: "거여",
    name: "거여역 경사로 · 외부 엘리베이터 1번",
    address: "서울특별시 송파구 오금로 지하499(거여동)",
    lat: 37.49325,
    lng: 127.14405,
    location: "외부 엘리베이터 1번",
    gate: "outside",
    details: ["유모차·휠체어 이동 보조"],
    note: "지상에서 외부 엘리베이터까지 가는 높이 차를 넘는 경사로입니다. 승강장까지는 엘리베이터를 이용해 주세요. 시작 지점은 현장 안내를 확인해 주세요.",
  },
  {
    id: "ramp-macheon",
    type: "ramp",
    station: "마천",
    name: "마천역 경사로 · 1번 출입구",
    address: "서울특별시 송파구 마천동 일대",
    lat: 37.49505,
    lng: 127.15265,
    location: "외부 출입구 1번",
    gate: "outside",
    details: ["유모차·휠체어 이동 보조"],
    note: "지상 출입구의 높이 차를 넘기 위한 경사로입니다. 승강장까지는 엘리베이터를 이용해 주세요. 시작 지점은 현장 안내를 확인해 주세요.",
  },
  {
    id: "ramp-bokjeong",
    type: "ramp",
    station: "복정",
    name: "복정역 경사로 · 4번 출입구",
    address: "서울특별시 송파구·성남시 경계 인접",
    lat: 37.47015,
    lng: 127.12655,
    location: "외부 출입구 4번",
    gate: "outside",
    details: ["유모차·휠체어 이동 보조"],
    note: "지상 출입구의 높이 차를 넘기 위한 경사로입니다. 승강장까지는 엘리베이터를 이용해 주세요. 시작 지점은 현장 안내를 확인해 주세요.",
  },
  {
    id: "ramp-jangji1",
    type: "ramp",
    station: "장지",
    name: "장지역 경사로 · 외부 엘리베이터 1번",
    address: "서울특별시 송파구 송파대로 지하82(장지동)",
    lat: 37.47885,
    lng: 127.12605,
    location: "외부 엘리베이터 1번",
    gate: "outside",
    details: ["유모차·휠체어 이동 보조"],
    note: "지상에서 외부 엘리베이터까지 가는 높이 차를 넘는 경사로입니다. 승강장까지는 엘리베이터를 이용해 주세요. 시작 지점은 현장 안내를 확인해 주세요.",
  },
  {
    id: "ramp-jangji3",
    type: "ramp",
    station: "장지",
    name: "장지역 경사로 · 외부 엘리베이터 3번",
    address: "서울특별시 송파구 송파대로 지하82(장지동)",
    lat: 37.47855,
    lng: 127.12635,
    location: "외부 엘리베이터 3번",
    gate: "outside",
    details: ["유모차·휠체어 이동 보조"],
    note: "지상에서 외부 엘리베이터까지 가는 높이 차를 넘는 경사로입니다. 승강장까지는 엘리베이터를 이용해 주세요. 시작 지점은 현장 안내를 확인해 주세요.",
  },
  {
    id: "elevator-1",
    type: "elevator",
    station: "거여",
    name: "거여역 엘리베이터 · 개롱 방면 6-2",
    address: "서울특별시 송파구 오금로 지하499(거여동)",
    lat: 37.493179999999995,
    lng: 127.14432,
    location: "개롱 방면 6-2",
    gate: "inside",
    spec: ["정원 15명", "정격하중 1,000kg"],
    note: "승강장과 대합실을 잇습니다. 지상으로 나가려면 개찰구 밖 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-2",
    type: "elevator",
    station: "거여",
    name: "거여역 엘리베이터 · 마천 방면 3-2",
    address: "서울특별시 송파구 오금로 지하499(거여동)",
    lat: 37.49301,
    lng: 127.14412,
    location: "마천 방면 3-2",
    gate: "inside",
    spec: ["정원 15명", "정격하중 1,000kg"],
    note: "승강장과 대합실을 잇습니다. 지상으로 나가려면 개찰구 밖 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-3",
    type: "elevator",
    station: "거여",
    name: "거여역 엘리베이터 · 2번 출구",
    address: "서울특별시 송파구 오금로 지하499(거여동)",
    lat: 37.49326,
    lng: 127.14408,
    location: "2번 출구 측",
    gate: "outside",
    spec: ["정원 15명", "정격하중 1,000kg"],
    note: "지상과 대합실을 잇습니다. 승강장까지 내려가려면 개찰구 안 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-4",
    type: "elevator",
    station: "마천",
    name: "마천역 엘리베이터 · 마천 방면 5-2",
    address: "서울특별시 송파구 마천동 일대",
    lat: 37.49498,
    lng: 127.15291,
    location: "마천 방면 5-2",
    gate: "inside",
    spec: ["정원 15명", "정격하중 1,000kg"],
    note: "승강장과 대합실을 잇습니다. 지상으로 나가려면 개찰구 밖 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-5",
    type: "elevator",
    station: "마천",
    name: "마천역 엘리베이터 · 거여 방면 4-3",
    address: "서울특별시 송파구 마천동 일대",
    lat: 37.494820000000004,
    lng: 127.15271,
    location: "거여 방면 4-3",
    gate: "inside",
    spec: ["정원 13명", "정격하중 1,000kg"],
    note: "승강장과 대합실을 잇습니다. 지상으로 나가려면 개찰구 밖 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-6",
    type: "elevator",
    station: "마천",
    name: "마천역 엘리베이터 · 1번 출구",
    address: "서울특별시 송파구 마천동 일대",
    lat: 37.49505,
    lng: 127.15267,
    location: "1번 출구 측",
    gate: "outside",
    spec: ["정원 13명", "정격하중 1,000kg"],
    note: "지상과 대합실을 잇습니다. 승강장까지 내려가려면 개찰구 안 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-7",
    type: "elevator",
    station: "복정",
    name: "복정역 엘리베이터 · 승강장",
    address: "서울특별시 송파구·성남시 경계 인접",
    lat: 37.470079999999996,
    lng: 127.1268,
    location: "장지 방면 4-1 · 남위례 방면 3-4",
    gate: "inside",
    spec: ["정원 15명", "정격하중 1,000kg"],
    note: "승강장과 대합실을 잇습니다. 지상으로 나가려면 개찰구 밖 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-8",
    type: "elevator",
    station: "복정",
    name: "복정역 엘리베이터 · 1번 출구",
    address: "서울특별시 송파구·성남시 경계 인접",
    lat: 37.469899999999996,
    lng: 127.1266,
    location: "1번 출구 측",
    gate: "outside",
    spec: ["정원 21명", "정격하중 1,600kg"],
    note: "지상과 대합실을 잇습니다. 승강장까지 내려가려면 개찰구 안 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-9",
    type: "elevator",
    station: "장지",
    name: "장지역 엘리베이터 · 문정 방면 4-1",
    address: "서울특별시 송파구 송파대로 지하82(장지동)",
    lat: 37.47878,
    lng: 127.12631999999999,
    location: "문정 방면 4-1",
    gate: "inside",
    spec: ["정원 11명", "정격하중 750kg"],
    note: "승강장과 대합실을 잇습니다. 지상으로 나가려면 개찰구 밖 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-10",
    type: "elevator",
    station: "장지",
    name: "장지역 엘리베이터 · 복정 방면 3-4",
    address: "서울특별시 송파구 송파대로 지하82(장지동)",
    lat: 37.47862000000001,
    lng: 127.1261,
    location: "복정 방면 3-4",
    gate: "inside",
    spec: ["정원 11명", "정격하중 750kg"],
    note: "승강장과 대합실을 잇습니다. 지상으로 나가려면 개찰구 밖 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-11",
    type: "elevator",
    station: "장지",
    name: "장지역 엘리베이터 · 1번 출구",
    address: "서울특별시 송파구 송파대로 지하82(장지동)",
    lat: 37.478860000000005,
    lng: 127.12608,
    location: "1번 출구 측",
    gate: "outside",
    spec: ["정원 15명", "정격하중 1,000kg"],
    note: "지상과 대합실을 잇습니다. 승강장까지 내려가려면 개찰구 안 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "elevator-12",
    type: "elevator",
    station: "장지",
    name: "장지역 엘리베이터 · 3번 출구",
    address: "서울특별시 송파구 송파대로 지하82(장지동)",
    lat: 37.47854,
    lng: 127.12631999999999,
    location: "3번 출구 측",
    gate: "outside",
    spec: ["정원 15명", "정격하중 1,000kg"],
    note: "지상과 대합실을 잇습니다. 승강장까지 내려가려면 개찰구 안 엘리베이터를 한 번 더 타야 해요.",
  },
  {
    id: "restaurant-1",
    type: "restaurant",
    station: "위례 생활권",
    name: "제줏간 위례중앙광장점",
    address: "서울 송파구 위례광장로 290 상가동 1층 145호~147호",
    lat: 37.474597,
    lng: 127.143235,
    geocoded: true,
    summary: "구운 고기와 식사 메뉴를 함께 주문할 수 있어 아이와 함께 방문하기 좋은 고깃집.",
    menu: "공깃밥, 계란찜, 김치찌개, 구운 돼지고기(잘게 잘라 제공 가능)",
    kid: { highchair: true, utensil: true, stroller: "O (1층, 유모차 반입 가능)" },
    naverUrl: "https://naver.me/xF4hdTGC",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-2",
    type: "restaurant",
    station: "위례 생활권",
    name: "미도인 위례",
    address: "서울 송파구 위례광장로 290 상가동 1층 148, 149호",
    lat: 37.474597,
    lng: 127.143235,
    geocoded: true,
    summary: "부드러운 스테이크와 파스타 등 아이가 먹기 좋은 메뉴가 다양해 가족 외식에 적합한 매장.",
    menu: "미도인 스테이크 덮밥(고기 잘게 잘라 제공), 가정식 스테이크, 스테이크 한상(밥·단호박수프 포함), 파스타(크림·오일 계열), 공깃밥, 단호박수프",
    kid: { highchair: true, utensil: true, stroller: "O (1층, 유모차 반입 가능)" },
    naverUrl: "https://naver.me/5kP5Tg0s",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-3",
    type: "restaurant",
    station: "위례 생활권",
    name: "카츠우동",
    address: "서울 송파구 위례북로1길 79 1층",
    lat: 37.488959,
    lng: 127.151254,
    geocoded: true,
    summary: "우동과 돈카츠 등 아이가 먹기 쉬운 메뉴를 제공해 가족이 함께 식사하기 좋은 매장.",
    menu: "우동, 등심카츠(잘게 잘라 제공), 안심카츠(잘게 잘라 제공), 유부초밥",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    naverUrl: "https://naver.me/x9zOC8pj",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-4",
    type: "restaurant",
    station: "위례 생활권",
    name: "수복삼계탕 위례점",
    address: "서울 송파구 위례광장로 290 상가동 1층 142,143,144호",
    lat: 37.474597,
    lng: 127.143235,
    geocoded: true,
    summary: "부드러운 삼계탕과 닭고기를 제공해 아이와 함께 건강한 식사를 하기 좋은 매장.",
    menu: "옛날삼계탕, 숭늉삼계탕, 오곡삼계탕, 공깃밥(추가), 닭고기 살코기(잘게 찢어 제공 가능)",
    kid: { highchair: true, utensil: true, stroller: "O (매장 내부가 넓고 테이블 간격이 넓음)" },
    extra: "12세 미만 어린이에게 찹쌀밥, 조미김, 음료 제공이라는 방문 후기",
    naverUrl: "https://naver.me/Fr7j3fBg",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-5",
    type: "restaurant",
    station: "위례 생활권",
    name: "풍국면 송파위례점",
    address: "서울 송파구 위례광장로 230 상가 2동 1층 B-103호",
    lat: 37.480618,
    lng: 127.14352,
    geocoded: true,
    summary: "국수와 만두 등 부드럽게 먹을 수 있는 메뉴가 있어 아이와 함께 방문하기 좋은 매장.",
    menu: "별표국수, 동죽칼국수, 들기름막국수, 만두(고기), 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "O" },
    naverUrl: "https://naver.me/x9cL2YK6",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-6",
    type: "restaurant",
    station: "위례 생활권",
    name: "풍미",
    address: "서울 송파구 위례광장로 120 중앙푸르지오 1단지 상가동 126호",
    lat: 37.47504,
    lng: 127.14116,
    geocoded: true,
    summary: "자극적이지 않은 짜장면과 우동류를 선택할 수 있어 아이와 함께 방문하기 좋은 중식당.",
    menu: "유니짜장, 삼선짜장, 삼선우동, 바지락탕면",
    kid: { highchair: true, utensil: true, stroller: "O (1층 상가)" },
    naverUrl: "https://naver.me/G2YRdvKt",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-7",
    type: "restaurant",
    station: "위례 생활권",
    name: "쿠우쿠우 송파점",
    address: "서울 송파구 송파대로 111 2층 201호",
    lat: 37.480472,
    lng: 127.124143,
    geocoded: true,
    summary: "다양한 부드러운 메뉴와 유아의자가 마련되어 있어 아이와 함께 방문하기 좋은 가족형 뷔페.",
    menu: "유부초밥, 계란초밥, 새우초밥, 우동, 돈가스, 볶음밥, 단호박죽, 과일, 계란찜, 새우튀김(잘게 잘라 제공 가능)",
    kid: { highchair: true, utensil: true, stroller: "O" },
    naverUrl: "https://naver.me/G7Nb6h28",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-8",
    type: "restaurant",
    station: "위례 생활권",
    name: "갑돼지",
    address: "서울 송파구 백제고분로7길 52-8 1층 갑돼지",
    lat: 37.4788,
    lng: 127.1265,
    summary: "잘게 자른 한돈과 계란찜, 죽 등 아이가 먹기 좋은 메뉴를 함께 주문할 수 있는 가족 외식 매장.",
    menu: "한돈 생삼겹살(잘게 잘라 제공), 한돈 목살(잘게 잘라 제공), 계란찜, 중독된장 꿀꿀이죽, 김밥, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "O (1층 상가)" },
    naverUrl: "https://naver.me/50BCWg0U",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-9",
    type: "restaurant",
    station: "위례 생활권",
    name: "담솥 위례점",
    address: "경기 성남시 수정구 위례광장로 104 1층 1096호, 1097호",
    lat: 37.473344,
    lng: 127.141595,
    geocoded: true,
    summary: "고기와 솥밥 메뉴가 다양해 아이와 함께 건강한 한 끼를 즐기기 좋은 한식 매장.",
    menu: "스테이크 솥밥, 소고기 미역 솥밥, 우삼겹 솥밥, 삼겹 솥밥, 닭튀김 솥밥, 소고기 숙주 솥밥, 솥밥 추가",
    kid: { highchair: true, utensil: true, stroller: "O (1층 상가)" },
    naverUrl: "https://map.naver.com/p/entry/place/1989409555?placePath=%2Fmenu%2Flist",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-10",
    type: "restaurant",
    station: "위례 생활권",
    name: "등촌샤브칼국수 복정점",
    address: "경기 성남시 수정구 복정로 63",
    lat: 37.458534,
    lng: 127.126506,
    geocoded: true,
    summary: "샤브용 고기와 칼국수, 볶음밥을 함께 즐길 수 있어 아이와 함께 방문하기 좋은 식당.",
    menu: "버섯매운탕칼국수(맵기 조절 또는 건더기 위주), 바지락칼국수, 샤브용 소고기, 볶음밥, 만두, 면사리",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/FdC68t6Y",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-11",
    type: "restaurant",
    station: "위례 생활권",
    name: "육대장 문정역엠스테이트점",
    address: "서울 송파구 법원로 114 엠스테이트빌딩 지하1층",
    lat: 37.485709,
    lng: 127.120466,
    geocoded: true,
    summary: "설렁탕과 떡만둣국, 보쌈 등 아이가 먹기 좋은 메뉴를 함께 즐길 수 있는 한식 매장.",
    menu: "육개장설렁탕, 사골떡만둣국, 한방보쌈, 육즙가득 왕만두",
    kid: { highchair: false, utensil: false, stroller: null },
    naverUrl: "https://naver.me/xRhEOLnk",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-12",
    type: "restaurant",
    station: "위례 생활권",
    name: "채선당 자연한가득 송파하비오점",
    address: "서울 송파구 송파대로 111 205동 114호",
    lat: 37.480472,
    lng: 127.124143,
    geocoded: true,
    summary: "샤브샤브와 칼국수, 죽을 함께 즐길 수 있어 아이와 함께 방문하기 좋은 가족 외식 매장.",
    menu: "월남쌈 샤브샤브(호주산), 월남쌈 한우 샤브샤브, 리필바(칼국수·죽·채소 등)",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://map.naver.com/p/entry/place/1683885478?placePath=%2Fhome",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-13",
    type: "restaurant",
    station: "위례 생활권",
    name: "영미정육식당 1974 문정본점",
    address: "서울 송파구 충민로 81-14",
    lat: 37.480261,
    lng: 127.126382,
    geocoded: true,
    summary: "곰탕과 국밥, 백반 등 아이가 먹기 좋은 식사 메뉴가 다양해 가족이 함께 방문하기 좋은 한식 매장.",
    menu: "소불고기백반, 소불고기국밥, 우족도가니탕, 사골곰탕, 육개장, 김치찌개, 사태된장찌개, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/513NIB9i",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-14",
    type: "restaurant",
    station: "위례 생활권",
    name: "툇마루밥상",
    address: "서울 송파구 송파대로 111 파크하비오 205동 211호",
    lat: 37.480472,
    lng: 127.124143,
    geocoded: true,
    summary: "갈비찜과 한식 정식 등 아이와 함께 건강한 식사를 즐기기 좋은 한식 매장.",
    menu: "퇴마루밥상, 갈비찜, 동태전, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/FhULoKM3",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-15",
    type: "restaurant",
    station: "위례 생활권",
    name: "위례식탁 본점",
    address: "경기 하남시 위례학암로13번길 34 1층",
    summary: "제육볶음과 고등어구이 등 집밥 스타일의 한식을 제공해 아이와 함께 식사하기 좋은 한식 매장.",
    menu: "제육볶음 한상, 고등어구이 한상, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/5mI0bSQ7",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-16",
    type: "restaurant",
    station: "위례 생활권",
    name: "신주옥미 거여점",
    address: "서울 송파구 오금로 532 1층",
    lat: 37.492774,
    lng: 127.147933,
    geocoded: true,
    summary: "순대국과 돼지국밥, 돈가스 등 아이가 먹기 좋은 식사 메뉴를 함께 즐길 수 있는 한식 매장.",
    menu: "갓순대국, 고기만 갓순대국, 영돈까스, 찰누룽지 돼지국밥, 사골 찰누룽지 돼지국밥, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "△ 1층" },
    naverUrl: "https://naver.me/5yhPgPLB",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-17",
    type: "restaurant",
    station: "위례 생활권",
    name: "용문면옥",
    address: "서울 송파구 거마로9길 4 1층",
    summary: "곰탕과 갈비탕, 만두 등 아이가 먹기 좋은 메뉴가 다양해 가족이 함께 방문하기 좋은 한식 매장.",
    menu: "함흥 물냉면, 수제대왕만두, 수제대왕만두 반판, 한우곰탕, 대왕갈비탕, 만두 대왕갈비탕, 한우만두곰탕",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/FP8nj2KV",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-18",
    type: "restaurant",
    station: "위례 생활권",
    name: "샤브토랑 거여역점",
    address: "서울 송파구 오금로 500 2층 샤브토랑",
    lat: 37.492855,
    lng: 127.144065,
    geocoded: true,
    summary: "샤브샤브와 칼국수, 계란죽 등 아이가 먹기 좋은 메뉴를 함께 즐길 수 있는 가족 외식 매장.",
    menu: "샤브토랑 샤브, 얼큰 샤브샤브, 마라 샤브샤브(매운맛 가능 시 제외), 토마토 샤브샤브, 스키야키, 칼국수, 계란죽, 계란, 만두",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/x0Oma4K9",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-19",
    type: "restaurant",
    station: "위례 생활권",
    name: "명동홍두깨손칼국수",
    address: "서울 송파구 마천로51길 32",
    summary: "손칼국수와 만두 등 아이가 먹기 좋은 메뉴를 제공해 가족이 함께 방문하기 좋은 분식·한식 매장.",
    menu: "손칼국수, 칼만두, 왕만두, 감자만두, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/x3jFGw6R",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-20",
    type: "restaurant",
    station: "위례 생활권",
    name: "아초원 하남점",
    address: "경기 하남시 감일남로52번길 21-29",
    summary: "신선한 채소와 고기, 칼국수와 죽까지 함께 즐길 수 있어 아이와 함께 방문하기 좋은 월남쌈 샤브 전문점.",
    menu: "월남쌈 무한제공(채소·소고기·돼지고기·오리고기), 칼국수, 죽",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/xKERFUBq",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-21",
    type: "restaurant",
    station: "위례 생활권",
    name: "다온 추어탕",
    address: "서울 송파구 거마로 17 1층",
    lat: 37.494605,
    lng: 127.144802,
    geocoded: true,
    summary: "돈가스와 만두 등 아이가 먹기 좋은 메뉴를 함께 제공해 가족이 함께 방문하기 좋은 한식 매장.",
    menu: "치즈 돈가스, 고기만두, 메밀전병, 공기밥",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/F3E0wnEV",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-22",
    type: "restaurant",
    station: "위례 생활권",
    name: "김대감감자탕 거여본점",
    address: "서울 송파구 거마로 20 1층",
    lat: 37.49475,
    lng: 127.145464,
    geocoded: true,
    summary: "뼈해장국과 볶음밥, 주먹밥 등 아이와 함께 나눠 먹기 좋은 메뉴를 제공하는 가족 외식 매장.",
    menu: "뼈해장국, 볶음밥, 주먹밥, 공기밥",
    kid: { highchair: false, utensil: true, stroller: null },
    naverUrl: "https://naver.me/5bVssZMa",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-23",
    type: "restaurant",
    station: "위례 생활권",
    name: "장어야",
    address: "서울 송파구 위례광장로 188 아이온스퀘어 1, 2층",
    lat: 37.481227,
    lng: 127.142488,
    geocoded: true,
    summary: "된장찌개와 장어죽, 볶음밥 등 아이가 먹기 좋은 식사 메뉴를 함께 제공하는 장어 전문점.",
    menu: "된장찌개, 해물된장찌개, 순두부찌개, 된장비빔밥, 채소볶음밥, 장어죽, 공기밥",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/5BcjrZZw",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-24",
    type: "restaurant",
    station: "위례 생활권",
    name: "항아리닭갈비막국수 송파문정점",
    address: "서울 송파구 송파대로 111 108동 B128, B130호",
    lat: 37.480472,
    lng: 127.124143,
    geocoded: true,
    summary: "닭갈비와 어린이 주먹밥, 볶음밥 등 아이가 함께 먹기 좋은 메뉴를 제공하는 가족 외식 매장.",
    menu: "닭갈비(순한맛 가능), 막국수(물), 어린이 주먹밥, 볶음밥, 공기밥",
    kid: { highchair: true, utensil: true, stroller: null },
    naverUrl: "https://naver.me/IgJGd1es",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-25",
    type: "restaurant",
    station: "위례 생활권",
    name: "신단 설렁탕",
    address: "서울 송파구 법원로4길 17 101호, 102호, 103호",
    summary: "설렁탕과 곰탕, 만두국 등 부드러운 식사 메뉴가 다양해 아이와 함께 방문하기 좋은 한식 전문점.",
    menu: "신단설렁탕, (특)설렁탕, 소머리곰탕, 사골만두국, 왕만두, 공기밥",
    kid: { highchair: false, utensil: true, stroller: null },
    naverUrl: "https://naver.me/GahDe2MR",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-26",
    type: "restaurant",
    station: "위례 생활권",
    name: "나이쏘이 하비오점",
    address: "서울 송파구 송파대로 111 파크하비오 106동 107호",
    lat: 37.480472,
    lng: 127.124143,
    geocoded: true,
    summary: "쌀국수와 볶음밥 등 아이가 먹기 쉬운 메뉴를 함께 즐길 수 있는 태국 음식 전문점.",
    menu: "태국 쌀국수, 똠얌쌀국수(맵지 않게), 카오팟짱(태국식 새우볶음밥), 카이팩 타이담(태국식 닭고기 볶음덮밥), 팟카파오무쌉(맵지 않게), 스프링롤",
    kid: { highchair: false, utensil: false, stroller: null },
    naverUrl: "https://naver.me/GwpMJZUU",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-27",
    type: "restaurant",
    station: "위례 생활권",
    name: "양포항 송파거여점",
    address: "서울 송파구 오금로 521 1층",
    lat: 37.493076,
    lng: 127.146778,
    geocoded: true,
    summary: "밥과 생선 등 아이와 나눠 먹기 좋은 한식 메뉴가 있는 곳",
    menu: "생선구이·밥 등 자극적이지 않은 한식류",
    kid: { highchair: true, utensil: true, stroller: "△ 1층" },
    naverUrl: "https://naver.me/F16IAroC",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-28",
    type: "restaurant",
    station: "위례 생활권",
    name: "도아",
    address: "서울 송파구 오금로59길 4 1층 101, 102호",
    lat: 37.493795,
    lng: 127.144117,
    geocoded: true,
    summary: "아이가 먹기 좋은 메뉴를 골라 함께 식사하기 좋은 중식당",
    menu: "볶음밥 등 비교적 맵지 않은 중식 메뉴",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    naverUrl: "https://naver.me/5aq9ALGR",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-29",
    type: "restaurant",
    station: "위례 생활권",
    name: "소여리베이글 송파 위례 본점",
    address: "서울 송파구 위례북로1길 72 1층",
    lat: 37.489475,
    lng: 127.151285,
    geocoded: true,
    summary: "간단한 베이글 메뉴가 있어 아이와 가볍게 방문하기 좋은 곳",
    menu: "플레인 베이글·크림치즈·샌드위치류",
    kid: { highchair: false, utensil: false, stroller: "○ 1층" },
    naverUrl: "https://naver.me/IMysahy6",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-31",
    type: "restaurant",
    station: "위례 생활권",
    name: "화목토식당",
    address: "서울 송파구 거마로 22 1층",
    lat: 37.495009,
    lng: 127.145546,
    geocoded: true,
    summary: "구운 고기와 밥을 아이와 함께 나눠 먹기 좋은 가족 외식 식당",
    menu: "고기구이·밥 등",
    kid: { highchair: false, utensil: true, stroller: "○ 1층" },
    naverUrl: "https://naver.me/5atKisLu",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-32",
    type: "restaurant",
    station: "위례 생활권",
    name: "담가화로구이 거여점",
    address: "서울 송파구 오금로 533 1층",
    lat: 37.493077,
    lng: 127.148138,
    geocoded: true,
    summary: "고기와 밥을 함께 먹을 수 있어 아이 동반 가족 외식에 무난한 곳",
    menu: "갈비살·고기구이·밥",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    extra: "가족외식 이용 정보 있음, 셀프바·주차 가능",
    naverUrl: "https://naver.me/xMnRIKY5",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-34",
    type: "restaurant",
    station: "위례 생활권",
    name: "왕가갈비곰탕 송파마천역점",
    address: "서울 송파구 성내천로 185 2층",
    lat: 37.501645,
    lng: 127.148954,
    geocoded: true,
    summary: "자극적이지 않은 곰탕과 밥을 아이와 나눠 먹기 좋은 곳",
    menu: "갈비곰탕·밥·고기",
    kid: { highchair: true, utensil: true, stroller: "△ 2층, 엘리베이터 확인 필요" },
    naverUrl: "https://naver.me/51akdXu6",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-35",
    type: "restaurant",
    station: "위례 생활권",
    name: "원할머니보쌈족발 거여역점",
    address: "서울 송파구 오금로 483 1층",
    lat: 37.494082,
    lng: 127.142916,
    geocoded: true,
    summary: "부드러운 보쌈고기와 밥을 함께 먹을 수 있어 아이 동반 가족 외식에 좋은 곳",
    menu: "보쌈고기, 보쌈반상, 공깃밥, 부대찌개(맵지 않게 덜어 제공)",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    extra: "유아의자·주차 가능, 매장 앞 무료 주차",
    naverUrl: "https://naver.me/xqbUkQeD",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-36",
    type: "restaurant",
    station: "위례 생활권",
    name: "정일돈",
    address: "서울 송파구 오금로 487 1층",
    lat: 37.493912,
    lng: 127.143257,
    geocoded: true,
    summary: "구운 고기와 밥을 아이와 나눠 먹기 좋은 거여역 고깃집",
    menu: "삼겹살, 목살, 갈비살, 공깃밥(고기는 잘게 잘라 제공)",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    extra: "유아의자·주차 가능, 매장 앞 약 3대 주차",
    naverUrl: "https://naver.me/GGC08uny",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-37",
    type: "restaurant",
    station: "위례 생활권",
    name: "리미니 NC송파점",
    address: "서울 송파구 충민로 66 가든파이브라이프 패션관 NC백화점 7층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "파스타와 피자 등 아이가 먹기 익숙한 메뉴가 다양한 이탈리안 레스토랑",
    menu: "크림·토마토 파스타, 피자, 스테이크, 화덕 식전빵",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "NC백화점 내 위치, 주차 가능",
    naverUrl: "https://naver.me/xP8m9FKd",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-38",
    type: "restaurant",
    station: "위례 생활권",
    name: "정선갈비",
    address: "서울 송파구 거마로 11 1층",
    lat: 37.494354,
    lng: 127.144666,
    geocoded: true,
    summary: "갈비와 갈비탕, 밥을 함께 먹을 수 있어 가족 외식에 무난한 곳",
    menu: "돼지갈비, 갈비탕, 냉면, 된장찌개, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    extra: "주차·발렛파킹 가능",
    naverUrl: "https://naver.me/xtgMyy36",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-39",
    type: "restaurant",
    station: "위례 생활권",
    name: "애슐리퀸즈 NC 송파점",
    address: "서울 송파구 충민로 66 가든파이브라이프 NC백화점 영관 7층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "아이 취향에 맞춰 여러 음식을 고를 수 있는 가족형 뷔페",
    menu: "볶음밥, 파스타, 피자, 수프, 초밥, 구운 고기, 과일",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "유아의자·대기공간·주차 가능",
    naverUrl: "https://naver.me/xprAor0Z",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-40",
    type: "restaurant",
    station: "위례 생활권",
    name: "봉열소곱창 문정본점",
    address: "서울 송파구 송파대로 111 파크하비오 202동 1층 148, 149호",
    lat: 37.480472,
    lng: 127.124143,
    geocoded: true,
    summary: "볶음밥과 주먹밥 등 아이가 먹을 메뉴를 함께 주문할 수 있는 곱창 전문점",
    menu: "볶음밥, 양볶음밥, 날치알주먹밥, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    extra: "유아의자·주차 가능",
    naverUrl: "https://naver.me/IGJIipDb",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-41",
    type: "restaurant",
    station: "위례 생활권",
    name: "파파밸리피자 파크하비오점",
    address: "서울 송파구 송파대로 111 110동 1층 112호",
    lat: 37.480472,
    lng: 127.124143,
    geocoded: true,
    summary: "피자와 파스타처럼 아이들이 좋아하는 메뉴를 고르기 좋은 곳",
    menu: "치즈피자, 콤비네이션피자, 크림파스타, 버팔로윙",
    kid: { highchair: true, utensil: true, stroller: "○ 1층" },
    extra: "유아의자·주차·포장·배달 가능",
    naverUrl: "https://naver.me/GgW8VICB",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-42",
    type: "restaurant",
    station: "위례 생활권",
    name: "자연별곡 NC송파점",
    address: "서울 송파구 충민로 66 NC백화점 송파점 영관 7층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "한식 메뉴가 다양해 아이에게 맞는 음식을 골라 먹기 좋은 뷔페",
    menu: "밥, 불고기, 잡채, 전, 국수, 죽, 과일 등 한식 뷔페 메뉴",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "유아의자·장애인 편의시설·주차 가능",
    naverUrl: "https://naver.me/xAAxHKIo",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-43",
    type: "restaurant",
    station: "위례 생활권",
    name: "경성함바그 NC백화점송파점",
    address: "서울 송파구 충민로 66 NC백화점 송파점 패션관 7층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "부드러운 함박스테이크와 밥을 아이와 함께 먹기 좋은 곳",
    menu: "함박스테이크, 오므라이스, 돈가스, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "백화점 식당가 내 위치, 주차 가능",
    naverUrl: "https://naver.me/Fdoohi0Y",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-44",
    type: "restaurant",
    station: "위례 생활권",
    name: "단정 가든파이브",
    address: "서울 송파구 충민로 66 아울렛관 5층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "솥밥과 생선·고기를 함께 먹을 수 있어 아이와 든든한 한 끼를 하기 좋은 곳",
    menu: "고등어솥밥, 스테이크솥밥, 꼬막솥밥(양념 조절), 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "가든파이브 아울렛관 식당가 내 위치",
    naverUrl: "https://naver.me/xR2a5RDk",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-45",
    type: "restaurant",
    station: "위례 생활권",
    name: "델리커리 가든파이브 현대시티몰점",
    address: "서울 송파구 충민로 66 가든파이브 현대시티몰 테크노관 지하1층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "달콤한 커리와 밥·난을 아이와 나눠 먹기 좋은 카레 전문점",
    menu: "브라운커리, 함박커리, 밥, 난, 샐러드",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "주차 가능, 셀프바 이용 가능",
    naverUrl: "https://naver.me/FvENK32K",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-46",
    type: "restaurant",
    station: "위례 생활권",
    name: "찜샤브 현대시티몰가든파이브점",
    address: "서울 송파구 충민로 66 가든파이브 현대시티몰 테크노관 5층",
    lat: 37.477649,
    lng: 127.124994,
    geocoded: true,
    summary: "부드러운 샤브 고기와 만두, 밥을 아이와 함께 먹기 좋은 곳",
    menu: "샤브용 소고기, 채소, 만두, 주먹밥, 비빔밥, 면·수제비 사리",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "주차·단체 이용 가능, 채소 리필바 운영",
    naverUrl: "https://naver.me/FqZ0aeOH",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-47",
    type: "restaurant",
    station: "위례 생활권",
    name: "타쿠미주방 현대시티몰 가든파이브점",
    address: "서울 송파구 충민로 66 현대시티몰 가든파이브점 지하1층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "오므라이스와 카레, 덮밥 등 아이가 먹기 쉬운 메뉴가 다양한 일식 매장",
    menu: "회오리오므라이스, 카레, 카레돈가스, 부타동, 연어덮밥, 공깃밥",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "현대시티몰 식당가 내 위치",
    naverUrl: "https://naver.me/FSw7ZTef",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-48",
    type: "restaurant",
    station: "위례 생활권",
    name: "심비디움 현대 가든파이브점",
    address: "서울 송파구 충민로 66 아울렛관 5층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "초밥과 우동, 고기 등 다양한 메뉴가 있어 아이와 골라 먹기 좋은 뷔페",
    menu: "계란·새우초밥, 우동, 어묵탕, 구운 고기, 튀김, 과일",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "유아의자·무료 주차(후기 기준 4시간) 가능",
    naverUrl: "https://naver.me/xbj6uF3I",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-49",
    type: "restaurant",
    station: "위례 생활권",
    name: "쿠치나디까사 NC백화점 송파점",
    address: "서울 송파구 충민로 66 NC백화점 송파점 영관 2층",
    lat: 37.477863,
    lng: 127.126004,
    geocoded: true,
    summary: "아이들이 좋아하는 파스타와 피자가 다양하고 유아용품도 준비된 곳",
    menu: "까르보나라, 토마토·미트볼 파스타, 고르곤졸라피자, 리조또",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "유아의자·유아식기·주차 가능, 휠체어 출입 가능",
    naverUrl: "https://naver.me/x9z5sxBd",
    note: "영유아 친화 식당 조사자료",
  },
  {
    id: "restaurant-50",
    type: "restaurant",
    station: "위례 생활권",
    name: "북창동순두부 송파가든파이브점",
    address: "서울 송파구 충민로 66 현대시티몰 5층",
    lat: 37.477649,
    lng: 127.124994,
    geocoded: true,
    summary: "솥밥과 생선구이·떡갈비를 아이와 나눠 먹기 좋은 한식 매장",
    menu: "솥밥, 고등어구이, 떡갈비, 갈비맛 양념구이, 순두부(맵기 확인)",
    kid: { highchair: true, utensil: true, stroller: "○ 엘리베이터 이용 가능" },
    extra: "주차 가능, 순두부는 아이용으로 맵기 확인 필요",
    naverUrl: "https://naver.me/5Q3XuhHC",
    note: "영유아 친화 식당 조사자료",
  },
];
