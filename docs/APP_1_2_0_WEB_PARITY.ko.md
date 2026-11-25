# 이로운사람들 1.2.0 — 현재 계약자 웹과 동일한 앱

## 반영 범위

사용자 요청: 현재 운영 웹의 기능·디자인과 추천 공고 방식, 지원사업 노출 방식, 산정 방식을 그대로 앱에서 사용한다.

운영 앱의 원본 화면은 `https://go.irowoon.com/package-conditions`다. 앱의 production 빌드는 항상 이 창구를 열며, 이전 benefits 앱의 추천·계산·메뉴를 선택하지 않는다. 개발·미리보기용 benefits 모드는 유지한다.

별도 데이터 복제나 계산식 이관 없이 같은 웹 화면과 CRM 계정·API를 사용하므로, 같은 고객 조건과 조회 시점의 웹 판단 결과를 앱에서도 사용한다.

## 앱 1.2.0 연결 규약

`window.IROUN_APP`:

```js
{
  app: 'iroun',
  bridge: 1,
  version: '1.2.0',
  platform: 'ios' | 'android',
  pushToken: '허용된 Expo 토큰 또는 null',
  capabilities: { refundServices: true, navigation: 1 }
}
```

토큰·로그인 정보·고객 식별자를 화면 주소에 붙이지 않는다. 새 기능 허용 정보는 UI 지원 여부이며 사용자 접근 권한이나 동의를 대신하지 않는다. 이전 앱의 `bridge:1` 계약과 알림·파일 연결을 유지한다.

환급 서비스 공개는 CRM에서 이 버전·기능 정보를 확인한다. 이전 설치 앱은 기존 준비 중 상태를 유지한다. 심사에서도 1.2.0의 같은 기능을 보여 준다.

### 외부 인증 앱에서 돌아오기

백그라운드/비활성 상태에서 다시 활성화되면 WebView를 지우거나 새로고침하지 않고 `iroun-app-resume` 이벤트를 보낸다. 고객의 입력, 선택한 파일, 현재 화면을 유지한다. 웹은 이벤트를 받고 필요한 조회 상태만 확인한다. 이 이벤트 자체로 본인 인증·신청·동의를 다시 요청하지 않는다.

### Android 뒤로가기

1. 네이티브가 요청마다 고유한 requestId와 짧은 만료 시각을 만든다.
2. 웹에 취소 가능한 `iroun-app-back` 이벤트를 보낸다. `detail`은 `{requestId}`다.
3. 웹이 팝업·입력 단계 등을 처리하면 `preventDefault()`한다.
4. 주입 스크립트가 `{type:'app-back-result', requestId, handled}`를 네이티브로 보낸다.
5. 명시적 `handled:false`일 때만 브라우저 이력 또는 OS 종료 동작을 실행한다.

대기 중 연속 클릭은 한 요청으로 처리한다. 응답이 없거나 늦으면 앱을 자동 종료하지 않고 재시도 안내를 표시한다. 만료된 스크립트는 웹 이벤트를 뒤늦게 실행하지 않는다. 다른 페이지로 이동하거나 앱 화면을 닫으면 이전 요청을 취소한다.

### 새 창과 파일

`window.open` 및 새 창 링크는 회사 HTTPS 주소이면 현재 창구에서 열고, 외부 기관·인증 앱 주소이면 휴대폰 브라우저/앱으로 넘긴다. 실행 코드·로컬 파일 주소는 외부로 넘기지 않는다. 기존 사진·파일 선택과 서류 다운로드 공유창 방식은 유지한다.

Android `intent:` 링크는 실제 앱의 scheme 주소로 해석한 뒤 실행한다. 앱 실행이 실패했을 때만 링크에 포함된 유효한 HTTPS 안내 페이지를 연다. 실행 코드·로컬 파일·재귀 intent 주소, 중복 필드, 잘못된 인코딩과 사용자 정보가 포함된 안내 주소는 거부한다.

## 검증 명령

저장소 루트:

