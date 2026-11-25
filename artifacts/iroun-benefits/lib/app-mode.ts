/**
 * 앱 모드.
 * - 'portal'(기본): 앱 전체가 회사 고객 창구(go.irowoon.com/package-conditions)다. 계약 고객 전용.
 * - 'benefits': 예전 지원금 찾기 앱(탭: 홈·지원금·정책자금·내 계약·상담). 코드는 지우지 않고 남겨 둔다.
 * 개발·미리보기에서만 예전 앱을 선택할 수 있다. production 빌드는 항상 현재 CRM 창구다.
 */
export function resolveAppMode(release: string | undefined, mode: string | undefined, preview: string | undefined): 'portal' | 'benefits' {
  if (release === 'production') return 'portal';
  return mode === 'benefits' || preview === '1' ? 'benefits' : 'portal';
}
export const APP_MODE = resolveAppMode(
  process.env.EXPO_PUBLIC_APP_RELEASE,
  process.env.EXPO_PUBLIC_APP_MODE,
  process.env.EXPO_PUBLIC_PREVIEW,
);
export const PORTAL_ONLY = APP_MODE === 'portal';
