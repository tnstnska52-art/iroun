import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Disclaimer, Emoji, Page, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

type Item = { id: string; icon: React.ComponentProps<typeof Feather>['name']; title: string; desc: string };
const ITEMS: Item[] = [
  { id: 'internet', icon: 'wifi', title: '인터넷 환급', desc: '인터넷·TV 바꿀 때\n받는 현금 지원' },
  { id: 'medical', icon: 'heart', title: '병원비 환급', desc: '청구 안 한 실손보험금\n돌려받기' },
  { id: 'rent', icon: 'home', title: '월세 환급', desc: '낸 월세\n세액공제로 돌려받기' },
  { id: 'tax', icon: 'percent', title: '세금 환급', desc: '더 낸 세금\n세무사와 함께 돌려받기' },
];

/** 환급금 탭: 서비스 준비 중. 무엇이 열릴지만 보여주고 아직 누를 수 없다. */
export default function RefundsScreen() {
  const c = useColors();
  return (
    <Page tab title="환급금">
      <View testID="refunds-hero" style={{ backgroundColor: c.destructiveSoft, borderRadius: c.radius + 6, padding: 22, gap: 8 }}>
        <Emoji char="💸" size={34} motion="bounce" />
        <T v="title" color={c.destructive}>안 찾아가면{'\n'}그냥 사라지는 돈</T>
        <T color={c.destructive}>환급금은 신청한 사람만 받아요{'\n'}기한이 지나면 0원이에요</T>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 44 }}>
        <T v="h2" style={{ flex: 1 }}>내가 돌려받을 수 있는 돈</T>
        <View style={{ backgroundColor: c.secondary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
          <T v="small" color={c.mutedForeground} style={{ fontWeight: '700' }}>곧 열려요</T>
        </View>
      </View>

      {ITEMS.map((x, i) => (
        <View key={x.id} testID={`refund-${x.id}`} accessible accessibilityRole="text" accessibilityLabel={`${x.title}. 준비 중이에요`} accessibilityState={{ disabled: true }}
          style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: 0.6 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={x.icon} size={24} color={c.mutedForeground} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">{i + 1}. {x.title}</T>
            <T v="small" color={c.mutedForeground}>{x.desc}</T>
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Feather name="lock" size={20} color={c.mutedForeground} />
            <T v="small" color={c.mutedForeground} style={{ fontSize: 12, lineHeight: 16 }}>준비 중</T>
          </View>
        </View>
      ))}
      <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>열리면 알림으로 알려드릴게요</T>
      <Disclaimer />
    </Page>
  );
}
