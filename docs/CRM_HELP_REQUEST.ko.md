# 전산 요청: 홈페이지 "이 지원금, 신청 도움 받기" → 담당 직원 화면

## 무엇이 바뀌나
- 지금까지 홈페이지(irowoon.com/check)의 지원금 상세화면에서 **"이 지원금, 신청 도움 받기"** 를 누르면 예전 상담 페이지(/contact)로 넘어갔습니다.
- 이제는 페이지를 옮기지 않습니다. 고객 이름·번호, 고객이 고른 지원금 정보를 앱 서버(iroun-api)가 회사 전산으로 보냅니다.
- 전산은 이것을 **담당 직원 화면에 "지원금 도움 요청"** 으로 보여 주면 됩니다.
- 고객이 이름·번호를 아직 안 넣었으면 먼저 넣게 합니다. 순서는 이렇습니다.
  1. 가입(`check.lead`)을 보냅니다.
  2. 약 1초 뒤 도움 요청(`check.help_request`)을 보냅니다.

## 보내는 곳과 서명 (지금과 같음)
- 주소: `POST {CRM_BASE_URL}/api/integration/check-leads`
- 서명: 지금 `check.lead` 와 같은 `X-Timestamp`, `X-Signature`(HMAC-SHA256, `CRM_APP_PROFILE_SECRET`)를 씁니다.
- 매번 새 `requestId` 를 붙입니다.
- `type` 값으로 구분합니다.
  - `check.lead`: 지금과 같습니다.
  - `check.help_request`: **새로 추가됩니다.**

## check.help_request 본문
`check.lead` 의 필드가 모두 그대로 들어가고, 여기에 `helpRequest` 하나가 더 붙습니다.
- 그대로 들어가는 필드: name, phone, bizName, industry, province, district, openedYear, entity, revNow, revLast, creditBand, currentArrears, policyFund, premises, supportThisYear, sureCount, referralToken 등
- 따라서 고객을 찾거나 처음 만드는 방법, 담당자를 정하는 방법(referralToken)은 `check.lead` 와 똑같이 처리하면 됩니다.

```json
{
  "schemaVersion": 1,
  "type": "check.help_request",
  "requestId": "uuid",
  "occurredAt": "2026-10-23T04:40:00.000Z",
  "name": "홍길동",
  "phone": "01012345678",
  "bizName": "가상식당", "industry": "음식점", "province": "경기도", "district": "수원시",
  "referralToken": "64자리 16진수(직원 전용 링크로 들어온 고객만)",
  "helpRequest": {
    "benefitId": "bizinfo-PBLN_000000000117022",
    "title": "2026년 소상공인 고용보험료 지원사업 공고",
    "amountText": "예상 39만원",
    "amountWon": 393600,
    "amountMan": 39,
    "endsAt": "2026-12-31",
    "agency": "중소벤처기업부",
    "sourceUrl": "https://www.bizinfo.go.kr/...",
    "result": "조건 일치 | 추가 확인 필요"
  }
}
```
`helpRequest` 에서 `benefitId`, `title` 은 항상 있습니다. 나머지는 없을 수 있습니다. 금액이 없으면 `amountMan` 은 null 입니다.

## 전산에서 해 줄 일
1. `type: "check.help_request"` 를 받아들여 `{accepted: true}` 로 답해 주세요. 지금은 모르는 type 이라 거절될 수 있습니다.
   - 앱 서버는 거절되거나 404 가 와도 버리지 않습니다. 대기열에 두고 최대 50번(약 이틀) 다시 보냅니다.
2. 고객은 `check.lead` 와 같은 방법으로 찾습니다(phone, referralToken). 없으면 만듭니다.
3. 그 고객의 담당 직원 화면에 다음 내용을 남겨 주세요.
   - 표시: **"지원금 도움 요청"**
   - 지원금 이름(`title`), 금액(`amountText`), 마감일(`endsAt`), 공고 링크(`sourceUrl`), 요청 시각(`occurredAt`)
   - 예: "홍길동 대표님이 '2026년 소상공인 고용보험료 지원사업'(예상 39만원) 신청 도움을 요청했어요"
4. 같은 고객이 같은 `benefitId` 로 다시 요청하면 새 줄을 만들지 말고 시각만 갱신하는 것을 권합니다.
   - 홈페이지도 같은 지원금은 한 번만 보내도록 막아 두었습니다.
5. 담당자가 처리했는지 표시하는 칸(요청 / 연락함 / 완료)이 있으면 좋습니다.
6. 이 요청을 받았다고 고객에게 문자나 푸시를 자동으로 보내지는 마세요. 고객 연락은 직원이 직접 합니다.
