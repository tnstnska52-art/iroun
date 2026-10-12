import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Benefit } from '@workspace/api-client-react';
import { Emoji, T } from '@/components/ui';
import { dday } from '@/components/BenefitCard';
import { useColors } from '@/hooks/useColors';
import { won } from '@/lib/estimate';

/** 오늘 받기 쉬운 지원금을 한 건씩 5초마다 위로 올리며 보여준다. */
export function TodayPicks({ items }: { items: { benefit: Benefit; result: string }[] }) {
  const c = useColors();
  const router = useRouter();
  const [i, setI] = useState(0);
  // 5초마다 지금 것은 위로 올라가 사라지고 다음 것이 아래에서 올라온다.
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(56);
  const n = items.length;
  useEffect(() => {
    if (n < 2) return;
    const native = Platform.OS !== 'web';
    const h = setInterval(() => {
      Animated.timing(x, { toValue: -w, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: native }).start(() => {
        setI((k) => (k + 1) % n);
        x.setValue(w);
        Animated.timing(x, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
      });
    }, 5000);
    return () => clearInterval(h);
  }, [n, x, w]);
  if (n === 0) return null;
  const cur = items[i % n];
  const b = cur.benefit;
  const dd = dday(b);
  const tail = dd.label;
  return (
    <Pressable testID="home-picks" accessibilityRole="button" accessibilityLabel={`오늘 받기 쉬운 지원금 ${(i % n) + 1}번째. ${b.title}. 자세히 보기`}
      onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: b.id } })}
      style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 18, gap: 10, borderWidth: 1.5, borderColor: c.primary, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Emoji char="🎯" size={18} motion="pulse" />
        <T v="label" color={c.primary} style={{ flex: 1 }}>오늘 받기 쉬운 지원금</T>
        <T v="small" color={c.mutedForeground}>{(i % n) + 1} / {n}</T>
      </View>
      <View style={{ overflow: 'hidden' }} onLayout={(e) => setW(Math.max(40, e.nativeEvent.layout.height))}>
      <Animated.View style={{ transform: [{ translateY: x }], flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3" numberOfLines={1} testID="home-pick-title">{b.title}</T>
          <T v="small" color={dd.urgent ? c.destructive : c.mutedForeground} numberOfLines={1}>{cur.result === '조건 일치' ? '조건 일치 · ' : ''}오늘 신청 가능 · {tail}</T>
        </View>
        <T v="label" color={c.primary}>{b.maxAmount ? won(b.maxAmount) : '금액 확인'}</T>
        <Feather name="chevron-right" size={20} color={c.mutedForeground} />
      </Animated.View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {items.map((x, k) => <View key={x.benefit.id} style={{ width: k === i % n ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: k === i % n ? c.primary : c.border }} />)}
      </View>
    </Pressable>
  );
}
