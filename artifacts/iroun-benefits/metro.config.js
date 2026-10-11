const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
require('./scripts/manifest-observer.cjs').install();

const config = getDefaultConfig(__dirname);

// 미리보기 전용 빌드(EXPO_PUBLIC_PREVIEW=1): 로그인 서비스를 화면 확인용 대역으로 바꾼다.
// 이 값이 없으면 아래 연결은 적용되지 않아 운영·개발 빌드는 그대로다.
if (process.env.EXPO_PUBLIC_PREVIEW === '1') {
  const alias = {
    '@clerk/expo': path.resolve(__dirname, 'preview/clerk.tsx'),
    '@clerk/expo/token-cache': path.resolve(__dirname, 'preview/token-cache.ts'),
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (alias[moduleName]) return { type: 'sourceFile', filePath: alias[moduleName] };
    return (upstream ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
