import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { BigMoney, Btn, CountUp, Lively, T } from '@/components/ui';
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
  const amount = b.maxAmount ? won(b.maxAmount) : '금액 확인';
  const sub = missed ? `${b.endsAt ? `${fmtDate(b.endsAt)} 마감` : '마감'} · ${b.agency}` : `${item.result === '조건 일치' ? '조건 일치' : '확인 필요'} · ${dd.label === '상시' || dd.label === '접수 중' || dd.label === '기간 확인' ? dd.label : `${dd.label.replace('D-', '')}일 남음`}`;
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
            <T v="h3" style={{ textAlign: 'center' }}>{rest}건 더 있어요</T>
            <Btn label="무료로 전체 보기" onPress={() => router.push(join)} testID="grant-join" />
            <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>3일 무료 · 자동결제 없음</T>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** 건수와 금액을 위아래로 크게 보여주는 카드. 한 줄에 한 가지 정보만 둔다. */
export function Total({ label, count, total, tone = 'blue', note, onPress, testID, children }: { label: string; count: number; total: number; tone?: 'blue' | 'red'; note?: string; onPress?: () => void; testID?: string; children?: React.ReactNode }) {
  const c = useColors();
  const color = tone === 'red' ? c.destructive : c.primary;
  return (
    <Pressable testID={testID} accessibilityRole={onPress ? 'button' : 'summary'} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: tone === 'red' ? c.destructiveSoft : c.card, borderRadius: c.radius + 6, padding: 22, gap: 2, opacity: pressed ? 0.9 : 1 })}>
      <View accessible accessibilityRole="text" accessibilityLabel={`${label} ${count}건`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <T v="h3" color={tone === 'red' ? c.destructive : c.foreground}>{label}</T>
        <Lively>
          <View style={{ backgroundColor: color, borderRadius: 14, paddingHorizontal: 10, minHeight: 28, justifyContent: 'center' }}>
            <CountUp key={`${label}${count}`} to={count} duration={700} color="#FFFFFF" style={{ fontSize: 16, lineHeight: 22, fontWeight: '800' }} format={(n) => `${n}건`} />
          </View>
        </Lively>
      </View>
      {total > 0 ? <BigMoney key={`${label}${total}`} manwon={Math.floor(total / 10000)} color={color} /> : null}
      <T v="small" color={tone === 'red' ? c.destructive : c.mutedForeground}>{note ?? (total > 0 ? '공고 기준 최대 금액' : '금액은 공고에서 확인')}</T>
      {children}
    </Pressable>
  );
}
