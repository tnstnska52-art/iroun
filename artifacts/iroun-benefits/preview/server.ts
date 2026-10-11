/**
 * 미리보기 전용 가상 서버. 브라우저 메모리 안에서만 동작하며 실제 서버·DB·고객 자료와 연결되지 않는다.
 * 공고 판정은 실제 서버와 같은 함수(matchBenefit, publicBenefit)를 그대로 사용한다.
 * 운영 빌드에는 포함되지 않는다(EXPO_PUBLIC_PREVIEW=1일 때만 metro가 연결).
 */
import { matchBenefit, publicBenefit, noticeTime, profileSchema, preferencesSchema, trackingSchema, type Benefit, type Profile } from '../../api-server/src/lib/benefit-domain';
import official from './official-benefits.json';

const HOUR = 3600000, DAY = 24 * HOUR;
const now = () => Date.now();
const isoIn = (ms: number) => new Date(now() + ms).toISOString();
const ymdIn = (days: number) => new Date(now() + days * DAY + 9 * HOUR).toISOString().slice(0, 10);
let seq = 1;
const newId = (p: string) => `${p}-${(seq++).toString().padStart(4, '0')}`;

/* ---------- 공고: 실제 확인 자료 4건 + 화면 확인용 예시 ---------- */
const sample = (b: Partial<Benefit> & Pick<Benefit, 'id' | 'title' | 'audience' | 'category' | 'region' | 'agency'>): Benefit => ({
  kind: '지원금', sourceUrl: 'https://www.bizinfo.go.kr/', sourceId: b.id, summary: '', support: '', calculation: '',
  checks: [], documents: [], startsAt: '', endsAt: '', checkedAt: isoIn(-2 * HOUR), budgetStatus: '해당 없음', status: '접수 중',
  reviewStatus: '공개', isTest: false, rules: [], ...b,
});
const SAMPLES: Benefit[] = [
  sample({ id: 'ex-gg-smallbiz', title: '[예시] 경기도 소상공인 경영환경 개선 지원', audience: '사업', category: '경영', region: '경기도', agency: '경기도시장상권진흥원',
    summary: '화면 확인용 예시 공고입니다. 점포 환경 개선과 홍보물 제작 비용 일부를 지원하는 형태의 사업입니다.',
    support: '점포당 공급가액의 일부를 지원하는 형태입니다. 금액과 비율은 실제 공고문에서 확인해야 합니다.',
    calculation: '예시 자료라 금액을 제시하지 않습니다.', documents: ['사업자등록증명', '소상공인확인서', '사업계획서'],
    startsAt: ymdIn(-20), endsAt: ymdIn(12), maxAmount: 3000000,
    rules: [{ scope: 'business', field: 'province', operator: 'eq', value: '경기', label: '사업장 소재지(경기도)' }, { scope: 'business', field: 'employees', operator: 'lte', value: 4, label: '상시 근로자 5인 미만' }] }),
  sample({ id: 'ex-seoul-youth', title: '[예시] 서울시 청년 자격증 응시료 지원', audience: '개인', category: '교육', region: '서울', agency: '서울특별시',
    sourceUrl: 'https://www.seoul.go.kr/', summary: '화면 확인용 예시 공고입니다. 청년의 어학·자격시험 응시료를 지원하는 형태의 사업입니다.',
    support: '응시료 실비를 연 1회 지원하는 형태입니다.', calculation: '예시 자료라 금액을 제시하지 않습니다.',
    documents: ['응시 확인서', '주민등록초본'], startsAt: ymdIn(-40), endsAt: ymdIn(3), maxAmount: 100000,
    rules: [{ scope: 'personal', field: 'age', operator: 'lte', value: 39, label: '만 39세 이하' }] }),
  sample({ id: 'ex-busan-export', title: '[예시] 부산 수출 초보기업 해외마케팅 지원', audience: '사업', category: '수출', region: '부산', agency: '부산경제진흥원',
    summary: '화면 확인용 예시 공고입니다. 지역이 다른 경우의 안내 문구를 확인하기 위한 자료입니다.',
    support: '해외 전시회 참가와 홍보물 번역을 지원하는 형태입니다.', calculation: '예시 자료라 금액을 제시하지 않습니다.',
    documents: ['사업자등록증명', '수출실적증명'], startsAt: ymdIn(-10), endsAt: ymdIn(25), maxAmount: 10000000,
    rules: [{ scope: 'business', field: 'province', operator: 'eq', value: '부산', label: '사업장 소재지(부산)' }] }),
  sample({ id: 'ex-energy-voucher', title: '[예시] 에너지 비용 부담 완화 바우처', audience: '가구', category: '생활', region: '전국', agency: '산업통상자원부',
    sourceUrl: 'https://www.gov.kr/', summary: '화면 확인용 예시 공고입니다. 상시 접수이며 예산 소진 시 종료되는 형태입니다.',
    support: '전기·가스 요금 차감 바우처 형태입니다.', calculation: '예시 자료라 금액을 제시하지 않습니다.',
    documents: ['주민등록등본'], checks: ['가구원 구성과 소득 기준'], status: '접수 중', budgetStatus: '확인 필요', maxAmount: 300000 }),
  sample({ id: 'ex-hire-support', title: '[예시] 소상공인 신규 고용 인건비 지원', audience: '사업', category: '고용', region: '전국', agency: '고용노동부',
    sourceUrl: 'https://www.moel.go.kr/', summary: '화면 확인용 예시 공고입니다. 직원을 새로 채용한 소상공인에게 인건비 일부를 지원하는 형태입니다.',
    support: '신규 채용 1인당 월 일정액을 최대 12개월 지원하는 형태입니다.', calculation: '예시 자료입니다. 실제 금액은 공고문 기준입니다.',
    documents: ['사업자등록증명', '근로계약서', '4대보험 가입자 명부'], checks: ['채용일과 고용 유지 기간'], startsAt: ymdIn(-30), endsAt: ymdIn(40), maxAmount: 7200000,
    rules: [{ scope: 'business', field: 'employees', operator: 'lte', value: 9, label: '상시 근로자 10인 미만' }] }),
  sample({ id: 'ex-livelihood', title: '[예시] 민생회복 지원금 (전 국민)', audience: '개인', category: '생활', region: '전국', agency: '행정안전부',
    sourceUrl: 'https://www.gov.kr/', summary: '화면 확인용 예시 공고입니다. 사업자 여부와 관계없이 국민 누구나 신청하는 형태의 지원금입니다.',
    support: '1인당 정액을 지역화폐·카드 포인트로 지급하는 형태입니다.', calculation: '예시 자료입니다. 실제 금액은 공고문 기준입니다.',
    documents: ['본인 확인 수단'], startsAt: ymdIn(-5), endsAt: ymdIn(50), maxAmount: 250000 }),
  sample({ id: 'ex-closed-rent', title: '[예시] 소상공인 임차료 부담 경감 (마감)', audience: '사업', category: '경영', region: '경기도', agency: '경기도',
    summary: '화면 확인용 예시 공고입니다. 지난 공고 화면을 확인하기 위한 자료입니다.',
    support: '임차료 일부를 지원했던 형태입니다.', calculation: '예시 자료라 금액을 제시하지 않습니다.',
    documents: ['임대차계약서', '사업자등록증명'], startsAt: '2026-02-02', endsAt: '2026-03-13', status: '마감', maxAmount: 2000000,
    rules: [{ scope: 'business', field: 'province', operator: 'eq', value: '경기', label: '사업장 소재지(경기도)' }] }),
  sample({ id: 'ex-closed-digital', title: '[예시] 소상공인 스마트기기 도입 지원 (마감)', audience: '사업', category: '경영', region: '전국', agency: '소상공인시장진흥공단',
    sourceUrl: 'https://www.sbiz24.kr/', summary: '화면 확인용 예시 공고입니다. 키오스크·서빙로봇 등 스마트기기 도입 비용을 지원했던 형태입니다.', support: '도입 비용의 일부를 지원했던 형태입니다.', calculation: '예시 자료입니다.',
    documents: ['사업자등록증명', '견적서'], startsAt: '2026-04-06', endsAt: '2026-05-15', status: '마감', maxAmount: 5000000,
    rules: [{ scope: 'business', field: 'employees', operator: 'lte', value: 9, label: '상시 근로자 10인 미만' }] }),
  sample({ id: 'ex-closed-insurance', title: '[예시] 자영업자 고용보험료 환급 (마감)', kind: '환급금', audience: '사업', category: '보험', region: '전국', agency: '근로복지공단',
    sourceUrl: 'https://www.comwel.or.kr/', summary: '화면 확인용 예시 공고입니다. 자영업자 고용보험료 일부를 돌려줬던 형태입니다.', support: '납부한 보험료의 일부를 환급했던 형태입니다.', calculation: '예시 자료입니다.',
    documents: ['사업자등록증명', '고용보험 가입 확인서'], startsAt: '2026-01-05', endsAt: '2026-06-30', status: '마감', maxAmount: 1200000 }),
  sample({ id: 'ex-closed-energy', title: '[예시] 소상공인 전기요금 특별지원 (마감)', audience: '사업', category: '경영', region: '전국', agency: '중소벤처기업부',
    sourceUrl: 'https://www.mss.go.kr/', summary: '화면 확인용 예시 공고입니다. 연매출이 일정 규모 이하인 소상공인의 전기요금을 지원했던 형태입니다.', support: '전기요금 일부를 정액 지원했던 형태입니다.', calculation: '예시 자료입니다.',
    documents: ['사업자등록증명', '전기요금 납부 확인서'], startsAt: '2026-07-01', endsAt: '2026-09-30', status: '마감', maxAmount: 200000 }),
];
const benefits: Benefit[] = [...(official as Benefit[]), ...SAMPLES];
const notices = () => benefits.filter(publicBenefit);
const finished = (b: Benefit, t = now()) => b.status === '마감' || b.budgetStatus === '소진' || (!!b.endsAt && Number.isFinite(noticeTime(b.endsAt, 'end')) && noticeTime(b.endsAt, 'end') < t);
function historicalMatch(b: Benefit, p: Profile) {
  const ref = Number.isFinite(noticeTime(b.startsAt, 'start')) ? new Date(noticeTime(b.startsAt, 'start')) : Number.isFinite(noticeTime(b.endsAt, 'end')) ? new Date(noticeTime(b.endsAt, 'end')) : new Date(b.checkedAt);
  return matchBenefit({ ...b, status: '접수 중', budgetStatus: '해당 없음', startsAt: '', endsAt: '' }, p, ref).map((m) => ({
    ...m, referenceExclusions: m.exclusions, exclusions: [], result: '추가 확인 필요',
    unknowns: [...m.unknowns, '당시 소재지·업종·소득·매출·고용·가구 조건은 확인되지 않았습니다.'],
    basis: '현재 입력정보 기준 참고 · 당시 조건 확인 필요', referenceYear: new Date(ref.getTime() + 9 * HOUR).getUTCFullYear(),
  }));
}

