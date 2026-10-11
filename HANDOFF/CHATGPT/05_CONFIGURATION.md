# 설정과 비밀정보 인계 원칙

기존 Replit의 키는 그대로 보존한다. 이 문서에는 이름과 용도만 있다. 새 작업환경으로 코드를 복사해도 Replit Secrets가 자동 복사되는 것은 아니다. 로컬 UI/코드 검사처럼 키 없이 가능한 작업을 먼저 진행하고, 실제 공식 호출·인증 검증에 필요한 설정만 마지막에 안전한 입력 경로로 안내한다. 키를 재발급하거나 일반 채팅·소스 저장소에 넣지 않는다.

| 확인된 설정 이름 | 용도 | 과거 상태/주의 |
|---|---|---|
| BIZINFO_API_KEY | 기업마당 지원사업 공고 | 기존 Replit 등록·소량읽기 성공. 자동수집 범위/이용조건 별도 |
| GOV24_API_KEY | 대한민국 공공서비스 목록·상세·조건 | 등록·읽기·검토대기 저장 성공 기록 |
| WELFARE_CENTRAL_API_KEY | 복지로 중앙부처 복지서비스 | 등록·읽기·검토대기 저장 성공 기록 |
| WELFARE_LOCAL_API_KEY | 복지로 지자체 복지서비스 | 등록·읽기·검토대기 저장 성공 기록 |
| IROUN_OFFICIAL_FEEDS_ENABLED | 공식 자료 수집 활성화 | 코드에서 현재 의미 확인. 한도/조건 확인 전 무작정 켜지 않음 |
| IROUN_GOV24_APPROVED | 정부24 승인 적용 상태 | 승인 증거/실제 호출권한과 코드 의미 확인 |
| IROUN_WELFARECENTRAL_APPROVED | 중앙 복지 API 승인 적용 상태 | 동일 |
| IROUN_WELFARELOCAL_APPROVED | 지자체 복지 API 승인 적용 상태 | 동일 |

Clerk 관련 키, DB 연결, Expo/EAS/FCM/APNs, 서버 관리자 지정 변수의 정확한 이름/필수 여부는 실제 소스를 읽어 작성한다. 이름을 추측해서 넣지 않는다. 기존 개발 인증은 임의로 교체하지 않는다. RevenueCat/결제 관련 코드가 있어도 실결제 활성화는 범위가 아니다.

## 공식 출처

- 기업마당: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi
- 기업마당 공식 공고 요청: https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do (키 필요)
- 정부24: https://www.data.go.kr/data/15113968/openapi.do
- 정부24 안내: https://www.gov.kr/openapi/info
- 복지로 중앙: https://www.data.go.kr/data/15090532/openapi.do
- 복지로 지자체: https://www.data.go.kr/data/15108347/openapi.do
- Expo 푸시 설정: https://docs.expo.dev/push-notifications/push-notifications-setup/
- Expo 발송: https://docs.expo.dev/push-notifications/sending-notifications/

위 API 출처는 이전 작업에 사용한 공식 문서 위치다. 현재 명세/계정별 한도/조건은 연결 시 다시 확인한다. 과거 공개 개발계정 기본한도 안내(정부24 10,000, 중앙100, 지자체1,000)는 이 계정의 현재 승인 한도라고 단정하지 않는다.

## 내보내기 포함/제외

포함: 현재 소스, 필요한 디자인 자산, 잠금파일, DB 스키마/마이그레이션, 비식별 시험 자료, 실행/검사 문서, 환경변수 이름만 있는 예시, 비밀이 제거된 오류 기록, 현재 체크포인트 식별.

제외: 실제 .env/비밀 설정, 키·비밀번호·토큰·세션, 서비스 계정 JSON/서명 인증서, 운영 DB 덤프, 실고객/직원 개인정보, 실제 연락처, 고객 문서/녹취/업로드, 비밀 포함 로그, 전체 Git 이력. 원본의 해당 항목을 삭제하라는 뜻은 아니다.

기존 전체 소스에 민감값이 들어 있다면 내보내기 복사본만 자리표시자로 바꾸고 목록을 남긴다. '문자열 검사 통과'만으로 개인정보 부재를 보장하지 않는다. 전체 프로젝트 ZIP이나 로그를 공개 다운로드 경로에 올리지 않는다.

## 인수인계 중 UI에서 추가 확인한 변수 이름

Replit Secrets 목록에는 `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `REPLIT_EXPO_SESSION_SECRET` 이름도 표시됐다. 값은 열거나 복사하지 않았다. 네 공식 API 키 이름도 계속 표시됐다. 해당 목록의 존재는 모든 키의 유효성이나 새로운 로컬 환경의 자동 연결을 뜻하지 않는다.

Replit의 관리형 Expo 세션 비밀을 다른 호스팅이나 로컬의 일반 세션 비밀로 전용하지 않는다. 실제 소스를 읽고 새 실행 환경에 필요한 설정을 분리한다. 기존 앱용 Clerk 프로젝트 및 데이터 저장소를 임의로 다른 서비스로 교체하지 않는다.
