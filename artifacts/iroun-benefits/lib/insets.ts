import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 화면 아래 시스템 막대(안드로이드 뒤로가기·홈 버튼, 아이폰 홈 표시줄) 높이.
 * 안드로이드 일부 기기에서 0으로 잡히는 경우가 있어 3버튼 막대 높이(48)를 최소값으로 쓴다.
 */
export function useBottomInset() {
  const { bottom } = useSafeAreaInsets();
  if (Platform.OS === 'web') return 0;
  if (Platform.OS === 'android') return bottom > 0 ? bottom : 48;
  return bottom;
}