/* ---------- 계정(가상 인물) ---------- */
interface Prefs { largeText: boolean; notifications: boolean; privacyConsent: boolean; personalizedAlerts: boolean; accountConsent?: boolean; termsConsent?: boolean }
interface User {
  id: string; /** 화면에 보이는 로그인 번호 */ email: string; name?: string; role: 'customer' | 'staff' | 'admin'; profile: Profile; preferences: Prefs;
  trial?: { startedAt: string; endsAt: string }; contract?: { id: string; startsAt: string; endsAt: string; reason: string; evidence: string; revokedAt?: string | null };
  grant?: { expiresAt: string; revoked: boolean; reason: string };
  consents: { kind: string; version: string; content: string; accepted: boolean; recorded_at: string }[];
  readNotices: Set<string>; deleted?: boolean;
}
const CONSENT_VERSION = '2026-10-service-2';
const consentTexts = {
  service: '맞춤 조건 비교·신청 지원 요청 처리를 위해 선택 입력한 개인·가구·사업장 정보를 처리합니다. 계약 이용권, 회사 접수·배정·문의 기록을 관리합니다. 탈퇴 후에도 재체험 방지를 위해 확인된 이메일의 해시와 체험 시각이 별도로 남습니다. 이는 완전한 익명정보라고 단정하지 않으며 보유기간과 법적 근거를 출시 전 확정해야 하는 개발용 초안입니다. 회사 연락처도 출시 전 확정이 필요합니다.',
  marketing: '새 상품·행사 등 마케팅 안내 수신은 선택입니다. 거절하거나 철회해도 무료체험·계약 서비스에 불이익이 없습니다.',
};
const emptyProfile = (): Profile => ({ personal: {}, businesses: [], step: 0 });
const filledProfile = (): Profile => ({
  personal: { birthYear: 1964, province: '경기도' },
  businesses: [{ id: 'biz-1', name: '행복한 밥상', province: '경기도', district: '수원시', entity: '개인사업자', industry: '음식점', openedAt: '2015-03-02', revenue: '1억~3억 원', employees: 2 }],
  step: 10,
});
const serviceConsent = (at: number) => [{ kind: 'service', version: CONSENT_VERSION, content: consentTexts.service, accepted: true, recorded_at: isoIn(at) }];
const mk = (u: Partial<User> & Pick<User, 'id' | 'email'>): User => ({
  role: 'customer', profile: emptyProfile(), preferences: { largeText: false, notifications: false, privacyConsent: false, personalizedAlerts: false, accountConsent: true, termsConsent: true },
  consents: [], readNotices: new Set(), ...u,
});
const users = new Map<string, User>();
function seedUsers() {
  users.clear();
  const consented: Prefs = { largeText: false, notifications: true, privacyConsent: true, personalizedAlerts: true, accountConsent: true, termsConsent: true };
  for (const u of [
    mk({ id: 'demo-free', email: '010-1000-0001', name: '김무료' }),
    mk({ id: 'demo-trial', email: '010-1000-0002', name: '이체험', profile: filledProfile(), preferences: { ...consented }, consents: serviceConsent(-21 * HOUR), trial: { startedAt: isoIn(-20 * HOUR), endsAt: isoIn(52 * HOUR) } }),
    mk({ id: 'demo-contract', email: '010-1000-0003', name: '박계약', profile: filledProfile(), preferences: { ...consented }, consents: serviceConsent(-40 * DAY), contract: { id: 'contract-0001', startsAt: isoIn(-30 * DAY), endsAt: isoIn(335 * DAY), reason: '연간 지원금 패키지 계약', evidence: '계약서 2026-0912호' } }),
    mk({ id: 'demo-expired', email: '010-1000-0004', name: '최종료', profile: filledProfile(), preferences: { ...consented, personalizedAlerts: false }, consents: serviceConsent(-10 * DAY), trial: { startedAt: isoIn(-9 * DAY), endsAt: isoIn(-6 * DAY) } }),
    mk({ id: 'demo-staff', email: '010-1000-0005', name: '김서연', role: 'staff', preferences: { ...consented, personalizedAlerts: false } }),
    mk({ id: 'demo-admin', email: '010-1000-0006', name: '관리자', role: 'admin', preferences: { ...consented, personalizedAlerts: false } }),
  ]) users.set(u.id, u);
}

