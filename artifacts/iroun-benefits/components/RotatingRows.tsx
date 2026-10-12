import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { GrantRow } from '@/components/GrantList';
import type { EstimateItem } from '@/lib/estimate';

/**
 * 목록을 몇 줄만 보여주고, 일정 시간마다 한 줄씩 위로 올린다(전광판처럼).
 * 어지럽지 않게: 한 번에 한 줄만, 천천히, 줄 수가 보이는 칸보다 많을 때만 움직인다.
 */
export function RotatingRows({ items, visible = 3, interval = 4000, delay = 0, testID }: { items: EstimateItem[]; visible?: number; interval?: number; delay?: number; testID?: string }) {
  const [start, setStart] = useState(0);
  const [rowH, setRowH] = useState(0);
  const y = useRef(new Animated.Value(0)).current;
  const n = items.length;
  const moving = n > visible && rowH > 0;
  useEffect(() => {
    if (!moving) return;
    const native = Platform.OS !== 'web';
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      Animated.timing(y, { toValue: -rowH, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }).start(({ finished }) => {
        if (!finished) return;
        setStart((k) => (k + 1) % n);
        y.setValue(0);
      });
    };
    const first = setTimeout(() => { tick(); timer = setInterval(tick, interval); }, interval + delay);
    return () => { clearTimeout(first); if (timer) clearInterval(timer); y.stopAnimation(); y.setValue(0); };
  }, [moving, rowH, n, interval, delay, y]);
  // 조건이 바뀌어 목록이 줄어들면 처음부터 다시 보여준다.
  useEffect(() => { setStart(0); }, [n]);

  if (!moving) {
    return (
      <View testID={testID}>
        {items.slice(0, visible).map((x, i) => (
          <View key={x.benefit.id} onLayout={i === 0 ? (e) => setRowH(e.nativeEvent.layout.height) : undefined}>
            <GrantRow item={x} last={i === Math.min(n, visible) - 1} />
          </View>
        ))}
      </View>
    );
  }
  // 보이는 줄 + 아래에서 올라올 한 줄
  const windowItems = Array.from({ length: visible + 1 }, (_, i) => items[(start + i) % n]);
  return (
    <View testID={testID} style={{ height: rowH * visible, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {windowItems.map((x, i) => (
          <View key={`${x.benefit.id}-${(start + i) % n}`} style={{ height: rowH }}>
            <GrantRow item={x} last={false} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
