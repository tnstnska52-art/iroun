import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { checkLeadInput, sendToCrm, toCrmLead } from "./check-leads";

const input = checkLeadInput.parse({ name: "가상대표", phone: "010-5555-0099", bizName: "가상식당", industry: "음식점", province: "서울특별시", district: "마포구", openedYear: 2022, employeeBand: "1~4명", entity: "개인", revNow: "1억~3억 원", revLast: "1억~3억 원",
  loans: [{ kind: "은행 신용대출", amountBand: "3천만~5천만 원", rateBand: "5~6%" }, { kind: "카드론·캐피탈", amountBand: "1천만 원 미만", rateBand: "잘 모르겠어요" }, { kind: "없음" }], supportThisYear: 29_730_000, supportLastYear: 0, sureCount: 12, consent: true });

describe("홈페이지 조회 고객 → 전산", () => {
  it("구간을 가운데 값(만 원·%)으로 바꾸고, 금액은 만 원으로", () => {
    const x = toCrmLead(input);
    expect(x.phone).toBe("01055550099");
    expect(x.loans).toEqual([{ kind: "은행 신용대출", amount: 4000, rate: 5.5, amountBand: "3천만~5천만 원", rateBand: "5~6%" }, { kind: "카드론·캐피탈", amount: 500, rate: 0, amountBand: "1천만 원 미만", rateBand: "잘 모르겠어요" }]);
    expect(x.supportThisYear).toBe(2973);
    expect(x.supportLastYear).toBeNull();
  });
  it("간소화된 질문의 선택값을 그대로 전달하며 제거된 질문의 답을 만들지 않는다", () => {
    const simple = checkLeadInput.parse({ name: "가상대표", phone: "01055550099", consent: true, questionnaireVersion: 2, revenueYear: 2026, openedYear: 2022, revNow: "1000~5000만원", revLast: "2억 이상", creditBand: "700~750점", currentArrears: "O", premises: "임차" });
    const out = toCrmLead(simple);
    expect(out).toMatchObject({ questionnaireVersion: 2, revenueYear: 2026, openedYear: 2022, revNow: "1000~5000만원", revLast: "2억 이상", creditBand: "700~750점", currentArrears: "O", premises: "임차", loans: [], employeeBand: "" });
    expect(out).not.toHaveProperty("creditNice"); expect(out).not.toHaveProperty("taxArrears");
    expect(toCrmLead(input)).not.toHaveProperty("questionnaireVersion");
    for (const bad of [{ currentArrears: "예" }, { creditBand: "900점 이상" }, { questionnaireVersion: 3 }]) expect(checkLeadInput.safeParse({ ...simple, ...bad }).success).toBe(false);
  });
  it("정책자금 수령 여부(O/X)를 그대로 넘기고, 다른 값은 거절한다", () => {
    const base = { name: "가상대표", phone: "01055550099", consent: true as const };
    expect(toCrmLead(checkLeadInput.parse({ ...base, policyFund: "O" }))).toMatchObject({ policyFund: "O" });
    expect(toCrmLead(checkLeadInput.parse(base))).not.toHaveProperty("policyFund");
    expect(checkLeadInput.safeParse({ ...base, policyFund: "예" }).success).toBe(false);
  });
  it("지원금 도움 요청은 type check.help_request 로, 지원금 정보와 함께 넘긴다", () => {
    const base = { name: "가상대표", phone: "01055550099", consent: true as const };
    const hr = { benefitId: "bizinfo-PBLN_1", title: "가상 고용보험료 지원", amountText: "예상 39만원", amountWon: 390000, endsAt: "2026-12-31", agency: "가상기관", sourceUrl: "https://www.bizinfo.go.kr/x", result: "조건 일치" };
    const out = toCrmLead(checkLeadInput.parse({ ...base, helpRequest: hr }));
    expect(out.type).toBe("check.help_request");
    expect(out.helpRequest).toEqual({ ...hr, amountMan: 39 });
    expect(toCrmLead(checkLeadInput.parse(base)).type).toBe("check.lead");
    expect(toCrmLead(checkLeadInput.parse(base))).not.toHaveProperty("helpRequest");
    expect(checkLeadInput.safeParse({ ...base, helpRequest: { title: "제목만" } }).success).toBe(false);
    expect(checkLeadInput.safeParse({ ...base, helpRequest: { ...hr, memo: "x" } }).success).toBe(false);
    expect(checkLeadInput.safeParse({ ...base, helpRequest: { ...hr, sourceUrl: "javascript:alert(1)" } }).success).toBe(false);
  });
  it("동의 없거나 모르는 항목이 있으면 거절", () => {
    expect(checkLeadInput.safeParse({ ...input, consent: false }).success).toBe(false);
    expect(checkLeadInput.safeParse({ ...input, password: "x" }).success).toBe(false);
    expect(checkLeadInput.safeParse({ ...input, phone: "02-123-4567" }).success).toBe(false);
  });
  it("직원 전용 링크 식별자는 64자리 16진수만 받아 전산에 그대로 넘기고, 없으면 넣지 않는다", () => {
    const token = "ab".repeat(32);
    expect(toCrmLead(checkLeadInput.parse({ ...input, referralToken: token })).referralToken).toBe(token);
    expect("referralToken" in toCrmLead(input)).toBe(false);
    expect(checkLeadInput.safeParse({ ...input, referralToken: "x".repeat(64) }).success).toBe(false);
    expect(checkLeadInput.safeParse({ ...input, referralToken: "ab" }).success).toBe(false);
  });
  it("전산 규격대로 서명한다(키 문자열 그대로, 경로·본문 포함)", async () => {
    const secret = "a".repeat(64);
    process.env.CRM_BASE_URL = "https://crm.example.com"; process.env.CRM_APP_PROFILE_SECRET = secret;
    let seen: { url: string; headers: Record<string, string>; body: string } | undefined;
    const fake = (async (url: URL, init: RequestInit) => { seen = { url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) }; return new Response(JSON.stringify({ accepted: true, result: "created" }), { status: 200 }); }) as unknown as typeof fetch;
    const out = await sendToCrm(toCrmLead(input), fake);
    expect(out.result).toBe("created");
    expect(seen!.url).toBe("https://crm.example.com/api/integration/check-leads");
    const ts = seen!.headers["X-Timestamp"];
    expect(seen!.headers["X-Signature"]).toBe(createHmac("sha256", secret).update(`${ts}\nPOST\n/api/integration/check-leads\n${seen!.body}`).digest("hex"));
    expect(JSON.parse(seen!.body).requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen!.headers.Origin).toBeUndefined();
  });
  it("전산이 거절하면 오류로 돌려준다(다시 보내기 대상)", async () => {
    const fake = (async () => new Response(JSON.stringify({ error: "키" }), { status: 401 })) as unknown as typeof fetch;
    await expect(sendToCrm(toCrmLead(input), fake)).rejects.toMatchObject({ status: 401 });
  });
});
