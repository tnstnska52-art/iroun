import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Btn, T } from '@/components/ui';
import { FREE_COUNT, won, type EstimateItem } from '@/lib/estimate';
import { useAccount } from '@/lib/session';
import { dday } from '@/components/BenefitCard';
import { fmtDate } from '@/lib/util';

const ICON: Record<string, keyof typeof Feather.glyphMap> = { 경영: 'briefcase', 고용: 'users', 생활: 'home', 세금: 'percent', 교육: 'book-open', 수출: 'globe', 보험: 'shield', 마케팅: 'trending-up', 육아: 'heart' };

/** 가입·체험 화면으로 가는 길. 비회원은 가입부터, 회원은 체험 시작으로. */
export function useJoinHref(): Href {
  const acc = useAccount();
  return (acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as Href;
}

/** 지원금 한 줄: 왼쪽에 이름, 오른쪽에 금액 */
export function GrantRow({ item, missed, locked, last }: { item: EstimateItem; missed?: boolean; locked?: boolean; last?: boolean }) {
  const c = useColors();
  const router = useRouter();
  const b = item.benefit;
  const dd = dday(b);
  const amount = b.maxAmount ? `최대 ${won(b.maxAmount)}` : '금액 공고 확인';
  const sub = missed ? `${b.endsAt ? `${fmtDate(b.endsAt)} 마감` : '마감'} · ${b.agency}` : `${item.result === '조건 일치' ? '조건 일치' : '조건 확인 필요'} · ${dd.label === '상시' || dd.label === '접수 중' || dd.label === '기간 확인' ? dd.label : `${dd.label.replace('D-', '')}일 남음`}`;
  return (
    <Pressable testID={`grant-${b.id}`} accessibilityRole="button" accessibilityLabel={locked ? '가입하면 볼 수 있는 지원금' : `${b.title}. ${amount}. 자세히 보기`} disabled={locked}
      onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: b.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={locked ? 'lock' : ICON[b.category] ?? 'file-text'} size={20} color={c.mutedForeground} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {locked ? <View style={{ height: 16, width: '72%', borderRadius: 8, backgroundColor: c.secondary }} /> : <T v="h3" numberOfLines={1}>{b.title}</T>}
        {locked ? <View style={{ height: 12, width: '44%', borderRadius: 6, backgroundColor: c.secondary, marginTop: 6 }} /> : <T v="small" color={!missed && dd.urgent ? c.destructive : c.mutedForeground} numberOfLines={1}>{sub}</T>}
      </View>
      {locked ? <View style={{ height: 16, width: 64, borderRadius: 8, backgroundColor: c.secondary }} /> : <T v="label" color={missed ? c.destructive : c.primary} style={{ flexShrink: 0 }}>{amount}</T>}
    </Pressable>
  );
}

/** 지원금 목록. 가입 전에는 위에서 3건만 열고 나머지는 잠근다. */
export function GrantList({ items, missed, unlocked }: { items: EstimateItem[]; missed?: boolean; unlocked: boolean }) {
  const c = useColors();
  const router = useRouter();
  const join = useJoinHref();
  const open = unlocked ? items : items.slice(0, FREE_COUNT);
  const rest = items.length - open.length;
  return (
    <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
      {open.map((x, i) => <GrantRow key={x.benefit.id} item={x} missed={missed} last={i === open.length - 1 && rest === 0} />)}
      {rest > 0 ? (
        <View testID="grant-locked">
          {items.slice(FREE_COUNT, FREE_COUNT + 2).map((x, i) => <GrantRow key={x.benefit.id} item={x} missed={missed} locked last={i === Math.min(rest, 2) - 1} />)}
          <View style={{ paddingVertical: 16, gap: 10, borderTopWidth: 1, borderTopColor: c.border }}>
            <T v="h3" style={{ textAlign: 'center' }}>나머지 {rest}건은 가입하면 바로 볼 수 있어요</T>
            <Btn label="무료로 전체 보기" onPress={() => router.push(join)} testID="grant-join" />
            <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>3일 무료 · 카드 등록 없음 · 자동결제 없음</T>
          </View>
        </View>
      ) : null}
    </View>
  );
}
