# 실제 내보내기 사본 검사와 외부 환경 차이

## 확인한 범위

Replit에서 실제 내려받은 ZIP 1,321,475바이트/272개 파일의 CRC와 원본 CHECKPOINT에 기록된 모든 파일 해시가 일치했다. 상대경로 import/require 정적 검색 193개 중 2개 미해결 후보는 주석 예제였고, 실제 누락으로 확인된 상대 import는 없었다. 이는 동적 경로·외부 의존성·실행 성공 전체를 보장하는 검사는 아니다. Expo 설정의 아이콘 파일은 실제 포함됐다. 원본 앱 코드는 이번 조립에서 변경하지 않았다.

이번 인계에서 앱 테스트나 패키지 설치는 재실행하지 않았다. Replit의 보존 검사 보고와 이번 압축/파일 검사를 구분한다. 원본 상세 로그·스크린샷은 개인정보 가능성 때문에 내보내기에 없으며, 보고 요약만 포함된다.

## Claude가 먼저 다룰 실제 환경 차이

1. `pnpm-workspace.yaml`은 Replit Linux 환경을 위해 macOS/Windows/일부 Linux 아키텍처용 esbuild·rollup·lightningcss 등의 선택 의존성을 `'-'`로 제외한다. 다른 OS에서는 필요한 바이너리 설치가 막힐 수 있다. 현재 PC/CPU를 확인한 뒤 작업 복사본에서 해당 제외만 조정하고 잠금파일 변경을 기록한다. 원본 스냅샷은 보존한다.
2. 앱의 `package.json`의 `dev:direct`는 Replit 도메인·managed Expo 세션에 의존한다. 외부에서는 Replit 세션 비밀을 복사해서 흉내 내지 말고 실제 로컬 Expo 실행 경로를 사용한다. API의 `dev:direct`도 POSIX shell 문법이다. Windows에서 그대로 실행 가능하다고 단정하지 않는다.
3. `artifacts/iroun-benefits/app/_layout.tsx`는 `EXPO_PUBLIC_DOMAIN` 앞에 `https://`를 붙인다. 단순히 `http://localhost:8080`을 이 변수에 넣으면 올바른 URL이 되지 않는다. 앱/API 연결 및 휴대폰이 접근 가능한 주소를 먼저 설계하고, 개발 전용으로 필요한 최소 수정만 한다. 무료 일반 목록과 인증/쿠키/Clerk 설정도 함께 확인한다.
4. `scripts/post-merge.sh`는 `pnpm --filter db push`를 자동 호출한다. 실제 패키지 이름은 `@workspace/db`이다. 외부 환경에서 자동 실행하지 않는다. 격리 개발 DB의 `DATABASE_URL`을 확정한 후 정확한 필터와 SQL 마이그레이션 순서를 검토한다. 운영 DB에 실행하지 않는다.
5. Expo ~57.0.7, React Native 0.86.3, React 19.2.3이 앱 package.json에 기록돼 있다. 설치된 Expo Go와 호환성은 실제 버전 기준으로 검증한다. 이 버전 정보를 이유로 다운그레이드/업그레이드를 추측하여 일괄 적용하지 않는다.
6. 전체 workspace에는 `mockup-sandbox`도 포함된다. 기존 보고에 이 영역의 타입 오류 이력이 있으므로 앱/API 검사와 전체 검사를 구분한다. 필요한 검사만 영향 범위에 맞춰 수행한다.

## 원본 내보내기의 문자열 치환

`HANDOFF/SANITIZATION.json`의 7개 파일에서 이메일 예제/시험 전화번호/키 형태의 시험 문자열 등이 치환됐다. auth.tsx의 이메일 placeholder도 `fixture@example.invalid`로 바뀌었다. 의도한 데이터 손실이 아니라 보수적 내보내기 처리다.

특히 `artifacts/iroun-benefits/server/templates/landing-page.html`의 integrity 값도 `REDACTED_LONG_LITERAL`로 치환됐다. 이것은 브라우저 스크립트 무결성 속성이므로 해당 스크립트 공식 배포물과 맞는 해시를 다시 확인해 복구해야 한다. 단순히 무결성 검사를 끄지 않는다. `native-build-config.test.cjs`의 합성 자격증명/프로젝트 ID도 테스트 목적에 맞는 가짜 값으로 복구할 수 있다. 원본 비밀값을 요청할 필요가 없다.

## 계속 보존할 경계

실제 계정/운영 DB/Secrets는 원본 Replit에 남겨 두었다. 개발용 소스 전달과 운영 서비스 이전은 다른 단계다. 네 API키가 원본에 있다는 기록을 로컬 연결 성공으로 간주하지 않는다. 지갑·결제·푸시·공개배포·계정 권한 부여를 인계 설치 단계에서 자동 실행하지 않는다.

실제 사용자 Expo Go 오류와 iPhone manifest 오류는 여전히 동일 경로 해결 미확인이다. Replit UI의 비공개 모바일 미리보기 미지원 안내를 조사 단서로 삼되 단독 원인으로 확정하거나 접근 공개로 우회하지 않는다.
