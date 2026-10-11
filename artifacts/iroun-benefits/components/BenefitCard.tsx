import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Benefit } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Badge, T } from './ui';
import { daysLeft, fmtDate } from '@/lib/util';

export function statusTone(s: string): 'ok' | 'warn' | 'muted' | 'info' {
  return s === '접수 중' ? 'ok' : s === '마감' ? 'muted' : s === '상시 조회' ? 'info' : 'warn';
}

export function BenefitCard({ b, extra }: { b: Benefit; extra?: React.ReactNode }) {
  const c = useColors();
  const router = useRouter();
  const d = daysLeft(b.endsAt);
  const soon = d !== null && d >= 0 && d <= 14;
  return (
    <Pressable
      testID={`benefit-${b.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${b.title}. ${b.kind}. ${b.status}. 자세히 보기`}
      onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: b.id } })}
      style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 18, gap: 10, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Badge label={b.status} tone={statusTone(b.status)} />
        <Badge label={b.kind} tone={b.kind === '환급금' ? 'ok' : 'info'} />
        <Badge label={b.audience} tone="muted" />
        {b.isTest ? <Badge label="시험용" tone="warn" /> : null}
      </View>
      <T v="h3">{b.title}</T>
      <T v="small" color={c.mutedForeground}>{b.agency} · {b.region}</T>
      <View style={{ backgroundColor: c.secondary, borderRadius: c.radius, padding: 12, gap: 4 }}>
        <T v="small" color={c.mutedForeground} style={{ fontWeight: '700' }}>지원형태 확인 필요</T>
        <T numberOfLines={3}>{b.support || b.summary || '지원 내용은 공식 출처에서 확인해 주세요.'}</T>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 }}>
        {b.endsAt ? (
          <T v="small" color={soon ? c.destructive : c.mutedForeground} style={{ fontWeight: '700' }}>
            마감 {fmtDate(b.endsAt)}{d !== null && d >= 0 ? ` · ${d}일 남음` : ''}
          </T>
        ) : <T v="small" color={c.mutedForeground}>마감일 공고 없음</T>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="shield" size={16} color={c.mutedForeground} />
          <T v="small" color={c.mutedForeground}>출처 확인 {fmtDate(b.checkedAt)}</T>
        </View>
      </View>
      {extra}
    </Pressable>
  );
}

/** 긴 선택 문구만 접습니다. 핵심 정보에는 쓰지 않습니다. */
export function Collapsible({ text, lines = 4, testID }: { text: string; lines?: number; testID?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const long = text.length > 140 || text.split('\n').length > lines;
  return (
    <View style={{ gap: 6 }}>
      <T numberOfLines={long && !open ? lines : undefined}>{text}</T>
      {long ? (
        <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="label" color={c.primary}>{open ? '접기' : '더 보기'}</T>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}
