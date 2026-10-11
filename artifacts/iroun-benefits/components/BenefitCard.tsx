import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Benefit } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { T } from './ui';
import { daysLeft } from '@/lib/util';

export function statusTone(s: string): 'ok' | 'warn' | 'muted' | 'info' {
  return s === '접수 중' ? 'ok' : s === '마감' ? 'muted' : s === '상시 조회' ? 'info' : 'warn';
}

const AUDIENCE_ICON: Record<string, keyof typeof Feather.glyphMap> = { 사업: 'briefcase', 개인: 'user', 가구: 'home' };

/** D-day 표시. 확인된 마감일이 있을 때만 숫자를 보여준다. */
export function dday(b: Pick<Benefit, 'endsAt' | 'status'>): { label: string; urgent: boolean } {
  const d = daysLeft(b.endsAt);
  if (b.status === '마감' || (d !== null && d < 0)) return { label: '마감', urgent: false };
  if (d !== null) return { label: d === 0 ? 'D-DAY' : `D-${d}`, urgent: d <= 14 };
  return { label: b.status === '상시 조회' ? '상시' : b.status === '접수 중' ? '접수 중' : '기간 확인', urgent: false };
}

/** 참고 영상의 목록 줄: 둥근 표식 + 제목 한 줄 + 기관·마감 + 작은 "보기" */
export function BenefitCard({ b, extra }: { b: Benefit; extra?: React.ReactNode }) {
  const c = useColors();
  const router = useRouter();
  const dd = dday(b);
  return (
    <Pressable
      testID={`benefit-${b.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${b.title}. ${b.agency}. ${dd.label}. 자세히 보기`}
      onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: b.id } })}
      style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: c.radius, paddingHorizontal: 14, paddingVertical: 14, gap: 8, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={AUDIENCE_ICON[b.audience] ?? 'file-text'} size={20} color={c.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3" numberOfLines={1}>{b.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T v="small" color={c.mutedForeground} numberOfLines={1} style={{ flexShrink: 1 }}>{b.agency} · {b.audience === '사업' ? '사업자' : b.audience === '가구' ? '가구' : '누구나'}</T>
            <T v="small" color={dd.urgent ? c.destructive : c.primary} style={{ fontWeight: '700', flexShrink: 0 }}>{dd.label}</T>
          </View>
        </View>
        <View style={{ backgroundColor: c.secondary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
          <T v="small" color={c.mutedForeground} style={{ fontWeight: '600', fontSize: 12, lineHeight: 16 }}>보기</T>
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
          style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T v="small" color={c.primary} style={{ fontWeight: '700' }}>{open ? '접기' : '더 보기'}</T>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}
