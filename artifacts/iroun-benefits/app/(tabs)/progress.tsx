import { Redirect } from 'expo-router';

/** 예전 '내진행' 주소 호환: 내혜택으로 보낸다. */
export default function ProgressRedirect() {
  return <Redirect href="/mine" />;
}