```bash
node --experimental-strip-types --test artifacts/iroun-benefits/lib/customer-portal.test.ts artifacts/iroun-benefits/lib/portal-back.test.ts artifacts/iroun-benefits/lib/portal-external.test.ts
node --test artifacts/iroun-benefits/scripts/native-build-config.test.cjs
node artifacts/iroun-benefits/scripts/native-preflight.cjs all
pnpm exec tsc --build lib/api-client-react
pnpm --filter @workspace/iroun-benefits exec tsc --noEmit -p tsconfig.json
```

패키지 설치는 기존 잠금파일을 사용한다. Portal 모드에는 예전 별도 API 서버와 Clerk 로그인 설정을 필수로 요구하지 않는다. 서명 설정, FCM/APNs 자격, 실제 휴대폰 동작은 입력 검사와 별도다.

## 출시 준비

- 버전: 1.2.0, 기존 iOS/Android 앱 식별자와 EAS 프로젝트 유지.
- EAS production 환경: `EXPO_PUBLIC_APP_RELEASE=production`, `EXPO_PUBLIC_APP_MODE=portal`, `EXPO_PUBLIC_PREVIEW=0`.
- production은 원격 빌드 번호 자동 증가를 유지한다.
- 최신 스토어 설명과 심사 메모는 `docs/store/1.2.0-등록-문구.md`에 있다.
- 실제 빌드와 스토어 제출은 기존 EAS 소유 계정과 서명 권한이 확인된 뒤 수행한다. 새 계정·프로젝트·자격증명을 자동 생성하지 않는다.
- iPhone·Android 실기기에서 로그인 유지, 추천/노출/산정 결과의 웹 대조, 서류 사진/파일/다운로드, 문의 작성 보존, 외부 인증 복귀, 새 창, 뒤로가기와 푸시 이동을 확인한다. 실고객 자료나 고객 알림은 시험에 사용하지 않는다.

이 문서는 구현·검사·출시 준비의 인계 기록이며 스토어 제출·승인·실기기 검증의 완료 증거가 아니다.

## 2026-11-25 실행 결과

- 고객 창구 이동·새 브리지·뒤로가기·버전별 모드·외부 인증 링크 검사 35개 통과. 실제 scheme 전달과 실패 시 HTTPS 안내 페이지 실행 순서까지 검사했다.
- 네이티브 빌드 설정 검사 7개 통과, iOS·Android 정적 입력 검사 통과.
- 참조 라이브러리를 먼저 생성한 뒤 앱 전체 TypeScript 검사 통과. intent 링크 보완 후에도 `NODE_OPTIONS=--max-old-space-size=1536`으로 전체 검사 재실행, 종료 코드 0.
- 로컬 Expo export는 초기 기본 병렬 실행과 Android 단일 worker 시도에서 종료 코드 137로 중단했다. 재생성 가능한 캐시를 정리하고 `NODE_OPTIONS=--max-old-space-size=1536`, `RAYON_NUM_THREADS=1`, `--max-workers 1`로 iOS·Android를 함께 다시 실행하여 최종 종료 코드 0으로 통과했다.
- 최종 export: iOS 2,224개 모듈, Android 2,304개 모듈. 각 플랫폼의 Hermes 번들 약 11MB와 77개 자산 생성. 결과 경로는 `/home/agent/task-workdirs/bdd65bbaaf0f/native-export-1.2.0`이다. 이는 JavaScript·자산 번들 검사이며 서명한 설치 파일(IPA/AAB/APK)이 아니다.
- EAS CLI의 실제 `whoami` 결과는 `Not logged in`. 이 환경에는 확인된 Expo 로그인 세션이 없다. 서명 클라우드 빌드·스토어 제출은 실행하지 않았다.
- iPhone·Android 실기기 설치, 외부 인증 성공, 푸시 수신, 네이티브 서명 검증은 미실시.
- 기준 main의 Git 트리에 `.github/workflows` 파일이 없어 재사용할 기존 GitHub Actions 빌드 경로는 확인되지 않았다.