/* ---------- 나머지 저장소 ---------- */
interface Req { id: string; user_id: string; benefit_id: string; business_id: string; kind: string; state: string; assigned_to: string | null; snapshot: Record<string, unknown>; customer_tasks: string[]; staff_tasks: string[]; completed_tasks: string[]; internal_note: string; created_at: string; updated_at: string }
interface Inquiry { id: string; user_id: string; title: string; body: string; state: string; replies: { body: string; at: string; author?: string }[]; request_key: string; created_at: string }
let tracking = new Map<string, Record<string, unknown>>(); // `${uid}|${benefitId}`
let requests: Req[] = [];
let inquiries: Inquiry[] = [];
let inbox: { id: string; user_id: string; benefit_id: string; read_at: string | null; created_at: string }[] = [];
let staff = new Map<string, { user_id: string; name: string; phone: string; kakao: string; enabled: boolean }>();
let company = { phone: '', kakao: '', website: '' };
let auditLog: Record<string, unknown>[] = [];
let ownerCodes = new Map<string, string>();
const STAFF_TASKS = ['공식 원문과 마감·예산 재확인', '부족정보·중복수혜를 고객과 확인', '서류 발급처 확인 후 안내', '공식 신청처와 행동 순서 안내', '기관 접수 여부를 고객에게 확인 (미확인 시 완료 표시 금지)'];
const audit = (actor: string, action: string, subject: string, data: unknown) => { auditLog.unshift({ id: auditLog.length + 1, actor, action, subject, data, created_at: new Date().toISOString() }); };
function snapshotOf(b: Benefit, decision: unknown) {
  return { decision, profileUpdatedBasis: '접수 시 입력정보 기준', title: b.title, sourceUrl: b.sourceUrl, sourceId: b.sourceId, checkedAt: b.checkedAt, endsAt: b.endsAt, documents: b.documents, checks: b.checks, warning: '회사 접수이며 기관 신청·승인·지급 완료가 아닙니다.' };
}
function seedRequest(userId: string, benefitId: string, state: string, assigned: string | null, done: string[], agoH: number) {
  const b = benefits.find((x) => x.id === benefitId)!; const u = users.get(userId)!;
  const decision = matchBenefit(b, u.profile).find((m) => m.businessId === (u.profile.businesses[0]?.id ?? '')) ?? matchBenefit(b, u.profile)[0];
  const tasks = b.documents.map((d) => `${d} 준비 · 발급처는 공식 원문 확인`);
  requests.push({ id: newId('req'), user_id: userId, benefit_id: benefitId, business_id: decision.businessId, kind: '신청 지원', state, assigned_to: assigned, snapshot: snapshotOf(b, decision), customer_tasks: tasks, staff_tasks: [...STAFF_TASKS], completed_tasks: done.map((i) => tasks[Number(i)]).filter(Boolean), internal_note: '', created_at: isoIn(-agoH * HOUR), updated_at: isoIn(-(agoH / 3) * HOUR) });
}
export function resetPreview() {
  seq = 1; seedUsers();
  tracking = new Map(); requests = []; inquiries = []; inbox = []; auditLog = []; ownerCodes = new Map();
  staff = new Map([['demo-staff', { user_id: 'demo-staff', name: '김서연 매니저', phone: '031-555-0100', kakao: 'https://pf.kakao.com/_example/chat', enabled: true }]]);
  company = { phone: '1588-0000', kakao: 'https://pf.kakao.com/_example/chat', website: '' };
  const tr = (uid: string, id: string, data: Record<string, unknown>) => tracking.set(`${uid}|${id}`, { benefitId: id, updatedAt: isoIn(-5 * HOUR), verification: '고객이 직접 기록한 상태입니다. 기관 접수·선정·지급이 확인된 정보가 아닙니다.', ...data });
  tr('demo-trial', 'ex-gg-smallbiz', { saved: true, stage: '신청 준비', checkedDocuments: ['사업자등록증명'], deadlineReminder: true });
  tr('demo-trial', 'nts-earned-income', { saved: true, stage: '관심', checkedDocuments: [], deadlineReminder: false });
  tr('demo-free', 'bizinfo-sodam-2026', { saved: true, stage: '관심', checkedDocuments: [], deadlineReminder: false });
  tr('demo-expired', 'ex-gg-smallbiz', { saved: true, stage: '신청 준비', checkedDocuments: [], deadlineReminder: false });
  seedRequest('demo-trial', 'ex-gg-smallbiz', '자료 준비', 'demo-staff', ['0'], 18);
  seedRequest('demo-contract', 'ex-gg-smallbiz', '회사 접수', null, [], 3);
  seedRequest('demo-expired', 'ex-gg-smallbiz', '공식 신청 안내', 'demo-staff', ['0', '1'], 190);
  inquiries.push({ id: newId('inq'), user_id: 'demo-trial', title: '사업계획서 양식이 따로 있나요?', body: '경기도 지원사업 신청할 때 사업계획서를 정해진 양식으로 써야 하는지 궁금합니다.', state: '답변 완료', replies: [{ body: '공고문 첨부 양식을 사용하셔야 합니다. 담당자가 양식 위치를 안내해 드릴게요.', at: isoIn(-6 * HOUR), author: '회사 담당자' }], request_key: 'seed-inq-1', created_at: isoIn(-15 * HOUR) });
  inquiries.push({ id: newId('inq'), user_id: 'demo-expired', title: '이용 기간이 끝났는데 접수 건은 계속 진행되나요?', body: '체험이 끝났습니다. 이미 접수한 건은 어떻게 되는지 알려 주세요.', state: '접수됨', replies: [], request_key: 'seed-inq-2', created_at: isoIn(-30 * HOUR) });
  inbox.push({ id: newId('inbox'), user_id: 'demo-trial', benefit_id: 'ex-energy-voucher', read_at: null, created_at: isoIn(-4 * HOUR) });
  inbox.push({ id: newId('inbox'), user_id: 'demo-trial', benefit_id: 'ex-gg-smallbiz', read_at: isoIn(-19 * HOUR), created_at: isoIn(-19.5 * HOUR) });
}
resetPreview();

