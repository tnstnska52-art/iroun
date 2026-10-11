const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

// Read-only checks against the static config used by Replit's managed build.
// Environment values alone do not prove that native settings were applied.
function nativeBuildProblems(config, env, platform = 'all') {
  const problems = [];
  if (!uuid.test(config.extra?.eas?.projectId || '')) problems.push('extra.eas.projectId: 확인된 실제 프로젝트 UUID 필요 (계정 이름/워크스페이스 ID 아님)');
  if (platform !== 'android' && !identifier.test(config.ios?.bundleIdentifier || '')) problems.push('ios.bundleIdentifier: 승인된 iOS 식별자 필요');
  if (platform !== 'ios' && !identifier.test(config.android?.package || '')) problems.push('android.package: 승인된 Android 식별자 필요');
  if (platform !== 'ios' && !config.android?.googleServicesFile) problems.push('android.googleServicesFile: Android 앱 설정 파일 경로 필요');
  if (!/^(?!localhost(?:$|:))[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(env.EXPO_PUBLIC_DOMAIN || '')) problems.push('EXPO_PUBLIC_DOMAIN: 기기에서 접근 가능한 HTTPS API 호스트 필요 (프로토콜/경로 제외)');
  if (!/^pk_(test|live)_/.test(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '')) problems.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: Clerk 공개키 필요');
  return problems;
}

module.exports = { nativeBuildProblems };
