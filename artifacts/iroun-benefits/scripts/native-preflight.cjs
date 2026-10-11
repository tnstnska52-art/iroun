const fs = require('node:fs');
const path = require('node:path');
const { nativeBuildProblems } = require('./native-build-config.cjs');
const config = require('../app.json').expo;
const platform = process.argv.slice(2).filter(arg => arg !== '--')[0] || 'all';
if (!['ios', 'android', 'all'].includes(platform)) {
  console.error('사용법: node scripts/native-preflight.cjs [ios|android|all]');
  process.exit(1);
}
const problems = nativeBuildProblems(config, process.env, platform);
if (platform !== 'ios' && config.android?.googleServicesFile &&
    !fs.existsSync(path.resolve(__dirname, '..', config.android.googleServicesFile))) {
  problems.push('android.googleServicesFile: 현재 환경에서 파일을 찾을 수 없음');
}
if (problems.length) {
  console.error(`서명 개발 빌드 준비 미완료 (${platform})\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`개발 빌드 입력 검사 통과 (${platform}). 서명·APNs/FCM 자격증명·실기기 수신은 별도 확인 필요. 발송/빌드하지 않았습니다.`);
