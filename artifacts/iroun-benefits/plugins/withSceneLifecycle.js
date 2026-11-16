// iOS 27부터 앱이 scene 기반 생명주기를 쓰지 않으면 실행하자마자 종료된다.
// Expo가 제공하는 ExpoAppSceneDelegate를 쓰도록 Info.plist와 AppDelegate를 바꾼다.
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

const START_BLOCK = /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\([\s\S]*?\)\s*\n#endif\s*\n/;

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return c;
  });
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('withSceneLifecycle: Swift AppDelegate만 지원');
    let src = c.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(/class AppDelegate: ExpoAppDelegate\s*\{/, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    if (START_BLOCK.test(src)) {
      src = src.replace(START_BLOCK, '    // 창과 React Native 시작은 ExpoAppSceneDelegate가 맡는다 (iOS 27 scene 생명주기).\n');
    } else if (!src.includes('ExpoAppSceneDelegate가 맡는다')) {
      throw new Error('withSceneLifecycle: AppDelegate에서 startReactNative 블록을 찾지 못함');
    }
    if (!src.includes('ExpoReactNativeFactoryProvider {')) throw new Error('withSceneLifecycle: AppDelegate 선언을 바꾸지 못함');
    c.modResults.contents = src;
    return c;
  });
  return config;
}

module.exports = withSceneLifecycle;
