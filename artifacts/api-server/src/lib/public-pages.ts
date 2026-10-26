/**
 * 앱 밖에서 누구나 여는 공개 안내 페이지(스토어 등록용):
 *  /privacy        개인정보처리방침
 *  /terms          이용약관
 *  /delete-account 계정·데이터 삭제 방법(Google Play 필수)
 *  /support        고객 지원
 * 로그인과 무관하게 응답한다. 고객 자료는 담지 않는다.
 */
import type { Express } from "express";

export const POLICY_EFFECTIVE = "2026년 10월 27일";

const COMPANY = {
  name: "주식회사 이로운사람들",
  ceo: "김진영",
  bizNo: "659-81-03910",
  address: "경기도 시흥시 서울대학로 59-69, 8층 830호(배곧동, 배곧테크노밸리)",
  email: "tnstnska52@naver.com",
  phone: "010-8243-3126",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function page(title: string, body: string) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 이로운사람들</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1a2233;--mut:#5b6678;--line:#e3e8f0;--acc:#0E6DF1}
@media (prefers-color-scheme:dark){:root{--bg:#10151f;--fg:#e8edf5;--mut:#9aa6b8;--line:#263042;--acc:#5b9dff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px;padding-top:16px;border-top:1px solid var(--line)}
p,li{margin:6px 0}small,.mut{color:var(--mut)}table{border-collapse:collapse;width:100%;font-size:14px}
td,th{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}th{background:color-mix(in srgb,var(--acc) 8%,transparent)}
a{color:var(--acc)}nav{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 20px;font-size:14px}
.box{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:12px 0}
</style></head><body><main>
<nav><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a><a href="/delete-account">계정 삭제</a><a href="/support">고객 지원</a></nav>
${body}
<p class="mut" style="margin-top:40px">${esc(COMPANY.name)} · 대표 ${esc(COMPANY.ceo)} · 사업자등록번호 ${esc(COMPANY.bizNo)}<br>${esc(COMPANY.address)}<br>이메일 ${esc(COMPANY.email)} · 전화 ${esc(COMPANY.phone)}</p>
</main></body></html>`;
}

export const privacyHtml = () => page("개인정보처리방침", `
<h1>개인정보처리방침</h1>
<p class="mut">이로운사람들 앱 · 시행일 ${POLICY_EFFECTIVE}</p>
<p>${esc(COMPANY.name)}(이하 "회사")는 「개인정보 보호법」 제30조에 따라 이로운사람들 앱(이하 "서비스") 이용자의 개인정보를 보호하고 관련 고충을 신속히 처리하기 위해 다음과 같이 개인정보처리방침을 정합니다.</p>

<h2>1. 처리하는 개인정보 항목</h2>
<table>
<tr><th>구분</th><th>항목</th><th>수집 시점</th></tr>
<tr><td>회원가입·로그인(필수)</td><td>휴대폰 번호, 비밀번호(암호화 저장, 회사는 원문을 알 수 없음), 이름, 회원 식별자. 카카오 로그인 시 카카오 회원 식별자와 카카오가 제공하는 이름·연락처</td><td>가입할 때</td></tr>
<tr><td>맞춤 지원금 확인(선택, 별도 동의)</td><td>출생연도, 거주 시·도·시군구, 소득 구간, 가구 규모, 부양자녀 수, 주거 형태, 사업장 정보(사업장명, 지역, 업종, 사업자 형태, 개업일, 매출 구간, 직원 수)</td><td>내 정보를 입력할 때</td></tr>
<tr><td>정책자금(융자) 상담 신청(선택)</td><td>이름, 휴대폰 번호, 사업장명, 개인/법인 구분, 개업 연월, 업종, 지역, 최근 3년 매출 구간, 신용점수 구간(KCB·NICE), 기존 대출 기관과 금액 구간, 연체·보증사고·체납 여부, 사업장·주거 형태와 가액 구간</td><td>상담을 신청할 때</td></tr>
<tr><td>신청 지원·서류함(선택)</td><td>고객이 직접 올린 서류 파일(PDF·사진)과 그 안에 담긴 정보, 신청 지원 요청 내용, 문의·답변</td><td>서류를 올리거나 요청할 때</td></tr>
<tr><td>알림(선택)</td><td>기기 푸시 알림 토큰, 알림 수신 설정</td><td>알림을 허용할 때</td></tr>
<tr><td>자동 생성 정보</td><td>서비스 이용 기록, 접속 일시, 오류 기록, 이용권(체험·계약) 상태, 동의 기록</td><td>이용하는 동안</td></tr>
</table>
<p>회사는 주민등록번호, 계좌·카드번호, 건강·종교 등 민감정보를 앱에서 직접 입력받지 않습니다. 다만 고객이 올린 서류에 이러한 정보가 포함되어 있으면, 해당 서류는 신청 지원 목적으로만 열람합니다. 서류를 올리기 전에 필요 없는 정보는 가려 주시기 바랍니다.</p>
<p>카메라 권한은 서류를 촬영해 올릴 때만, 알림 권한은 마감 알림을 받을 때만 요청하며 거부해도 다른 기능은 이용할 수 있습니다. 위치 정보는 수집하지 않습니다.</p>

<h2>2. 처리 목적</h2>
<ul>
<li>회원 가입·본인 확인·로그인, 부정 이용 방지, 1회 무료 체험 관리</li>
<li>입력한 조건과 공개된 정부·지자체·공공기관 공고를 비교해 해당될 수 있는 지원금·환급금 안내</li>
<li>마감 임박·맞춤 공고 알림 발송(동의한 경우)</li>
<li>정책자금 상담, 신청 지원·자격 확인 요청 처리, 담당자 배정과 연락, 문의 응대</li>
<li>회사와 계약한 고객의 이용권 적용(계약 시 등록한 휴대폰 번호와 앱 인증 번호를 대조)</li>
<li>서비스 오류 확인과 개선, 법령상 의무 이행</li>
</ul>
<p>마케팅 안내는 별도 동의한 경우에만 보내며, 동의하지 않아도 서비스 이용에 불이익이 없습니다.</p>

<h2>3. 보유 및 이용 기간</h2>
<p>회원 탈퇴 시 회원 정보, 입력한 조건, 사업장 정보, 서류 파일, 정책자금 상담 신청 정보, 신청 지원·문의 기록, 알림 토큰은 지체 없이 삭제합니다. 다만 다음 정보는 아래 기간 동안 보관한 뒤 삭제합니다.</p>
<table>
<tr><th>보관 정보</th><th>기간</th><th>근거</th></tr>
<tr><td>계약 또는 청약철회 등에 관한 기록</td><td>5년</td><td>전자상거래 등에서의 소비자보호에 관한 법률</td></tr>
<tr><td>대금 결제 및 재화 등의 공급에 관한 기록</td><td>5년</td><td>전자상거래 등에서의 소비자보호에 관한 법률</td></tr>
<tr><td>소비자의 불만 또는 분쟁처리에 관한 기록</td><td>3년</td><td>전자상거래 등에서의 소비자보호에 관한 법률</td></tr>
<tr><td>접속 기록(로그인 일시 등)</td><td>3개월</td><td>통신비밀보호법</td></tr>
<tr><td>무료 체험 재사용 방지용 정보(되돌릴 수 없게 변환한 값과 체험 시각)</td><td>체험 시작 후 1년</td><td>부정 이용 방지(정당한 이익)</td></tr>
<tr><td>운영 감사 기록(누가 언제 어떤 처리를 했는지, 계약 등록·변경 포함. 연락처·서류 내용은 제외)</td><td>기록 후 5년</td><td>전자상거래법상 계약 기록, 분쟁 대응</td></tr>
</table>
<p>정책자금 상담 신청 정보는 마지막 처리 후 1년이 지나면 자동으로 삭제하며, 탈퇴하거나 삭제를 요청하면 그 전에 삭제합니다.</p>

<h2>4. 제3자 제공</h2>
<p>회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자가 신청 지원을 요청하며 특정 기관·전문가 연결에 별도로 동의한 경우, 또는 법령에 근거가 있는 경우에만 필요한 범위에서 제공합니다.</p>

<h2>5. 처리 위탁 및 국외 이전</h2>
<p>회사는 서비스 제공을 위해 다음 업체에 개인정보 처리를 맡기며, 일부는 해외 서버에 저장됩니다(「개인정보 보호법」 제28조의8). 이전은 서비스 이용 시 네트워크를 통해 수시로 이루어집니다. 국외 이전을 원하지 않으면 가입하지 않거나 탈퇴할 수 있으나, 이 경우 로그인이 필요한 기능을 이용할 수 없습니다.</p>
<table>
<tr><th>업체(국가)</th><th>맡기는 일</th><th>이전 항목</th><th>보유 기간</th></tr>
<tr><td>Clerk, Inc.(미국)<br><small>privacy@clerk.dev</small></td><td>회원 가입·로그인·본인 확인 문자</td><td>휴대폰 번호, 이름, 암호화된 비밀번호, 로그인 기록</td><td>회원 탈퇴 시까지</td></tr>
<tr><td>Render Services, Inc.(서버 위치: 싱가포르)<br><small>privacy@render.com</small></td><td>앱 서버·데이터베이스 운영</td><td>서비스에 저장되는 모든 정보</td><td>위 3항의 보유 기간까지</td></tr>
<tr><td>650 Industries, Inc.(Expo, 미국)<br><small>privacy@expo.dev</small></td><td>푸시 알림 전달</td><td>기기 알림 토큰, 알림 내용</td><td>알림 전달 후 즉시(전달 기록 최대 30일)</td></tr>
<tr><td>Google LLC·Apple Inc.(미국)</td><td>앱 배포, 스토어 결제(도입 시)</td><td>스토어 구매 기록(회사는 카드 정보를 받지 않음)</td><td>각 사 정책에 따름</td></tr>
</table>
<p>카카오 로그인을 선택하면 ㈜카카오로부터 위 1항의 정보를 제공받습니다.</p>

<h2>6. 파기 절차 및 방법</h2>
<p>보유 기간이 끝나거나 목적이 달성된 정보는 지체 없이 파기합니다. 전자 파일은 복구할 수 없는 방법으로 삭제하고, 종이 문서는 분쇄하거나 소각합니다.</p>

<h2>7. 이용자의 권리와 행사 방법</h2>
<p>이용자는 언제든지 자신의 개인정보 열람·정정·삭제·처리정지와 동의 철회를 요청할 수 있습니다.</p>
<ul>
<li>앱: 화면 오른쪽 위 <b>내 정보</b>에서 직접 수정하거나 동의를 철회하고, 같은 화면의 <b>회원 탈퇴</b>로 탈퇴</li>
<li>웹: <a href="/delete-account">계정 삭제 안내</a></li>
<li>이메일·전화: 아래 개인정보 보호책임자에게 요청하면 10일 이내에 처리 결과를 알려 드립니다.</li>
</ul>
<p>스토어 구독은 앱 탈퇴로 해지되지 않으므로 Google Play 또는 App Store에서 직접 해지해야 합니다.</p>

<h2>8. 안전성 확보 조치</h2>
<ul>
<li>전송 구간 암호화(HTTPS), 비밀번호 암호화 저장, 휴대폰 번호 대조 시 되돌릴 수 없는 변환값 사용</li>
<li>직원은 배정된 고객의 정보만 열람, 관리자 권한 최소화, 열람·변경 기록 보관</li>
<li>접근 권한 관리와 접속 기록 보관, 개인정보 취급자 교육</li>
</ul>

<h2>9. 자동 수집 장치</h2>
<p>앱은 광고 식별자를 수집하지 않으며, 광고·행태 분석 도구를 사용하지 않습니다. 로그인 유지를 위한 정보는 기기의 보안 저장소에 보관합니다.</p>

<h2>10. 만 14세 미만 아동</h2>
<p>서비스는 사업자와 성인을 대상으로 하며, 만 14세 미만 아동의 가입을 받지 않습니다.</p>

<h2>11. 개인정보 보호책임자</h2>
<div class="box">책임자: 대표이사 ${esc(COMPANY.ceo)}<br>이메일: ${esc(COMPANY.email)}<br>전화: ${esc(COMPANY.phone)} (평일 09:00~18:00)</div>
<p>개인정보 침해에 대한 신고나 상담은 다음 기관에도 문의할 수 있습니다.</p>
<ul>
<li>개인정보침해신고센터: privacy.kisa.or.kr / 국번 없이 118</li>
<li>개인정보분쟁조정위원회: www.kopico.go.kr / 1833-6972</li>
<li>대검찰청: www.spo.go.kr / 국번 없이 1301</li>
<li>경찰청: ecrm.police.go.kr / 국번 없이 182</li>
</ul>

<h2>12. 변경</h2>
<p>이 방침이 바뀌면 시행 7일 전(이용자에게 불리한 변경은 30일 전)부터 앱과 이 페이지에 알립니다.</p>
<p class="mut">시행일: ${POLICY_EFFECTIVE}</p>
`);

export const termsHtml = () => page("이용약관", `
<h1>이용약관</h1>
<p class="mut">이로운사람들 앱 · 시행일 ${POLICY_EFFECTIVE}</p>
<h2>제1조 (목적)</h2><p>이 약관은 ${esc(COMPANY.name)}(이하 "회사")가 제공하는 이로운사람들 앱(이하 "서비스")의 이용 조건과 절차, 회사와 이용자의 권리·의무를 정합니다.</p>
<h2>제2조 (서비스의 성격)</h2><p>서비스는 정부·지자체·공공기관이 공개한 지원금·환급금·정책자금 공고를 모아, 이용자가 입력한 조건과 비교해 보여주는 민간 정보 서비스입니다. 회사는 정부기관이 아니며 기관을 대표하지 않습니다. 회사는 자금을 빌려주거나 대출을 중개하지 않으며, 지원금을 대신 지급하지 않습니다.</p>
<h2>제3조 (회원 가입)</h2><p>휴대폰 번호 인증 또는 카카오 로그인으로 가입합니다. 만 14세 미만은 가입할 수 없습니다. 타인의 정보로 가입하면 이용이 제한될 수 있습니다.</p>
<h2>제4조 (이용 범위)</h2><ul><li>공고 열람은 로그인 없이 무료입니다.</li><li>맞춤 확인 기능은 1회 무료 체험(체험 시작 후 72시간) 또는 회사와의 계약 이용권이 있을 때 제공됩니다.</li><li>유료 요금이 도입되면 금액과 해지 방법을 결제 전에 안내합니다.</li></ul>
<h2>제5조 (결과의 한계)</h2><p>조건 비교 결과는 이용자가 입력한 정보 기준의 참고 결과이며 선정·지급·금액을 보장하지 않습니다. 공고 내용은 기관 사정으로 바뀔 수 있으므로, 신청 전 반드시 공고 원문과 공식 신청처에서 확인해야 합니다.</p>
<h2>제6조 (신청 지원)</h2><p>회사 신청 지원 요청은 회사가 접수해 담당자가 자격·서류·마감을 확인하는 업무 요청이며, 기관 신청 완료를 뜻하지 않습니다. 기관 신청은 이용자 명의로 공식 절차에 따라 진행됩니다. 대리가 필요한 업무는 관련 자격을 가진 전문가와 연결합니다.</p>
<h2>제7조 (이용자의 의무)</h2><p>이용자는 사실과 다른 정보를 입력하거나, 타인의 서류를 무단으로 올리거나, 서비스 운영을 방해해서는 안 됩니다.</p>
<h2>제8조 (탈퇴)</h2><p>이용자는 앱의 설정 화면 또는 <a href="/delete-account">계정 삭제 안내</a>에 따라 언제든 탈퇴할 수 있습니다. 개인정보 처리는 <a href="/privacy">개인정보처리방침</a>에 따릅니다.</p>
<h2>제9조 (책임 제한)</h2><p>회사는 공공기관이 제공한 공고의 오류, 기관의 심사 결과, 이용자가 입력한 정보의 오류로 생긴 손해에 대해 회사의 고의 또는 중대한 과실이 없는 한 책임지지 않습니다.</p>
<h2>제10조 (분쟁 해결)</h2><p>분쟁은 서로 협의해 해결하며, 협의가 안 되면 민사소송법상 관할 법원에서 해결합니다.</p>
<p class="mut">시행일: ${POLICY_EFFECTIVE}</p>
`);

export const deleteHtml = () => page("계정 삭제", `
<h1>계정 및 데이터 삭제 방법</h1>
<p>이로운사람들 앱(개발자: ${esc(COMPANY.name)}) 계정과 데이터는 아래 방법으로 삭제할 수 있습니다.</p>
<h2>방법 1. 앱에서 바로 삭제</h2>
<ol><li>앱에 로그인합니다.</li><li>화면 오른쪽 위 <b>내 정보</b>(사람 모양)를 누르고, 아래쪽 <b>회원 탈퇴</b>를 누릅니다.</li><li>확인 문구 "회원 탈퇴"를 입력하면 바로 처리됩니다.</li></ol>
<p class="mut">보안을 위해 로그인한 지 10분이 지났다면 다시 로그인한 뒤 탈퇴해 주세요.</p>
<h2>방법 2. 앱 없이 요청</h2>
<p>앱을 지웠거나 로그인할 수 없다면, 가입한 휴대폰 번호와 함께 "계정 삭제 요청"이라고 적어 아래로 보내 주세요. 본인 확인 후 7일 이내에 삭제하고 결과를 알려 드립니다.</p>
<div class="box">이메일: <a href="mailto:${esc(COMPANY.email)}?subject=%EA%B3%84%EC%A0%95%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD">${esc(COMPANY.email)}</a><br>전화: ${esc(COMPANY.phone)} (평일 09:00~18:00)</div>
<h2>삭제되는 정보</h2>
<p>회원 정보(휴대폰 번호, 이름, 로그인 정보), 입력한 개인·사업장 조건, 올린 서류 파일, 정책자금 상담 신청 정보, 신청 지원·문의 기록, 저장한 공고와 진행 기록, 알림 설정과 알림 토큰</p>
<h2>일정 기간 보관 후 삭제되는 정보</h2>
<ul><li>계약·결제 기록: 5년, 분쟁 처리 기록: 3년(전자상거래법)</li><li>접속 기록: 3개월(통신비밀보호법)</li><li>무료 체험 재사용 방지용 변환값: 체험 시작 후 1년</li><li>운영 감사 기록(연락처·서류 내용 제외): 기록 후 5년</li></ul>
<p>스토어 구독은 탈퇴로 해지되지 않으니 Google Play 또는 App Store에서 직접 해지해 주세요.</p>
<h2>계정은 두고 일부 정보만 지우기</h2>
<p>앱의 <b>내 정보</b>에서 입력한 조건과 사업장을 지우거나, 개인정보 수집·이용 동의를 철회하면 맞춤 정보가 삭제됩니다. 올린 서류는 서류함에서 하나씩 지울 수 있습니다.</p>
`);

export const supportHtml = () => page("고객 지원", `
<h1>고객 지원</h1>
<div class="box">이메일: <a href="mailto:${esc(COMPANY.email)}">${esc(COMPANY.email)}</a><br>전화: ${esc(COMPANY.phone)} (평일 09:00~18:00)<br>홈페이지: <a href="https://www.irowoon.com">www.irowoon.com</a></div>
<p>공고 내용이 공식 출처와 다르면 앱의 공고 화면에 있는 공식 출처 링크를 먼저 확인해 주세요.</p>
`);

export function mountPublicPages(app: Express) {
  const send = (html: () => string) => (_req: unknown, res: { type: (t: string) => { send: (b: string) => void } }) => res.type("text/html; charset=utf-8").send(html());
  // 스토어 등록용 주소는 /privacy-policy, /account-deletion (예전 주소도 그대로 유지).
  app.get(["/privacy","/privacy-policy"], send(privacyHtml));
  app.get("/terms", send(termsHtml));
  app.get(["/delete-account","/account-deletion"], send(deleteHtml));
  app.get("/support", send(supportHtml));
}
