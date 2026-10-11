# 이로운혜택 기존 소스 인수인계

이 폴더는 실제 Replit 프로젝트의 민감정보를 제외한 소스 스냅샷이다. 새 앱을 재생성하지 않는다.

먼저 다음 순서로 읽고 실제 기존 코드에서 작업한다.
1. `HANDOFF/CHATGPT/06_LATEST_OBSERVATIONS.md`: 최신 4개 메뉴와 이전 5개 메뉴 요구의 차이
2. `HANDOFF/README.ko.md`: Replit이 작성한 소스·실행·검증 인계
3. `HANDOFF/PORTABILITY_REVIEW.ko.md`: 이번 소스 검사에서 확인한 외부 환경 주의점
4. `HANDOFF/CHATGPT/CLAUDE.md`: 사용자 의도, 보존/금지 범위, 자율 진행 원칙
5. `HANDOFF/CHATGPT/02_REQUIREMENTS.md`, `03_STATE_AND_ERRORS.md`, `04_ACCEPTANCE.csv`, `05_CONFIGURATION.md`

소스는 `artifacts/iroun-benefits`, `artifacts/api-server`, `lib`, `scripts`에 있다.
`HANDOFF/CHECKPOINT.json`의 원본 소스 해시와 `HANDOFF/INTEGRITY.json`의 인계 검사를 참조한다.

최우선은 Expo Go 실제 진입 실패의 재현 및 환경 의존성 분리다. 웹 성공을 네이티브 성공으로 보고하지 않는다.
일반 수정·검사·개발 실행은 재확인 없이 진행하되, 실제 고객 자료·키·운영 DB는 별도 보존한다.
공개배포·유료구매·실결제·실고객 연락/푸시·로고 교체는 실행하지 않는다.
