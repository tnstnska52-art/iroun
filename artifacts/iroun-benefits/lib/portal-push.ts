import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { staysInApp, validPushToken } from '@/lib/customer-portal';

const projectId = () => Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const canPush = () => Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && !!projectId();

/**
 * 고객 창구 앱의 알림.
 * - 알림 허용을 한 번 묻고, 허용하면 이 휴대폰의 알림 주소(Expo push token)를 돌려준다. 알림을 보내지는 않는다.
 * - 알림을 누르면 data.url(회사 창구 주소만)을 돌려줘 그 화면을 연다.
 * Expo Go에서는 알림 주소를 받을 수 없어 아무것도 하지 않는다.
 */
export function usePortalPush() {
  const [token, setToken] = useState<string | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!canPush()) return undefined;
    const N = require('expo-notifications') as typeof import('expo-notifications');
    let alive = true;
    N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    (async () => {
      try {
        if (Platform.OS === 'android') await N.setNotificationChannelAsync('default', { name: '회사 안내', importance: N.AndroidImportance.HIGH });
        let p = await N.getPermissionsAsync();
        if (!p.granted && p.canAskAgain) p = await N.requestPermissionsAsync();
        if (!p.granted) return;
        const t = validPushToken((await N.getExpoPushTokenAsync({ projectId: projectId() })).data);
        if (alive && t) setToken(t);
      } catch { /* 알림 없이도 창구는 그대로 쓴다 */ }
    })();
    const seen = new Set<string>();
    const handle = (r: import('expo-notifications').NotificationResponse) => {
      const id = r.notification.request.identifier;
      if (seen.has(id)) return;
      seen.add(id);
      const url = r.notification.request.content.data?.url;
      if (typeof url === 'string' && staysInApp(url) && url.startsWith('https://')) setOpenUrl(`${url}${url.includes('#') ? '' : ''}`);
    };
    const sub = N.addNotificationResponseReceivedListener(handle);
    void N.getLastNotificationResponseAsync().then((r) => { if (alive && r) { handle(r); void N.clearLastNotificationResponseAsync(); } }).catch(() => undefined);
    return () => { alive = false; sub.remove(); };
  }, []);

  return { token, openUrl };
}
