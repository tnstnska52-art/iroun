/**
 * 앱 모드.
 * - 'portal'(기본): 앱 전체가 회사 고객 창구(go.irowoon.com/package-conditions)다. 계약 고객 전용.
 * - 'benefits': 예전 지원금 찾기 앱(탭: 홈·지원금·정책자금·내 계약·상담). 코드는 지우지 않고 남겨 둔다.
 * 빌드할 때 EXPO_PUBLIC_APP_MODE=benefits 를 주면 예전 앱으로 돌아간다. 미리보기(EXPO_PUBLIC_PREVIEW=1)는 예전 앱.
 */
export const APP_MODE: 'portal' | 'benefits' =
  process.env.EXPO_PUBLIC_APP_MODE === 'benefits' || process.env.EXPO_PUBLIC_PREVIEW === '1' ? 'benefits' : 'portal';
export const PORTAL_ONLY = APP_MODE === 'portal';
