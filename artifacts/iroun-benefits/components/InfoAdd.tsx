import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Benefit, Profile } from '@workspace/api-client-react';
import { openRules, type Benefit as DomainBenefit, type Profile as DomainProfile } from '../../api-server/src/lib/benefit-domain';
import { Btn, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { DISTRICTS, PROVINCE_ORDER } from '@/lib/regions';
import { INDUSTRIES } from '@/app/onboarding';

type Q = { id: string; title: string; hint?: string; options: string[]; apply: (p: Profile, option: string) => Profile };
const THIS_YEAR = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
const YEARS = [...Array.from({ length: THIS_YEAR - 2009 }, (_, i) => `${THIS_YEAR - i}년`), '2009년 이전'];
const setBiz = (p: Profile, id: string, patch: Record<string, unknown>): Profile => ({ ...p, businesses: p.businesses.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

/**
 * 이 공고에 꼭 필요한데 아직 모르는 정보만 골라 질문으로 만든다.
 * 값이 비어 있으면 그 값을 고르게 하고(다른 공고에서도 계속 쓰인다), 값은 있는데 기준에 걸쳐 있으면 예·아니오로 묻는다.
 */
export function nextQuestion(b: Benefit, p: Profile, businessId: string): { q: Q | null; left: number } {
  const open = openRules(b as unknown as DomainBenefit, p as unknown as DomainProfile, businessId);
  const biz = p.businesses.find((x) => x.id === businessId);
  for (const x of open) {
    const r = x.rule;
    if (x.missing && r.scope === 'business') {
      if (r.field === 'industry') return { left: open.length, q: { id: 'industry', title: '어떤 업종인가요?', hint: '가장 가까운 것 하나', options: INDUSTRIES, apply: (pp, o) => setBiz(pp, businessId, { industry: o }) } };
      if (r.field === 'province') return { left: open.length, q: { id: 'province', title: '사업장은 어느 지역에 있나요?', options: PROVINCE_ORDER, apply: (pp, o) => setBiz(pp, businessId, { province: o }) } };
      if (r.field === 'district' && biz?.province && (DISTRICTS[biz.province] ?? []).length) return { left: open.length, q: { id: 'district', title: '어느 시·군·구인가요?', options: DISTRICTS[biz.province], apply: (pp, o) => setBiz(pp, businessId, { district: o }) } };
      if (r.field === 'openedAt') return { left: open.length, q: { id: 'openedYear', title: '언제 개업하셨나요?', hint: '사업자등록증 기준', options: YEARS, apply: (pp, o) => setBiz(pp, businessId, { openedYear: parseInt(o, 10) }) } };
      if (r.field === 'revenue') return { left: open.length, q: { id: 'revenue', title: '지난해 매출은 어느 정도인가요?', hint: '1년 매출 합계', options: ['1억 원 미만', '1억~3억 원', '3억~10억 원', '10억 원 이상'], apply: (pp, o) => setBiz(pp, businessId, { revenue: o }) } };
      if (r.field === 'employees') return { left: open.length, q: { id: 'employeeBand', title: '4대보험에 가입된 직원은 몇 명인가요?', hint: '대표자 본인은 빼고', options: ['없음', '1~4명', '5~9명', '10~29명', '30명 이상'], apply: (pp, o) => setBiz(pp, businessId, { employeeBand: o }) } };
      if (r.field === 'premises') return { left: open.length, q: { id: 'premises', title: '사업장은 임차인가요, 자가인가요?', options: ['임차', '자가'], apply: (pp, o) => setBiz(pp, businessId, { premises: o }) } };
    }
    return { left: open.length, q: { id: x.key, title: r.label, hint: '해당하나요?', options: ['예', '아니오'], apply: (pp, o) => ({ ...pp, confirmations: { ...(pp.confirmations ?? {}), [x.key]: { answer: o as '예' | '아니오', label: r.label } } }) } };
  }
  return { q: null, left: 0 };
}

/** 정보 추가: 한 번에 하나씩 고르면 끝. 다 고르면 onDone 으로 바뀐 정보를 넘긴다. */
export function InfoAdd({ benefit, profile, businessId, busy, onDone, onCancel }: { benefit: Benefit; profile: Profile; businessId: string; busy?: boolean; onDone: (p: Profile) => void; onCancel: () => void }) {
  const c = useColors();
  const [p, setP] = useState(profile);
  const [done, setDone] = useState(0);
  const { q, left } = useMemo(() => nextQuestion(benefit, p, businessId), [benefit, p, businessId]);
  if (!q) {
    return (
      <View testID="info-add-done" style={{ backgroundColor: c.primarySoft, borderRadius: c.radius + 4, padding: 18, gap: 10 }}>
        <T v="h3" color={c.primary}>다 됐어요</T>
        <T v="small" color={c.primary}>고른 내용은 저장돼서 다음에는 다시 묻지 않아요</T>
        <Btn label="저장하고 요청하기" loading={busy} onPress={() => onDone(p)} testID="info-add-submit" />
      </View>
    );
  }
  return (
    <View testID="info-add" style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 18, gap: 10, borderWidth: 1.5, borderColor: c.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T v="small" color={c.primary} style={{ flex: 1, fontWeight: '700' }}>정보 추가 · 남은 질문 {left}개</T>
        <Pressable testID="info-add-cancel" accessibilityRole="button" accessibilityLabel="정보 추가 닫기" onPress={onCancel} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="x" size={20} color={c.mutedForeground} />
        </Pressable>
      </View>
      <T v="h2" testID="info-add-title">{q.title}</T>
      {q.hint ? <T v="small" color={c.mutedForeground}>{q.hint}</T> : null}
      {q.options.map((o) => (
        <Pressable key={`${q.id}-${done}-${o}`} testID={`info-opt-${o}`} accessibilityRole="button" onPress={() => { setP((pp) => q.apply(pp, o)); setDone((n) => n + 1); }}
          style={({ pressed }) => ({ minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: pressed ? c.primarySoft : c.card, paddingHorizontal: 16, justifyContent: 'center' })}>
          <T style={{ fontWeight: '500' }}>{o}</T>
        </Pressable>
      ))}
    </View>
  );
}
