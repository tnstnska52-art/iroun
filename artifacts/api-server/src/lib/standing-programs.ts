/**
 * 공고 없이 1년 내내 운영되는 사업자 지원 제도(고용장려금·두루누리·소상공인 경감 지원).
 * 기업마당·정부24에는 매번 '공고'가 올라오지 않아 수집으로는 잡히지 않으므로 공식 자료를 확인해 직접 넣는다.
 * 조건(직원 수·매출·개업연도)을 규칙으로 넣어 고객이 입력한 조건에 맞을 때만 '조건 일치'로 보인다.
 * 확정형·선정형(계약서 제2조): 요건형 장려금·두루누리·바우처는 요건을 갖추고 신청하면 받으므로 확정형,
 * 공모형(유연근무·정규직 전환)과 운영기관 승인이 필요한 청년일자리도약은 선정형으로 직접 정한다.
 * 채용·육아휴직처럼 일이 생겨야 받는 장려금은 '받을 수 있는 금액' 합계를 부풀리지 않도록 최대금액(maxAmount)을 넣지 않고 요약에만 적는다.
 *
 * 확인 근거(2026-11-02): 고용노동부 「2026년 고용창출장려금 및 고용안정장려금 사업 공고」,
 * 2026년 청년일자리도약장려금 시행 안내, 소상공인시장진흥공단 2026 지원시책(고용보험료 지원·경영안정 바우처),
 * 두루누리 사회보험료 지원 안내. 금액·요건이 바뀌면 이 파일의 STANDING_VERSION 을 올리면 서버가 켜질 때 갱신된다.
 *
 * 추가(2026-11-22): 사장님 본인이 받는 것 — 근로·자녀장려금, 소상공인 고효율기기 지원, 국민내일배움카드.
 * 확인 근거: 국세청 2025년 귀속 근로·자녀장려금 기한 후 신청 안내(2026.6.2.~12.1., 산정액의 95%),
 * 조세특례제한법의 정기 신청 기간(매년 5월), 한국전력공사 2026년 소상공인 고효율기기 지원사업 안내
 * (구매 2026.1.1.~12.31., 신청 2026.2.9.~12.31., 예산 소진 시 조기 종료), 고용24 국민내일배움카드 발급 제외 대상.
 * 근로·자녀장려금은 가구 소득·재산을, 고효율기기는 올해 1등급 기기를 샀는지를 우리가 알 수 없다.
 * 그래서 자격 규칙을 넣지 않아 '추가 확인 필요'로 보이게 하고, 합계를 부풀리지 않도록 최대금액(maxAmount)을 넣지 않고 지원 내용에만 적는다.
 * 2027년 5월 정기 신청 항목은 접수 시작 전까지 목록에 보이지 않는다. 국세청이 2027년 안내를 내면 금액·기간을 다시 확인해 STANDING_VERSION 을 올린다.
 */
import { pool } from "@workspace/db";
import { benefitSchema, normalizeSourceKey, publicBenefit, type Benefit } from "./benefit-domain";
import { audit } from "./benefit-store";

/** 자료를 고치면 이 날짜를 올린다(서버가 켜질 때 더 새로운 것만 덮어쓴다). */
export const STANDING_VERSION = "2026-11-22T14:00:00+09:00";
const WORK24 = "https://www.work24.go.kr";
const HOMETAX = "https://www.hometax.go.kr";

