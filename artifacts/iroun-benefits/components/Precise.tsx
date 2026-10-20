import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Btn, T } from '@/components/ui';
import { GrantRow } from '@/components/GrantList';
import { useColors } from '@/hooks/useColors';
import type { EstimateItem } from '@/lib/estimate';

/** 지원금 패키지 고객이 정밀 조건을 아직 안 골랐을 때 보여주는 안내 */
export function PreciseBanner() {
  const c = useColors();
  const router = useRouter();
  return (
    <View testID="precise-banner" style={{ backgroundColor: c.secondary, borderRadius: c.radius + 4, padding: 18, gap: 8 }}>
      <T v="h3">대표님 조건에 딱 맞는 사업만 골라 드릴게요</T>
      <T v="small" color={c.mutedForeground}>대표자 출생연도·사업자 형태·여성 대표 여부 3가지만 더 알려 주세요. 청년·법인·여성 전용 사업까지 정확히 걸러요.</T>
      <Btn label="3가지 더 고르기" onPress={() => router.push('/precise' as never)} testID="precise-open" />
    </View>
  );
}

/** 정밀 모드에서 목록에서 뺀 공고: 원문에 자격이 분명하지 않아 담당자가 확인하는 사업 */
export function PendingBox({ items }: { items: EstimateItem[] }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <View testID="pending-box" style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} testID="pending-toggle"
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">담당자가 자격을 확인 중인 사업 {items.length}건</T>
          <T v="small" color={c.mutedForeground}>공고 원문에 자격 조건이 분명하지 않아요. 맞으면 담당자가 알려 드려요.</T>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.mutedForeground} />
      </Pressable>
      {open ? items.map((x, i) => <GrantRow key={x.benefit.id} item={x} last={i === items.length - 1} />) : null}
    </View>
  );
}
