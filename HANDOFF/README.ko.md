# Claude 개발 인수인계

기존 이로운혜택 Expo React Native/Expo Router/TypeScript 앱과 Express/Clerk/PostgreSQL 서버의 현재 소스 스냅샷입니다. pnpm workspace이며 잠금 파일을 포함합니다.

## 먼저 읽기
- 실제 회원/운영 DB/Secrets/전체 Git 이력/로그/사용자 첨부/스크린샷은 포함하지 않았습니다.
- 기존 정상 서버와 원본 데이터는 변경하지 않았습니다. 이 사본으로 운영 DB에 연결하거나 자동 마이그레이션하지 마세요.
- SANITIZATION.json은 사본에서 치환한 파일/종류/개수입니다. 비밀 원문은 없습니다. 치환된 테스트 문자열은 검증 목적에 맞는 합성 fixture로 복구해야 합니다.
- CHECKPOINT.json은 기준 Git HEAD와 미커밋 변경까지 포함한 내보내기 내용 식별자입니다. Replit 자체 체크포인트 생성 성공을 의미하지 않습니다.

## 설치/실행
1. Node 24 계열, pnpm 10 계열을 준비하고 pnpm install --frozen-lockfile 실행.
2. 별도의 빈 PostgreSQL 개발 DB에 DATABASE_URL을 안전하게 설정. lib/db/src/schema/iroun.ts가 기본 구조, artifacts/api-server/src/migrations/*.sql은 추가 구조입니다.
3. pnpm --filter @workspace/db push 실행 후 SQL migration을 번호 순으로 적용. scripts/post-merge.sh는 자동 실행하지 말고 검토하세요(기존 filter 이름 확인 필요).
4. 허가받은 Clerk 개발 설정을 로컬 비밀 저장소로 전달. 새 인증으로 운영 회원을 임의 이관하지 마세요.
5. API 터미널: PORT=8080 pnpm --filter @workspace/api-server run dev:direct
6. 앱 터미널: cd artifacts/iroun-benefits; 로컬 API 연결 주소와 EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY를 설정 후 pnpm exec expo start --go 실행.
7. Replit 전용 proxy/launch 로그인은 외부 환경에서 동일하지 않습니다. lib의 API base URL 설정과 EXPO_PUBLIC_DOMAIN 처리, Metro proxy를 확인하세요. 외부 환경 실행은 이 내보내기에서 검증하지 않았습니다.

## 검사
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/iroun-benefits exec tsc --noEmit -p tsconfig.json
node --test scripts/development-orphans.test.mjs scripts/development-lifecycle.test.mjs
API vitest와 verify-live-auth/verify-company-browser는 반드시 격리 DB와 폐기 가능한 Clerk 개발 계정으로만 실행하세요. 테스트가 행/시험 계정을 생성·삭제합니다.
API의 seed:official/admin:bootstrap은 자동 실행하지 말고 승인·원문·본인확인을 먼저 검토하세요.

## 마지막 확인과 미완료
- 고객 이동: 홈/전체혜택/내혜택/내정보. 별도 환급 경로는 준비 중만. 일반 환급 공고 필터 유지.
- 72시간 체험/구독/계약/무상권 OR, 만료 후 새 맞춤 차단. 본인 기존 접수 기록·서류 준비·담당자 연락은 유지.
- 새 회사 업무 알림은 내혜택의 앱 내 알림이며 실제 푸시 성공이 아님.
- 마지막 서버/DB 66건 재검사 통과, 실행 관리 10건 통과, 새 실제 개발 인증 브라우저 회사 흐름 10체크 통과. 후속 관련2건은 중복 합산하지 않음.
- 320/375px 큰 글씨, 무료 차단, 만료 후 기록·읽음 유지, 타인 접근 차단, 계약 회수·담당자 배정 확인. 이번 일반 회원탈퇴 브라우저는 재실행하지 않음(이전 근거와 구분).
- 상세 Notice의 React Native 텍스트 오류를 수정하고 동일 웹 경로 재검증.
- API/Expo 포트 점유 재시작 실패 확인, 소유가 확인된 고아 프로세스 회수 방어 추가. 과거 모든502의 최초원인은 미확정.
- 마지막 HTTP 확인 2026-10-11 14:16:54 KST: 앱/로그인/API 200. 상시 가동 보장 아님.
- Expo Go Android 파란 오류/iPhone manifest JSON 파싱 오류는 사용자 동일 경로 실제 진입이 미검증. 웹200/번들 성공을 네이티브 해결로 간주하지 마세요.
- 실기기 설치/VoiceOver/TalkBack/키보드/푸시 수신/실제 구매·복원은 미검증.
- 4개 공고 API키는 원본 Secrets에 이미 있음. 재발급하지 말고 소유자가 별도 안전한 경로로 이전 권한을 부여할 것. 이 파일에는 미포함.
- 계정별 승인 한도/자동수집 조건, 운영 연락처/정책, 최초 관리자 본인확인, 네이티브 서명/FCM/APNs/스토어 설정은 별도 확인.
- 별도 푸시 안내 작업은 마지막 확인에서 병합 잠금 대기였으며, 이 스냅샷 이후의 병합 내용은 포함된다고 보장하지 않음.
- 전체 workspace 타입검사는 mockup-sandbox의 기존 오류 이력이 있어 앱/API 개별 검사와 구분하세요.

## 안전 범위
추가 기능 개발을 멈추고 사본만 만들었습니다. 로고 변경/실결제/고객 연락·알림/가격 활성화/공개 배포/스토어 제출 금지. 보증료·이자지원·특례보증·신규 대출 추천 제외. 실제 환급액 계산·대리신청·수수료 서비스 재개 금지.
정규식 검사 통과는 모든 종류의 비밀/개인정보가 없다는 수학적 보증이 아닙니다. 외부에 전달하기 전 SANITIZATION과 파일 목록을 함께 검토하세요.