/* ---------- 계정 계산 (서버 account()와 같은 규칙) ---------- */
export function previewUser(id: string | null) { return id ? users.get(id) : undefined; }
export function ensureUser(id: string, email: string, name?: string) { if (!users.has(id)) users.set(id, mk({ id, email, name })); return users.get(id)!; }
class HttpError extends Error { constructor(public status: number, message: string, public detail?: unknown) { super(message); } }
const fail = (message: string, status = 400, detail?: unknown) => new HttpError(status, message, detail);
function account(id: string) {
  const u = users.get(id); if (!u) throw fail('로그인이 필요합니다.', 401);
  if (u.deleted) throw fail('삭제된 계정입니다.', 410);
  const t = now();
  const grantActive = !!u.grant && !u.grant.revoked && Date.parse(u.grant.expiresAt) > t;
  const trialActive = !!u.trial && Date.parse(u.trial.endsAt) > t;
  const contractActive = !!u.contract && !u.contract.revokedAt && Date.parse(u.contract.startsAt) <= t && Date.parse(u.contract.endsAt) > t;
  const consent = u.consents.find((c) => c.kind === 'service');
  const active = (grantActive || trialActive || contractActive) && consent?.accepted !== false;
  return {
    id: u.id, role: u.role, profile: u.profile, serverNow: new Date(t).toISOString(),
    preferences: { ...u.preferences, personalizedAlerts: active && u.preferences.personalizedAlerts },
    entitlement: { active, subscriptionActive: false, grantActive, ...(u.grant ? { grantUntil: u.grant.expiresAt } : {}), trialActive, contractActive, trialStartedAt: u.trial?.startedAt, trialUntil: u.trial?.endsAt, contractUntil: contractActive ? u.contract!.endsAt : undefined },
  };
}
const need = (id: string | null) => { if (!id) throw fail('로그인이 필요합니다.', 401); return id; };
const visible = (id: string) => { const b = notices().find((x) => x.id === id); if (!b) throw fail('공개된 혜택을 찾을 수 없습니다.', 404); return b; };
function matches(id: string, period: string, year: number, office = false) {
  const a = account(id); if (!a.entitlement.active && !office) throw fail('맞춤 확인은 유효 이용권이 필요합니다.', 403);
  const t = now();
  return notices().filter((b) => (period === 'past' ? finished(b, t) : !finished(b, t))).filter((b) => {
    if (period !== 'past') return true;
    const ended = noticeTime(b.endsAt, 'end'); const x = Number.isFinite(ended) ? ended : Date.parse(b.checkedAt);
    return Number.isFinite(x) && new Date(x + 9 * HOUR).getUTCFullYear() === year;
  }).map((b) => ({
    benefit: b, closed: finished(b, t), matches: period === 'past' ? historicalMatch(b, a.profile) : matchBenefit(b, a.profile, new Date(t)),
    basis: period === 'past' ? '현재 입력정보 기준 참고 · 당시 조건 확인 필요' : '현재 입력정보 기준',
    noticeYear: b.startsAt ? new Date(noticeTime(b.startsAt, 'start') + 9 * HOUR).getUTCFullYear() : null,
    closureBasis: b.endsAt ? '공식 신청기간' : b.status === '마감' ? '종료 상태 확인' : '예산 소진 확인',
    warning: '조건이 맞아도 선정·예산·중복수혜 검토에 따라 지급되지 않을 수 있습니다.',
  }));
}
const noticeHash = (r: Req) => JSON.stringify([r.state, r.assigned_to, r.customer_tasks, r.completed_tasks]);
const officeRow = (r: Req) => { const s = r.assigned_to ? staff.get(r.assigned_to) : undefined; const on = s?.enabled ? s : undefined; return { ...r, staff_name: on?.name ?? null, staff_phone: on?.phone ?? null, staff_kakao: on?.kakao ?? null }; };
function officeAccess(id: string) {
  const a = account(id); if (a.role === 'admin') return a;
  if (a.role !== 'staff' || !staff.get(a.id)?.enabled) throw fail('회사 담당자만 이용할 수 있습니다.', 403);
  return a;
}

