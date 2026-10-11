import { Alert, Platform } from 'react-native';
export function confirmAsk(title: string, msg: string, okLabel: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n${msg}`)) onOk();
    return;
  }
  Alert.alert(title, msg, [{ text: '취소', style: 'cancel' }, { text: okLabel, style: 'destructive', onPress: onOk }]);
}