const base = {
  kind: "지원금" as const, audience: "사업" as const, region: "전국", startsAt: "", endsAt: "",
  checkedAt: STANDING_VERSION, budgetStatus: "해당 없음" as const, status: "상시 조회" as const,
  reviewStatus: "공개" as const, isTest: false, checks: [] as string[], calculation: "",
};
type Item = Omit<Benefit, keyof typeof base> & Partial<Pick<Benefit, keyof typeof base>>;
const items: Item[] = [
  {
    id: "standing-durunuri", selection: "확정형", sourceId: "standing:durunuri", title: "두루누리 사회보험료 지원",
    category: "고용", agency: "고용노동부·근로복지공단", sourceUrl: "https://www.4insure.or.kr",
    summary: "직원 10명 미만 사업장이 월평균보수 270만 원 미만 직원을 새로 고용보험·국민연금에 가입시키면 사장님 몫과 직원 몫 보험료의 80%를 지원해요.",
    support: "고용보험료·국민연금 보험료의 80% 지원(사업주·근로자 모두). 최대 36개월. 연말 기준 10명 미만이면 다음 해에도 자동으로 이어져요.",
    documents: ["사회보험 가입 신고서(보험료 지원 신청 체크)"],
    rules: [
      { scope: "business", field: "employees", operator: "gte", value: 1, label: "4대보험 가입 직원 1명 이상" },
      { scope: "business", field: "employees", operator: "lte", value: 9, label: "직원 10명 미만 사업장" },
    ],
  },
  {
    id: "standing-youth-leap", selection: "선정형", sourceId: "standing:youth-leap", title: "청년일자리도약장려금",
    category: "고용", agency: "고용노동부", sourceUrl: WORK24,
    summary: "직원 5명 이상 사업장이 만 15~34세 청년을 정규직으로 뽑아 6개월 이상 고용하면 사업주에게 1년 최대 720만 원(월 60만 원)을 줘요.",
    support: "청년 1명당 월 60만 원, 1년 최대 720만 원. 비수도권은 청년 본인에게 근속 인센티브(최대 720만 원)도 있어요. 채용 전에 고용24에서 먼저 참여 신청해야 하고(신청 전 3개월 안에 뽑은 청년까지 인정), 지역 예산이 끝나면 일찍 마감될 수 있어요.",
    documents: ["참여 신청서(고용24)", "청년 근로계약서", "임금대장"],
    rules: [{ scope: "business", field: "employees", operator: "gte", value: 5, label: "직원 5명 이상(우선지원대상기업)" }],
  },
  {
    id: "standing-employment-promotion", selection: "확정형", sourceId: "standing:employment-promotion", title: "고용촉진장려금",
    category: "고용", agency: "고용노동부", sourceUrl: WORK24,
    summary: "취업 지원 프로그램을 마친 구직자·장애인·여성가장 등 취업이 어려운 사람을 새로 뽑으면 1명당 월 30~60만 원을 1년간 줘요.",
    support: "신규 채용 근로자 1명당 월 30~60만 원, 1년(일부 대상자는 최대 2년). 6개월 단위로 신청하고, 고용일부터 12개월 안에 고용24나 고용센터에 신청해요.",
    documents: ["지원금 신청서", "근로계약서", "임금대장"],
    rules: [], openToAll: true,
  },
  {
    id: "standing-regularize", selection: "선정형", sourceId: "standing:regularize", title: "정규직 전환 지원금",
    category: "고용", agency: "고용노동부", sourceUrl: WORK24,
    summary: "직원 30명 미만 사업장이 기간제·파견 등 비정규직 직원을 정규직으로 바꾸면 1명당 월 최대 60만 원을 1년간 줘요.",
    support: "전환한 직원 1명당 월 60만 원(임금을 월 20만 원 이상 올린 경우) 또는 월 40만 원, 최대 1년. 공모형이라 고용24에서 먼저 참여 신청이 필요해요.",
    documents: ["사업 참여 신청서", "전환 전후 근로계약서", "임금대장"],
    rules: [
      { scope: "business", field: "employees", operator: "gte", value: 1, label: "4대보험 가입 직원 1명 이상" },
      { scope: "business", field: "employees", operator: "lte", value: 29, label: "직원 30명 미만 사업장" },
    ],
  },
  {
    id: "standing-childcare-stability", selection: "확정형", sourceId: "standing:childcare-stability", title: "출산육아기 고용안정장려금",
    category: "고용", agency: "고용노동부", sourceUrl: WORK24,
    summary: "직원이 육아휴직이나 육아기 근로시간 단축을 쓰면 사업주에게 월 30만 원, 대체인력을 뽑으면 월 최대 140만 원, 남은 직원이 업무를 나눠 맡으면 월 최대 60만 원을 줘요.",
    support: "육아휴직·근로시간 단축 지원금 월 30만 원(특례: 육아휴직 첫 3개월 월 100만 원), 대체인력 지원금 월 최대 140만 원(30명 이상 130만 원), 업무분담 지원금 월 최대 60만 원. 3개월 단위로, 사용 끝난 뒤 12개월 안에 신청해요.",
    documents: ["지원금 신청서", "육아휴직(단축) 확인 서류", "대체인력 근로계약서"],
    rules: [{ scope: "business", field: "employees", operator: "gte", value: 1, label: "4대보험 가입 직원 1명 이상" }],
  },
  {
    id: "standing-flexible-work", selection: "선정형", sourceId: "standing:flexible-work", title: "유연근무 장려금",
    category: "고용", agency: "고용노동부", sourceUrl: WORK24,
    summary: "직원이 재택·원격근무, 육아기 시차출퇴근, 선택근무를 쓰면 1명당 월 20~30만 원을 1년간 줘요(육아기 자녀가 있는 직원은 2배).",
    support: "재택·원격근무와 육아기 시차출퇴근 월 20만 원(월 4일 이상 활용), 선택근무 월 30만 원. 1년 최대 240만 원(선택근무 360만 원). 공모형이라 먼저 참여 신청이 필요해요.",
    documents: ["사업 참여 신청서", "유연근무 운영 규정", "활용 기록"],
    rules: [{ scope: "business", field: "employees", operator: "gte", value: 1, label: "4대보험 가입 직원 1명 이상" }],
  },
  {
    id: "standing-worklife-hours", selection: "확정형", sourceId: "standing:worklife-hours", title: "워라밸일자리 장려금(근로시간 단축)",
    category: "고용", agency: "고용노동부", sourceUrl: WORK24,
    summary: "직원의 소정근로시간을 줄여 주거나 육아기 10시 출근제를 도입하면 1명당 월 최대 50만 원(장려금 30만 원 + 줄어든 임금 보전 20만 원)을 줘요.",
    support: "근로자 1명당 월 최대 50만 원, 최대 1년(1년 최대 600만 원, 육아기 10시 출근제 360만 원). 3개월 단위로 신청해요.",
    documents: ["지원금 신청서", "근로시간 단축 합의서", "임금대장"],
    rules: [{ scope: "business", field: "employees", operator: "gte", value: 1, label: "4대보험 가입 직원 1명 이상" }],
  },
  {
    id: "standing-senior-continued", selection: "확정형", sourceId: "standing:senior-continued", title: "고령자 계속고용장려금",
    category: "고용", agency: "고용노동부", sourceUrl: WORK24,
    summary: "정년을 늘리거나 없애거나 정년 뒤 다시 고용하는 제도를 취업규칙에 넣고 정년이 된 직원을 계속 고용하면 1명당 월 30만 원(비수도권 40만 원)을 최대 3년 줘요.",
    support: "근로자 1명당 수도권 월 30만 원, 비수도권 월 40만 원, 최대 3년(비수도권 최대 1,440만 원). 60세 이상 직원 비율이 30% 이하인 사업장. 분기 단위로 고용24나 고용센터에 신청해요.",
    documents: ["지원금 신청서", "개정 취업규칙", "계속고용 근로계약서"],
    rules: [{ scope: "business", field: "employees", operator: "gte", value: 1, label: "4대보험 가입 직원 1명 이상" }],
  },
  {
    id: "standing-self-employed-insurance", selection: "확정형", sourceId: "standing:self-employed-insurance", title: "소상공인 고용보험료 지원",
    kind: "환급금", category: "경영", agency: "소상공인시장진흥공단", sourceUrl: "https://www.sbiz24.kr",
    summary: "직원 5명 미만 소상공인 사장님이 자영업자 고용보험에 가입하면 낸 보험료의 50~80%를 최대 5년간 돌려줘요. 폐업하면 실업급여도 받을 수 있어요.",
    support: "고른 고용보험 등급에 따라 보험료의 50~80% 환급, 최대 5년. 신청한 달부터 지원(지난 보험료는 소급하지 않음). 가입 전이면 고용·산재보험 토탈서비스에서 가입과 함께, 이미 가입했으면 소상공인24에서 신청해요.",
    documents: ["사업자등록증명", "매출액 확인 서류(공공 마이데이터 동의 시 생략)"],
    rules: [{ scope: "business", field: "employees", operator: "lte", value: 4, label: "상시근로자 5명 미만" }],
  },
  {
    id: "standing-stability-voucher-2026", selection: "확정형", sourceId: "standing:stability-voucher-2026", title: "소상공인 경영안정 바우처",
    category: "경영", agency: "소상공인시장진흥공단", sourceUrl: "https://www.sbiz24.kr", maxAmount: 250_000,
    status: "접수 중", budgetStatus: "확인 필요",
    summary: "2025년 연매출 1억 400만 원 미만 소상공인에게 전기·가스·수도요금, 4대보험료, 차량 연료비에 쓸 수 있는 바우처 최대 25만 원을 줘요.",
    support: "최대 25만 원 카드형 바우처. 2025년 12월 31일 이전 개업하고 지금 영업 중이면 신청할 수 있어요(서류 없음, 소상공인24 온라인 신청). 예산이 끝나면 마감돼요.",
    documents: [],
    rules: [
      { scope: "business", field: "revenue", operator: "lte", value: 103_999_999, label: "2025년 연매출 1억 400만 원 미만" },
      { scope: "business", field: "openedAt", operator: "before", value: "2025-12-31T23:59:59+09:00", label: "2025년 12월 31일 이전 개업" },
    ],
  },
  {
    id: "standing-eitc-late-2025", selection: "확정형", sourceId: "standing:eitc-late-2025", title: "근로장려금 기한 후 신청(2025년 소득분)",
    category: "경영", agency: "국세청", sourceUrl: HOMETAX,
    startsAt: "2026-06-02", endsAt: "2026-12-01", status: "접수 중",
    summary: "2025년에 사업소득이나 근로소득이 있었는데 5월 신청을 놓쳤다면 12월 1일까지 신청할 수 있어요. 가구 소득과 재산이 기준보다 적으면 받아요.",
    support: "가구 구성에 따라 최대 330만 원(단독 165만·홑벌이 285만·맞벌이 330만 원, 기한 후 신청은 계산된 금액의 95%). 2025년 부부 합산 총소득이 단독 2,200만 원·홑벌이 3,200만 원·맞벌이 4,400만 원 미만이고, 2025년 6월 1일 기준 가구 재산이 2억 4천만 원 미만이어야 해요(1억 7천만 원 이상이면 절반). 홈택스·손택스에서 신청해요.",
    documents: [], rules: [],
  },
  {
    id: "standing-child-credit-late-2025", selection: "확정형", sourceId: "standing:child-credit-late-2025", title: "자녀장려금 기한 후 신청(2025년 소득분)",
    category: "경영", agency: "국세청", sourceUrl: HOMETAX,
    startsAt: "2026-06-02", endsAt: "2026-12-01", status: "접수 중",
    summary: "18세 미만 자녀가 있고 2025년 부부 합산 총소득이 7,000만 원 미만이면 자녀 1명당 100만 원까지 받아요. 5월 신청을 놓쳤다면 12월 1일까지 신청할 수 있어요.",
    support: "자녀 1명당 최대 100만 원(소득에 따라 50만 원부터, 기한 후 신청은 계산된 금액의 95%). 2025년 6월 1일 기준 가구 재산이 2억 4천만 원 미만이어야 해요(1억 7천만 원 이상이면 절반). 근로장려금과 함께 홈택스·손택스에서 신청해요.",
    documents: [], rules: [],
  },
  {
    id: "standing-eitc-2026", selection: "확정형", sourceId: "standing:eitc-2026", title: "근로장려금 정기 신청(2026년 소득분)",
    category: "경영", agency: "국세청", sourceUrl: HOMETAX,
    startsAt: "2027-05-01", endsAt: "2027-05-31", status: "접수 중",
    summary: "2026년에 사업소득이나 근로소득이 있었고 가구 소득과 재산이 기준보다 적으면 받는 장려금이에요. 매년 5월에 신청해요.",
    support: "가구 구성(단독·홑벌이·맞벌이)과 소득에 따라 금액이 달라져요. 올해 금액과 소득·재산 기준은 국세청 안내에서 확인해요. 홈택스·손택스에서 신청해요.",
    documents: [], rules: [],
  },
  {
    id: "standing-child-credit-2026", selection: "확정형", sourceId: "standing:child-credit-2026", title: "자녀장려금 정기 신청(2026년 소득분)",
    category: "경영", agency: "국세청", sourceUrl: HOMETAX,
    startsAt: "2027-05-01", endsAt: "2027-05-31", status: "접수 중",
    summary: "18세 미만 자녀가 있고 가구 소득과 재산이 기준보다 적으면 받는 장려금이에요. 매년 5월에 근로장려금과 함께 신청해요.",
    support: "자녀 수와 소득에 따라 금액이 달라져요. 올해 금액과 소득·재산 기준은 국세청 안내에서 확인해요. 홈택스·손택스에서 신청해요.",
    documents: [], rules: [],
  },
  {
    id: "standing-efficient-appliance-2026", selection: "확정형", sourceId: "standing:efficient-appliance-2026", title: "소상공인 고효율기기 지원(냉난방기·냉장고 구입비 환급)",
    kind: "환급금", category: "경영", agency: "한국전력공사", sourceUrl: "https://en-ter.co.kr/ac/main/main.do",
    startsAt: "2026-02-09", endsAt: "2026-12-31", status: "접수 중", budgetStatus: "확인 필요",
    summary: "2026년에 에너지효율 1등급 냉난방기·냉장고·세탁기·건조기를 사업장에 새로 들였다면 구입비(부가세 제외)의 40%를 돌려받아요.",
    support: "품목별로 최대 160만 원(냉난방기·냉장고 각 160만 원, 세탁기·건조기 각 80만 원). 2026년 1월 1일 이후에 산 제품이면 신청할 수 있어요. 한전 에너지마켓플레이스에서 온라인으로 신청하고, 예산이 끝나면 일찍 마감돼요.",
    documents: ["중소기업확인서(소상공인)", "사업자등록증", "구매 영수증(부가세 구분)", "에너지소비효율등급 라벨 사진", "기기 명판 사진", "설치 사진"],
    rules: [],
  },
  {
    id: "standing-learning-card", selection: "확정형", sourceId: "standing:learning-card", title: "국민내일배움카드(사장님 직업훈련비)",
    category: "경영", agency: "고용노동부", sourceUrl: WORK24,
    summary: "사업한 지 1년이 넘고 연매출 4억 원 미만인 사장님은 5년 동안 300만 원까지 직업훈련비를 지원받아요.",
    support: "5년간 최대 300만 원(요건이 맞으면 200만 원 추가). 과정에 따라 훈련비의 45~85%를 지원해요. 고용24에서 카드를 발급받아 원하는 과정에 등록해요.",
    documents: [],
    // 발급 제외: 사업 기간 1년 미만 또는 연매출 4억 원 이상. 개업일 기준은 이 파일을 고친 날에서 1년 전이라, 시간이 지나면 조금 더 엄격하게 본다.
    rules: [
      { scope: "business", field: "revenue", operator: "lte", value: 399_999_999, label: "연매출 4억 원 미만" },
      { scope: "business", field: "openedAt", operator: "before", value: "2025-11-22T23:59:59+09:00", label: "사업한 지 1년 이상" },
    ],
  },
];

