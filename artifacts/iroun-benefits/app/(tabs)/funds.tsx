import React, { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { Btn, Disclaimer, Page, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { CONSULT_COUNT, FUNDS, FUND_BASE_RATE, FUND_CHECKED_AT, FUND_DONE_KEY, FUND_SOURCE, type Fund } from '@/lib/funds';

/** 정책자금 탭: 위에는 진단 받기, 아래에는 지금 열려 있는 직접대출·대리대출 목록. */
export default function Funds() {
  const c = useColors();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [kind, setKind] = useState<Fund['kind']>('직접대출');
  const [open, setOpen] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { AsyncStorage.getItem(FUND_DONE_KEY).then((v) => setSent(!!v)).catch(() => {}); }, []));
  const list = FUNDS.filter((f) => f.kind === kind);

  return (
    <Page tab title="정책자금">
      {sent ? (
        <View testID="fund-sent" style={{ backgroundColor: c.primarySoft, borderRadius: c.radius + 6, padding: 22, gap: 8 }}>
          <T v="h2" color={c.primary}>전문가에게 전달했어요</T>
          <T color={c.primary}>24시간 이내로{'\n'}누적 상담 {CONSULT_COUNT.toLocaleString('ko-KR')}건 이상의 전문가가{'\n'}진단 결과를 안내드려요</T>
          <T v="small" color={c.primary}>전화가 와서 "이로운사람들"이라고 하면{'\n'}편하게 답변해 주세요</T>
          <Pressable testID="fund-again" accessibilityRole="button" onPress={() => router.push('/fund-check' as never)} style={{ minHeight: 40, justifyContent: 'center' }}>
            <T v="small" color={c.primary} style={{ textDecorationLine: 'underline' }}>다시 진단받기</T>
          </Pressable>
        </View>
      ) : (
        <Pressable testID="fund-start" accessibilityRole="button" accessibilityLabel="정책자금 예상 한도와 금리 진단받기" onPress={() => router.push('/fund-check' as never)}
          style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: c.radius + 6, paddingVertical: 24, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.9 : 1 })}>
          <View style={{ flex: 1, gap: 4 }}>
            <T color="#DCE6FF" style={{ fontWeight: '500' }}>내 사업자로 가능한 정책자금</T>
            <T color="#FFFFFF" style={{ fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3 }}>예상 한도·금리 진단받기</T>
          </View>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="arrow-right" size={26} color={c.primary} />
          </View>
        </Pressable>
      )}

      <T v="h2" style={{ marginTop: 8 }}>지금 신청 가능한 정책자금</T>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: '#E5E8EB', borderRadius: 12, padding: 4 }}>
        {(['직접대출', '대리대출'] as const).map((k) => {
          const on = kind === k;
          return (
            <Pressable key={k} testID={`fund-kind-${k}`} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { setKind(k); setOpen(null); }}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: on ? c.card : 'transparent' }}>
              <T v="label" color={on ? c.foreground : c.mutedForeground} style={{ fontWeight: on ? '800' : '500' }}>{k} {FUNDS.filter((f) => f.kind === k).length}</T>
            </Pressable>
          );
        })}
      </View>
      <T v="small" color={c.mutedForeground}>{kind === '직접대출' ? '공단이 직접 빌려줘요' : '보증서를 받아 은행에서 빌려요'}</T>

      <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
        {list.map((f, i) => {
          const on = open === f.id;
          return (
            <View key={f.id} style={{ borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
              <Pressable testID={`fund-${f.id}`} accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : f.id)}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontWeight: '600' }}>{f.name}</T>
                  <T v="small" color={f.status === '접수 중' ? c.primary : c.mutedForeground}>{f.status}</T>
                </View>
                <Feather name={on ? 'chevron-up' : 'chevron-down'} size={22} color={c.mutedForeground} />
              </Pressable>
              {on ? (
                <View testID={`fund-detail-${f.id}`} style={{ paddingBottom: 16, gap: 10 }}>
                  {([['금리', [f.rate]], ['한도', f.limit.split(' / ')]] as const).map(([k, lines]) => (
                    <View key={k} style={{ backgroundColor: c.secondary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 14 }}>
                      <T color={c.mutedForeground} style={{ width: 36 }}>{k}</T>
                      <View style={{ flex: 1, gap: 2 }}>{lines.map((x) => <T key={x} style={{ fontWeight: '600' }}>{x}</T>)}</View>
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 14 }}><T v="small" color={c.mutedForeground} style={{ width: 36 }}>대상</T><T v="small" style={{ flex: 1 }}>{f.target}</T></View>
                  <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 14 }}><T v="small" color={c.mutedForeground} style={{ width: 36 }}>기간</T><T v="small" style={{ flex: 1 }}>{f.term}</T></View>
                  <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 14 }}><T v="small" color={c.mutedForeground} style={{ width: 36 }}>접수</T><T v="small" style={{ flex: 1 }}>{f.period}</T></View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <T v="small" color={c.mutedForeground}>{FUND_BASE_RATE}</T>
      <T v="small" color={c.mutedForeground}>소상공인시장진흥공단 안내 · 확인일 {FUND_CHECKED_AT.replace(/-/g, '.')}</T>
      <Btn kind="secondary" label="공단 사이트에서 확인" icon="external-link" onPress={() => Linking.openURL(FUND_SOURCE)} testID="fund-source" />
      <T v="small" color={c.mutedForeground}>대출 심사와 결정은 공단과 은행이 합니다</T>
      <Disclaimer />
    </Page>
  );
}
