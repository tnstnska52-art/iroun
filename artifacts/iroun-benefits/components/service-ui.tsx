import React from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, ErrorState, Loading, Notice, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { apiErrorMessage } from '@/lib/text';
import { errStatus } from '@/lib/util';
import { validLink, validPhone } from '@/lib/service';

/** 로그인/로딩 확인 후 children 표시. */
export function AuthGate({ next, children }: { next: string; children: React.ReactNode }) {
  const acc = useAccount();
  const router = useRouter();
  if (!acc.isLoaded || (acc.isSignedIn && acc.loading)) return <Pending onRetry={() => acc.refetch()} />;
  if (!acc.isSignedIn) {
    return (
      <Card tone="soft">
        <T v="h3">먼저 로그인해 주세요</T>
        <T>이 화면은 로그인한 분만 볼 수 있습니다.</T>
        <Btn label="로그인하기" icon="log-in" testID="svc-login" onPress={() => router.push({ pathname: '/auth', params: { next } })} />
      </Card>
    );
  }
  if (acc.error) return <ErrorState message={apiErrorMessage(acc.error)} onRetry={() => acc.refetch()} />;
  return <>{children}</>;
}

/** 조회 오류(401/403/기타)를 한국어 안내와 실제 재시도/로그인 경로로 보여준다. */
export function QueryProblem({ error, next, onRetry, forbidden }: { error: unknown; next: string; onRetry: () => void; forbidden?: string }) {
  const router = useRouter();
  const s = errStatus(error);
  if (s === 401) {
    return (
      <View style={{ gap: 12 }}>
        <Notice tone="warn" title="로그인이 끝났습니다">다시 로그인하면 이어서 볼 수 있습니다.</Notice>
        <Btn label="다시 로그인" icon="log-in" testID="svc-relogin" onPress={() => router.push({ pathname: '/auth', params: { next } })} />
        <Btn kind="secondary" label="다시 시도" icon="refresh-cw" testID="svc-retry" onPress={onRetry} />
      </View>
    );
  }
  if (s === 403) {
    return (
      <View style={{ gap: 12 }}>
        <Notice tone="error" title="볼 수 없습니다">{forbidden ?? '이용 권한이 없습니다. 이용 상태를 확인해 주세요.'}</Notice>
        <Btn kind="secondary" label="다시 확인" icon="refresh-cw" testID="svc-retry" onPress={onRetry} />
      </View>
    );
  }
  return <ErrorState message={apiErrorMessage(error)} onRetry={onRetry} />;
}

export function Pending({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Loading rows={2} />
      <Btn kind="secondary" label="오래 걸리면 다시 시도" icon="refresh-cw" testID="svc-pending-retry" onPress={onRetry} />
    </View>
  );
}

export function NotGovernment() {
  return <View testID="svc-government-notice"><Notice tone="warn" title="정부 서비스가 아닙니다">신청과 선정은 기관이 합니다</Notice></View>;
}

export function ContactButtons({ phone, kakao, prefix }: { phone?: string | null; kakao?: string | null; prefix: string }) {
  const c = useColors();
  const okP = validPhone(phone), okK = validLink(kakao);
  if (!okP && !okK) return <T v="small" color={c.mutedForeground}>연락처가 아직 등록되지 않았습니다.</T>;
  return (
    <View style={{ gap: 10 }}>
      {okP ? <T selectable>{phone}</T> : null}
      {okP ? <Btn kind="secondary" icon="phone" label="전화 걸기" testID={`${prefix}-call`} hint="누르면 전화 화면이 열립니다. 자동으로 걸리지 않습니다." onPress={() => Linking.openURL(`tel:${(phone as string).replace(/[^0-9+]/g, '')}`)} /> : null}
      {okK ? <Btn kind="secondary" icon="message-circle" label="카카오톡 열기" testID={`${prefix}-kakao`} onPress={() => Linking.openURL((kakao as string).trim())} /> : null}
    </View>
  );
}

export function ServiceLinks({ current }: { current: string }) {
  const router = useRouter();
  const items: [string, string, string][] = [
    ['/access', '이용 상태·동의', 'svc-go-access'], ['/matches', '맞춤 공고', 'svc-go-matches'],
    ['/company-progress', '회사 진행', 'svc-go-progress'], ['/inquiries', '문의·건의', 'svc-go-inquiries'], ['/inbox', '알림함', 'svc-go-inbox'],
  ];
  return (
    <View style={{ gap: 10 }}>
      {items.filter((i) => i[0] !== current).map(([h, l, id]) => <Btn key={id} kind="secondary" label={l} testID={id} onPress={() => router.push(h as never)} />)}
    </View>
  );
}