export function standingPrograms(): Benefit[] {
  return items.map((x) => benefitSchema.parse({ ...base, ...x }));
}

/** 서버가 켜질 때: 없으면 넣고, 이 파일이 더 새로우면 바꾼다. 운영자가 비공개로 내린 것은 그대로 둔다. */
export async function seedStanding() {
  let changed = 0;
  for (const b of standingPrograms()) {
    if (!publicBenefit(b)) throw new Error(`공개할 수 없는 상시 제도: ${b.id}`);
    const r = await pool.query(
      `INSERT INTO iroun_benefits(id,source_key,data) VALUES($1,$2,$3)
       ON CONFLICT(id) DO UPDATE SET data=CASE WHEN iroun_benefits.data->>'reviewStatus'='비공개' THEN jsonb_set(EXCLUDED.data,'{reviewStatus}','"비공개"') ELSE EXCLUDED.data END,updated_at=now()
       WHERE iroun_benefits.data->>'checkedAt' IS DISTINCT FROM EXCLUDED.data->>'checkedAt' RETURNING id`,
      [b.id, normalizeSourceKey(b), JSON.stringify(b)],
    );
    if (r.rowCount) { changed++; await audit("manual-source-review", "상시 지원 제도 등록·갱신", b.id, { sourceUrl: b.sourceUrl, version: STANDING_VERSION }); }
  }
  return changed;
}
