import React from 'react';
import { Platform } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Btn, Card, Page, T } from '@/components/ui';
import { PortalView } from '@/components/PortalView';
import { CustomerPortalCard } from '@/components/CustomerPortalCard';
import { useColors } from '@/hooks/useColors';
import { IS_PREVIEW } from '@/lib/estimate';
import { CUSTOMER_PORTAL_URL } from '@/lib/customer-portal';

/**
 * 내 계약 탭: 회사 고객 창구(전산의 계약 고객 화면)를 앱 화면 안에서 그대로 연다.
 * 화면과 기능은 전산 쪽이 원본이라, 전산을 고치면 앱 빌드 없이 같이 바뀐다.
 * 로그인은 고객 창구의 '로그인 유지'(쿠키)를 그대로 쓰고, 앱은 아이디·비밀번호·토큰을 다루지 않는다.
 */
export default function ContractTab() {
  if (Platform.OS === 'web') {
    // 미리보기: 고객 창구는 다른 화면 안에 넣을 수 없게 막혀 있어 새 창으로 보여 준다.
    if (IS_PREVIEW) return <PreviewPortal />;
    // 웹 버전 앱에서는 같은 탭으로 고객 창구를 연다(기존 동작).
    return <Page tab title="내 계약"><CustomerPortalCard /></Page>;
  }
  return <TabPortal />;
}

function TabPortal() {
  const focused = useIsFocused();
  return <PortalView active={focused} />;
}

function PreviewPortal() {
  const c = useColors();
  return (
    <Page tab title="내 계약">
      <Card tone="soft" style={{ gap: 10 }}>
        <T v="label" color={c.primary}>미리보기 안내</T>
        <T v="h3">{'실제 앱에서는\n이 화면 전체에\n고객 창구가 열려요'}</T>
        <T color={c.mutedForeground}>{'신청 · 서류함 · 대화 ·\n받은 금액을\n앱 안에서 바로 써요'}</T>
        <Btn label="고객 창구 열어 보기" icon="external-link" onPress={() => { window.open(CUSTOMER_PORTAL_URL, '_blank', 'noopener'); }} testID="portal-preview-open" />
        <T v="small" color={c.mutedForeground}>{'미리보기에서는 새 창으로 열려요\n회사에서 받은 아이디로 로그인해요'}</T>
      </Card>
    </Page>
  );
}