/* ---------- 라우팅 ---------- */
type Body = Record<string, unknown>;
function route(method: string, path: string, query: URLSearchParams, body: Body, me: string | null): unknown {
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent); // api, ...
  const p = '/' + seg.slice(1).join('/');
  const M = (m: string, re: RegExp) => (method === m ? re.exec(p) : null);
  let x: RegExpExecArray | null;

  if (M('GET', /^\/healthz$/)) return { status: 'ok' };
  if (M('GET', /^\/benefits$/)) {
    let items = notices();
    for (const key of ['kind', 'audience', 'region', 'status'] as const) {
      const v = query.get(key);
      if (v && v !== '전체') items = items.filter((b) => b[key] === v || (key === 'region' && b.region === '전국'));
    }
    const s = query.get('search');
    if (s !== null) { const q = s.trim().slice(0, 200).toLowerCase(); items = items.filter((b) => `${b.title} ${b.summary} ${b.category} ${b.agency} ${b.support}`.toLowerCase().includes(q)); }
    return items;
  }
  if ((x = M('GET', /^\/benefits\/([^/]+)$/))) return visible(x[1]);
  if (M('GET', /^\/membership$/)) return { configured: false, mode: 'disabled', products: { apple: '', google: '' }, message: '스토어 상품·월요금·구매 검증 연결 전입니다. 현재 구매할 수 없습니다.', entitlement: me ? account(me).entitlement : { active: false, subscriptionActive: false, grantActive: false } };
  if (M('POST', /^\/membership\/(restore|sync)$/)) throw fail('스토어 상품·검증 제공자·웹훅 설정이 필요합니다. 구매 및 복원 완료로 처리하지 않았습니다.', 503);

  const id = need(me);
  const u = users.get(id)!;
  if (M('GET', /^\/me$/)) return account(id);
  if (M('PUT', /^\/profile$/)) {
    if (!account(id).preferences.privacyConsent) throw fail('먼저 개인정보 수집·이용에 동의해 주세요.');
    u.profile = profileSchema.parse(body); return u.profile;
  }
  if (M('GET', /^\/recommendations$/)) {
    const a = account(id); if (!a.entitlement.active) throw fail('맞춤 결과는 유효한 구독 또는 관리자 무상 이용권이 필요합니다.', 403);
    return notices().flatMap((b) => matchBenefit(b, a.profile));
  }
  if (M('GET', /^\/tracking$/)) return [...tracking.entries()].filter(([k]) => k.startsWith(id + '|')).map(([, v]) => v);
  if ((x = M('PUT', /^\/tracking\/([^/]+)$/))) {
    const b = visible(x[1]), input = trackingSchema.parse(body), a = account(id);
    if (input.deadlineReminder && !a.preferences.notifications) throw fail('먼저 알림 수신에 동의해 주세요.');
    if (input.checkedDocuments.some((d) => !b.documents.includes(d))) throw fail('공고의 준비서류만 체크할 수 있습니다.');
    const data = { ...input, benefitId: b.id, updatedAt: new Date().toISOString(), verification: '고객이 직접 기록한 상태입니다. 기관 접수·선정·지급이 확인된 정보가 아닙니다.' };
    tracking.set(`${id}|${b.id}`, data); return data;
  }
  if ((x = M('DELETE', /^\/tracking\/([^/]+)$/))) { tracking.delete(`${id}|${x[1]}`); return { message: '내 저장내역을 삭제했습니다.' }; }
  if (M('PUT', /^\/preferences$/)) {
    const input = preferencesSchema.parse(body), a = account(id);
    if (input.personalizedAlerts && (!input.notifications || !a.entitlement.active)) throw fail('맞춤 알림은 알림 동의와 유효 이용권이 필요합니다.', 403);
    u.preferences = input; if (!input.privacyConsent) u.profile = emptyProfile();
    audit(id, '동의 설정 변경', id, { privacyConsent: input.privacyConsent, notifications: input.notifications });
    return input;
  }
  if (M('POST', /^\/notifications\/device$/)) return { message: '기기 알림 수신 정보를 저장했습니다. 발송·기기 수신 완료를 의미하지 않습니다.' };
  if (M('DELETE', /^\/notifications\/device$/)) return { message: '내 기기 알림 수신 정보를 삭제했습니다.' };
  if (M('POST', /^\/account\/deletion$/)) {
    if (body.confirmation !== '회원 탈퇴') throw fail("확인 문구로 '회원 탈퇴'를 입력해 주세요.");
    u.deleted = true; requests = requests.filter((r) => r.user_id !== id); inquiries = inquiries.filter((q) => q.user_id !== id);
    return { message: '회원 탈퇴 및 서비스 개인정보 삭제가 완료됐습니다. Apple·Google 구독은 스토어에서 별도로 해지해 주세요.' };
  }

  /* ----- 회사 서비스 ----- */
  if (M('GET', /^\/service\/matches$/)) {
    const year = Number(query.get('year') ?? new Date().getFullYear());
    return { items: matches(id, query.get('period') === 'past' ? 'past' : 'current', year), coverage: '현재 확인된 공식 자료만 비교합니다. 미수집 지역·기간은 포함하지 않습니다.' };
  }
  if (M('GET', /^\/service\/state$/)) {
    const a = account(id), active = a.entitlement.active;
    const mine = requests.filter((r) => r.user_id === id).sort((p1, p2) => p2.created_at.localeCompare(p1.created_at)).map(officeRow);
    const reqs = mine.map((r) => ({ id: r.id, benefitId: r.benefit_id, businessId: r.business_id, kind: r.kind, state: r.state, createdAt: r.created_at, benefitTitle: (r.snapshot?.title as string) ?? '접수한 공고', updatedAt: r.updated_at, snapshot: active ? r.snapshot : null, customerTasks: r.customer_tasks, completedTasks: r.completed_tasks, contact: r.staff_name ? { name: r.staff_name, phone: r.staff_phone, kakao: r.staff_kakao } : null }));
    const companyUpdates = mine.map((r) => ({ id: `company:${r.id}`, requestId: r.id, title: r.state === '회사 접수' ? '회사에 요청이 접수됐어요' : '접수 상태·서류 안내가 변경됐어요', state: r.state, updatedAt: r.updated_at, read: u.readNotices.has(`${r.id}:${noticeHash(r)}`) }));
    const alerts = active && a.preferences.notifications && a.preferences.personalizedAlerts;
    const open = new Map(notices().filter((b) => !finished(b)).map((b) => [b.id, b]));
    return {
      account: a, membership: a.entitlement.contractActive ? '계약회원' : a.entitlement.trialActive ? '3일 체험회원' : active ? '기존 이용권 회원' : '무료회원',
      pushDelivery: alerts ? { enabled: false, state: 'none', message: '아직 확인할 전송 기록이 없습니다.' } : { enabled: false, state: 'unavailable', message: '알림 동의와 유효 이용권이 있을 때 전송 상태를 확인할 수 있습니다.' },
      companyUpdates, consents: [...u.consents].reverse(), consentVersion: CONSENT_VERSION, consentTexts, trialUsed: !!u.trial, requests: reqs,
      inquiries: inquiries.filter((q) => q.user_id === id).sort((p1, p2) => p2.created_at.localeCompare(p1.created_at)),
      inbox: alerts ? inbox.filter((r) => r.user_id === id && open.has(r.benefit_id)).sort((p1, p2) => p2.created_at.localeCompare(p1.created_at)).map((r) => ({ ...r, title: '새 혜택 안내를 확인해 주세요.' })) : [],
      company, limitations: ['체험은 인증 이메일·계정당 1회입니다. 다른 이메일을 쓰는 동일인 본인확인은 미연동입니다.', '실제 푸시·스토어 판매·전국 자동수집은 미연결입니다.'],
    };
  }
  if (M('POST', /^\/service\/consents$/)) {
    const kind = body.kind === 'marketing' ? 'marketing' : 'service', accepted = !!body.accepted;
    if (body.version !== CONSENT_VERSION) throw fail('입력 내용을 확인해 주세요.');
    u.consents.unshift({ kind, version: CONSENT_VERSION, content: consentTexts[kind], accepted, recorded_at: new Date().toISOString() });
    if (kind === 'service') u.preferences = { ...u.preferences, privacyConsent: accepted, ...(!accepted ? { notifications: false, personalizedAlerts: false } : {}) };
    return { message: accepted ? '동의를 저장했습니다.' : '동의를 철회했습니다.' };
  }
  if (M('POST', /^\/service\/trial$/)) {
    const a = account(id);
    if (!a.preferences.privacyConsent || (!a.profile.step && !a.profile.personal.province && !a.profile.businesses.length)) throw fail('서비스 개인정보 동의와 첫 정보 입력 후 시작해 주세요.', 409);
    const latest = u.consents.find((c) => c.kind === 'service');
    if (latest?.accepted !== true || latest.version !== CONSENT_VERSION) throw fail('최신 서비스 동의와 최소 정보 입력을 다시 확인해 주세요.', 409);
    if (u.trial) throw fail('이미 체험을 시작한 계정입니다. 다시 시작하거나 연장할 수 없습니다.', 409);
    u.trial = { startedAt: new Date().toISOString(), endsAt: isoIn(72 * HOUR) }; audit(id, 'trial.start', id, { durationHours: 72 });
    return { message: '연속 72시간 무료체험을 시작했습니다.', account: account(id) };
  }
  if (M('POST', /^\/service\/owner-code$/)) {
    const code = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    ownerCodes.set(code, id); return { code, message: '15분 동안 유효한 본인 계정 연결번호입니다. 회사 담당자에게만 전달해 주세요.' };
  }
  if (M('POST', /^\/service\/requests$/)) {
    const benefitId = String(body.benefitId ?? ''), businessId = String(body.businessId ?? ''), kind = body.kind === '자격 확인' ? '자격 확인' : '신청 지원';
    const b = notices().find((n) => n.id === benefitId); if (!b) throw fail('공개된 공식 공고를 찾을 수 없습니다.', 404);
    const a = account(id); if (!a.entitlement.active) throw fail('유효 체험·계약 또는 기존 이용권이 필요합니다.', 403);
    if (finished(b)) throw fail('마감된 공고는 신청 지원 접수를 할 수 없습니다. 문의 화면을 이용해 주세요.', 409);
    const decision = matchBenefit(b, a.profile, new Date()).find((m) => m.businessId === businessId);
    if (!decision) throw fail('현재 등록된 사업장을 선택해 주세요.', 409);
    if (kind === '신청 지원' && decision.result !== '조건 일치') throw fail(decision.result === '대상 제외' ? '입력 조건과 다른 항목이 있습니다. 정보를 수정하거나 자격확인 문의를 보내 주세요.' : '추가 확인이 필요합니다. 자격확인 문의로 보내 주세요.', 409, decision);
    if (!body.confirmed) throw fail('회사에 요청하는 내용임을 확인해 주세요.');
    const snapshot = snapshotOf(b, decision), tasks = b.documents.map((d) => `${d} 준비 · 발급처는 공식 원문 확인`);
    const prior = requests.find((r) => r.user_id === id && r.benefit_id === b.id && r.business_id === businessId);
    if (prior) {
      if (prior.kind === '자격 확인' && kind === '신청 지원') { Object.assign(prior, { kind, state: '회사 접수', snapshot, customer_tasks: tasks, updated_at: new Date().toISOString() }); return { id: prior.id, message: '조건을 다시 확인하여 기존 문의를 회사 신청 지원 요청으로 전환했습니다. 기관 신청 완료는 아닙니다.' }; }
      return { id: prior.id, message: '이미 회사에 접수한 요청입니다. 기존 접수 내역을 확인해 주세요.' };
    }
    const rid = newId('req'), at = new Date().toISOString();
    requests.push({ id: rid, user_id: id, benefit_id: b.id, business_id: businessId, kind, state: '회사 접수', assigned_to: null, snapshot, customer_tasks: tasks, staff_tasks: [...STAFF_TASKS], completed_tasks: [], internal_note: '', created_at: at, updated_at: at });
    audit(id, 'request.create', rid, { kind });
    return { id: rid, message: '회사에 신청 지원 요청을 저장했습니다. 정부기관에 신청된 것은 아닙니다.' };
  }
  if (M('POST', /^\/service\/inquiries$/)) {
    const title = String(body.title ?? '').trim(), text = String(body.body ?? '').trim(), key = String(body.requestKey ?? '');
    if (!title || !text || key.length < 8) throw fail('입력 내용을 확인해 주세요.');
    const prior = inquiries.find((q) => q.user_id === id && q.request_key === key);
    if (prior) return { id: prior.id, message: '회사 문의함에 저장했습니다.' };
    const qid = newId('inq'); inquiries.push({ id: qid, user_id: id, title, body: text, state: '접수됨', replies: [], request_key: key, created_at: new Date().toISOString() });
    return { id: qid, message: '회사 문의함에 저장했습니다.' };
  }
  if ((x = M('POST', /^\/service\/inbox\/([^/]+)\/read$/))) {
    if (x[1].startsWith('company:')) {
      const r = requests.find((q) => q.id === x![1].slice(8) && q.user_id === id); if (!r) throw fail('내 접수 알림을 찾을 수 없습니다.', 404);
      u.readNotices.add(`${r.id}:${noticeHash(r)}`); return { message: '접수 알림을 확인했어요.' };
    }
    const a = account(id); if (!a.entitlement.active || !a.preferences.notifications || !a.preferences.personalizedAlerts) throw fail('현재 맞춤 알림을 이용할 수 없습니다.', 403);
    const row = inbox.find((r) => r.id === x![1] && r.user_id === id); if (!row) throw fail('알림을 찾을 수 없습니다.', 404);
    row.read_at = new Date().toISOString();
    const b = notices().find((n) => n.id === row.benefit_id); if (!b || finished(b)) throw fail('공고가 마감되거나 비공개로 변경되었습니다.', 409);
    return { benefitId: b.id };
  }

  /* ----- 회사 업무(직원·관리자) ----- */
  if (M('GET', /^\/office\/state$/)) {
    const a = officeAccess(id), admin = a.role === 'admin';
    const rows = requests.filter((r) => admin || r.assigned_to === id).filter((r) => !users.get(r.user_id)?.deleted).sort((p1, p2) => p2.created_at.localeCompare(p1.created_at)).map(officeRow);
    const mineIds = new Set(requests.filter((r) => r.assigned_to === id).map((r) => r.user_id));
    return {
      admin, requests: rows,
      customers: [...users.values()].filter((c) => !c.deleted && (admin || mineIds.has(c.id))).map((c) => ({ id: c.id, role: c.role, profile: c.profile, name: c.name, phone: c.email })),
      inquiries: inquiries.filter((q) => admin || mineIds.has(q.user_id)).sort((p1, p2) => p2.created_at.localeCompare(p1.created_at)),
      staff: admin ? [...staff.values()] : [],
      contracts: admin ? [...users.values()].filter((c) => c.contract).map((c) => ({ id: c.contract!.id, user_id: c.id, starts_at: c.contract!.startsAt, ends_at: c.contract!.endsAt, reason: c.contract!.reason, evidence: c.contract!.evidence, revoked_at: c.contract!.revokedAt ?? null })) : [],
      company, contractPolicy: '169만원 연간 패키지 계약의 계정 연결 기록입니다. 여기서 결제하지 않습니다. 외부 계약의 디지털 이용권 제공은 스토어 심사 적합성 별도 검토가 필요합니다.',
    };
  }
  if ((x = M('GET', /^\/office\/customers\/([^/]+)\/matches$/))) {
    const a = officeAccess(id);
    if (a.role !== 'admin' && !requests.some((r) => r.user_id === x![1] && r.assigned_to === id)) throw fail('배정된 고객만 확인할 수 있습니다.', 403);
    if (!account(x[1]).preferences.privacyConsent) throw fail('고객의 서비스 개인정보 동의를 확인해 주세요.', 403);
    return { items: matches(x[1], query.get('period') === 'past' ? 'past' : 'current', Number(query.get('year') ?? new Date().getFullYear()), true) };
  }
  if (M('POST', /^\/office\/contracts$/)) {
    if (officeAccess(id).role !== 'admin') throw fail('관리자만 계약을 관리할 수 있습니다.', 403);
    let target: User | undefined;
    if (body.id) target = [...users.values()].find((c) => c.contract?.id === body.id);
    else { const owner = ownerCodes.get(String(body.accountCode ?? '')); if (!owner) throw fail('계정 연결번호가 만료되었거나 사용되었습니다.', 409); ownerCodes.delete(String(body.accountCode)); target = users.get(owner); }
    if (!target) throw fail('계약을 찾을 수 없습니다.', 404);
    const cid = String(body.id ?? newId('contract'));
    target.contract = { id: cid, startsAt: String(body.startsAt), endsAt: String(body.endsAt), reason: String(body.reason), evidence: String(body.evidence), revokedAt: body.revoke ? new Date().toISOString() : null };
    audit(id, body.revoke ? 'contract.revoke' : body.id ? 'contract.extend' : 'contract.bind', target.id, { id: cid });
    return { id: cid, userId: target.id, message: body.revoke ? '계약 이용권을 회수했습니다.' : '계약 이용권을 저장했습니다.' };
  }
  if (M('POST', /^\/office\/staff$/)) {
    if (officeAccess(id).role !== 'admin') throw fail('관리자만 직원을 등록할 수 있습니다.', 403);
    const target = users.get(String(body.userId)); if (!target) throw fail('삭제된 계정입니다.', 410);
    if (target.role === 'admin') throw fail('관리자 계정의 역할은 이 화면에서 변경할 수 없습니다.', 409);
    staff.set(target.id, { user_id: target.id, name: String(body.name), phone: String(body.phone ?? ''), kakao: String(body.kakao ?? ''), enabled: !!body.enabled });
    target.role = body.enabled ? 'staff' : 'customer'; audit(id, 'staff.update', target.id, {});
    return { message: '직원과 업무 연락처를 저장했습니다.' };
  }
  if (M('PUT', /^\/office\/settings$/)) {
    if (officeAccess(id).role !== 'admin') throw fail('관리자만 회사 문의 주소를 설정할 수 있습니다.', 403);
    company = { phone: String(body.phone ?? ''), kakao: String(body.kakao ?? ''), website: String(body.website ?? '') };
    return { message: '회사 문의 경로를 저장했습니다.' };
  }
  if ((x = M('PUT', /^\/office\/requests\/([^/]+)$/))) {
    const a = officeAccess(id), r = requests.find((q) => q.id === x![1]);
    if (!r || (a.role !== 'admin' && r.assigned_to !== id)) throw fail('접수에 접근할 수 없습니다.', 403);
    if (a.role !== 'admin' && body.assignedTo !== undefined && body.assignedTo !== r.assigned_to) throw fail('담당자 변경은 관리자만 할 수 있습니다.', 403);
    const assignee = body.assignedTo === undefined ? r.assigned_to : (body.assignedTo as string | null);
    if (assignee && !staff.get(assignee)?.enabled) throw fail('활성 직원을 선택해 주세요.');
    Object.assign(r, { assigned_to: assignee, state: String(body.state), internal_note: (body.internalNote as string) ?? r.internal_note, customer_tasks: body.customerTasks as string[], staff_tasks: body.staffTasks as string[], completed_tasks: body.completedTasks as string[], updated_at: new Date().toISOString() });
    audit(id, 'request.update', r.id, { state: r.state, assignedTo: assignee });
    return { message: '회사 진행상태와 업무를 저장했습니다. 기관 처리 결과는 아닙니다.' };
  }
  if ((x = M('POST', /^\/office\/inquiries\/([^/]+)\/reply$/))) {
    const a = officeAccess(id), q = inquiries.find((i) => i.id === x![1]); if (!q) throw fail('문의를 찾을 수 없습니다.', 404);
    if (a.role !== 'admin' && !requests.some((r) => r.user_id === q.user_id && r.assigned_to === id)) throw fail('배정된 고객의 문의만 답변할 수 있습니다.', 403);
    q.state = String(body.state); q.replies = [...q.replies, { body: String(body.body), at: new Date().toISOString(), author: '회사 담당자' }];
    return { message: '고객에게 표시되는 답변을 저장했습니다.' };
  }

  /* ----- 관리자 ----- */
  if (p.startsWith('/admin/')) {
    if (account(id).role !== 'admin') throw fail('관리자만 이용할 수 있습니다.', 403);
    if (M('GET', /^\/admin\/dashboard$/)) return {
      benefits, users: [...users.values()].filter((c) => !c.deleted).map((c) => ({ ...account(c.id), email: c.email, displayName: c.email, identityStatus: '인증 계정 확인' })),
      audit: auditLog.slice(0, 300), deletions: [],
      connections: [
        { name: '소상공인24·지자체', status: '미연동', reason: '허용 공개 경로·이용조건 검토 필요' },
        { name: 'Apple / Google 구독', status: '미연동', reason: '개발자 계정·상품·가격·RevenueCat 검증 연결 필요' },
        { name: '푸시', status: '설정 대기', reason: 'Expo 푸시 발송 코드는 준비됨. EAS/APNs/FCM 자격증명·운영 설정과 실기기 수신 확인 필요' },
        { name: '환급금 자동조회', status: '미연동', reason: '기관 조회 연동 없음. 종류와 공식 조회 경로만 안내' },
        { name: '기업마당·정부24·복지로', status: '미리보기', reason: '미리보기에서는 공식 수집을 실행하지 않습니다.' },
      ],
    };
    if (M('POST', /^\/admin\/feeds\//)) throw fail('미리보기에서는 공식 자료 수집을 실행하지 않습니다.', 503);
    if (M('POST', /^\/admin\/benefits$/) || M('PUT', /^\/admin\/benefits\/[^/]+$/)) {
      const b = body as unknown as Benefit, i = benefits.findIndex((n) => n.id === b.id);
      if (i >= 0) benefits[i] = b; else benefits.unshift(b);
      audit(id, i >= 0 ? '공고 수정·검토' : '공고 등록', b.id, {}); return b;
    }
    if ((x = M('PUT', /^\/admin\/grants\/([^/]+)$/))) {
      const target = users.get(x[1]); if (!target) throw fail('고객을 찾을 수 없습니다.', 404);
      target.grant = { expiresAt: String(body.expiresAt), revoked: !!body.revoke, reason: String(body.reason) };
      audit(id, body.revoke ? '무상 이용권 회수' : '무상 이용권 부여·기간 변경', target.id, {});
      return { message: body.revoke ? '무상 이용권을 회수했습니다. 유효 구독이 있으면 맞춤 이용은 유지됩니다.' : '외부 결제와 무관한 무상 이용권을 저장했습니다.' };
    }
    if (M('POST', /^\/admin\/deletions\/[^/]+$/)) return { message: '삭제 요청을 처리했습니다.' };
  }
  throw fail('미리보기에서 지원하지 않는 요청입니다.', 404);
}

/* ---------- fetch 가로채기 ---------- */
let currentUser: () => string | null = () => null;
export function installPreviewServer(getUser: () => string | null) {
  currentUser = getUser;
  const g = globalThis as unknown as { fetch: typeof fetch; __irounPreview?: boolean };
  if (g.__irounPreview) return;
  g.__irounPreview = true;
  const original = g.fetch?.bind(globalThis);
  g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const url = new URL(raw, 'http://preview.local');
    if (!url.pathname.startsWith('/api/')) return original ? original(input, init) : Promise.reject(new Error('offline'));
    const req = typeof input === 'object' && !(input instanceof URL) ? (input as Request) : undefined;
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
    let body: Body = {};
    try { const text = typeof init?.body === 'string' ? init.body : req && method !== 'GET' ? await req.clone().text() : ''; if (text) body = JSON.parse(text) as Body; } catch { body = {}; }
    await new Promise((r) => setTimeout(r, 120)); // 실제 통신처럼 약간의 지연
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    try { return json(route(method, url.pathname, url.searchParams, body, currentUser())); }
    catch (e) {
      const err = e as HttpError & { issues?: unknown };
      if (err.issues) return json({ message: '입력 정보를 확인해 주세요. 허용되지 않은 항목이나 잘못된 값이 있습니다.', error: '입력 내용을 확인해 주세요.' }, 400);
      const status = err.status ?? 500, message = err.status ? err.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      if (!err.status) console.error('[preview]', e);
      return json({ message, error: message, ...(err.detail ? { detail: err.detail } : {}) }, status);
    }
  };
}
