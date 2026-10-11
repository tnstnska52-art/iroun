import React from 'react';
import {
  ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput,
  TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useSettings } from '@/lib/settings';
import { DISCLAIMER } from '@/lib/text';
import { KeyboardAwareScrollViewCompat } from './KeyboardAwareScrollViewCompat';

/** 웹에서는 Pretendard를 쓴다. 기기 앱에서는 글꼴 파일을 넣기 전까지 기본 글꼴로 보인다. */
export const FONT = Platform.OS === 'web' ? ({ fontFamily: 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif' } as const) : {};
type Variant = 'hero' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'label';
/** 휴대폰 앱: 굵기마다 글꼴 파일이 따로 있어서 굵기에 맞는 파일을 고른다. 웹은 그대로 둔다. */
export function nativeFont(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  if (Platform.OS === 'web') return style;
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return flat;
  const w = flat.fontWeight === 'bold' ? 700 : flat.fontWeight === 'normal' || flat.fontWeight === undefined ? 400 : Number(flat.fontWeight) || 400;
  const face = w >= 800 ? 'ExtraBold' : w >= 700 ? 'Bold' : w >= 600 ? 'SemiBold' : w >= 500 ? 'Medium' : 'Regular';
  return { ...flat, fontFamily: `Pretendard-${face}`, fontWeight: 'normal' };
}
const SIZES: Record<Variant, { s: number; w: TextStyle['fontWeight']; l: number }> = {
  hero: { s: 30, w: '800', l: 40 },
  title: { s: 24, w: '800', l: 33 },
  h2: { s: 20, w: '700', l: 28 },
  h3: { s: 18, w: '700', l: 26 },
  body: { s: 17, w: '400', l: 26 },
  small: { s: 15, w: '400', l: 22 },
  label: { s: 16, w: '700', l: 23 },
};

export function T({ v = 'body', color, style, children, ...rest }: {
  v?: Variant; color?: string; style?: StyleProp<TextStyle>; children?: React.ReactNode;
  accessibilityRole?: 'header' | 'text' | 'link'; testID?: string; selectable?: boolean; numberOfLines?: number;
}) {
  const c = useColors();
  const { scale } = useSettings();
  const z = SIZES[v];
  return (
    <Text
      maxFontSizeMultiplier={2}
      accessibilityRole={v === 'hero' || v === 'title' ? 'header' : rest.accessibilityRole}
      {...rest}
      style={nativeFont([FONT, { fontSize: z.s * scale, lineHeight: z.l * scale, fontWeight: z.w, color: color ?? c.foreground, flexShrink: 1 }, style])}
    >
      {children}
    </Text>
  );
}

export function Page({ title, subtitle, back, children, tab, right, footer, flush }: {
  title?: string; subtitle?: string; back?: boolean; children: React.ReactNode; tab?: boolean; right?: React.ReactNode;
  /** 화면 아래에 고정되는 대표 행동 영역 */ footer?: React.ReactNode; /** 좌우 여백 없이 꽉 채우는 머리 영역을 직접 그릴 때 */ flush?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [focused,setFocused] = React.useState(true);
  useFocusEffect(React.useCallback(()=>{
    setFocused(true);
    return ()=>setFocused(false);
  },[]));
  const top = flush ? 0 : Platform.OS === 'web' ? 16 : insets.top + 8;
  const bottom = footer ? 24 : Platform.OS === 'web' ? 32 : insets.bottom + (tab ? 24 : 40);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
    <KeyboardAwareScrollViewCompat
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!focused}
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: flush ? 0 : 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      bottomOffset={24}
    >
      {back ? (
        <Pressable
          testID="back-button"
          accessibilityRole="button"
          accessibilityLabel="이전 화면으로 돌아가기"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.back}
        >
          <Feather name="chevron-left" size={28} color={c.foreground} />
        </Pressable>
      ) : null}
      {title ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="title" style={{ flex: 1 }}>{title}</T>
            {right}
          </View>
          {subtitle ? <T v="small" color={c.mutedForeground}>{subtitle}</T> : null}
        </View>
      ) : null}
      {children}
    </KeyboardAwareScrollViewCompat>
    {footer ? (
      <View style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: (Platform.OS === 'web' ? 12 : insets.bottom + 10), gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        {footer}
      </View>
    ) : null}
    </View>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'soft' | 'plain' }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: tone === 'soft' ? c.primarySoft : c.card, borderRadius: c.radius + 2, padding: 16, gap: 8 }, style]}>
      {children}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', icon, disabled, loading, testID, hint, style }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean; loading?: boolean; testID?: string; hint?: string; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? c.destructive : kind === 'secondary' ? c.card : 'transparent';
  const small = kind === 'ghost';
  const fg = kind === 'primary' || kind === 'danger' ? '#FFFFFF' : c.primary;
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [{
        minHeight: small ? 46 : 56, borderRadius: 12, backgroundColor: bg, paddingHorizontal: 16, paddingVertical: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: kind === 'secondary' ? 1 : 0, borderColor: c.input,
        opacity: off ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }],
      }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={18} color={fg} /> : null}
      <T v="label" color={fg} style={{ textAlign: 'center' }}>{label}</T>
    </Pressable>
  );
}

export function Field({ label, error, hint, ...rest }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const c = useColors();
  const { scale } = useSettings();
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      {hint ? <T v="small" color={c.mutedForeground}>{hint}</T> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.mutedForeground}
        maxFontSizeMultiplier={2}
        {...rest}
        style={nativeFont([FONT, {
          minHeight: 56, borderWidth: 1, borderColor: error ? c.destructive : c.input, borderRadius: 10,
          paddingHorizontal: 14, paddingVertical: 12, fontSize: 17 * scale, color: c.foreground, backgroundColor: c.card,
        }, rest.multiline ? { minHeight: 110, textAlignVertical: 'top' } : null])}
      />
      {error ? <T v="small" color={c.destructive} accessibilityRole="text">{error}</T> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      aria-pressed={!!selected}
      onPress={onPress}
      style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, justifyContent: 'center', backgroundColor: selected ? c.primary : c.card, borderWidth: 1, borderColor: selected ? c.primary : c.input, flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      <T v="small" color={selected ? '#fff' : c.foreground} style={{ fontWeight: '600' }}>{label}</T>
    </Pressable>
  );
}

export function Wrap({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function Notice({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warn' | 'error' | 'ok'; title?: string; children?: React.ReactNode; icon?: keyof typeof Feather.glyphMap }) {
  const c = useColors();
  const m = {
    info: { bg: c.primarySoft, fg: c.primary, ic: 'info' as const },
    warn: { bg: c.warningSoft, fg: c.warning, ic: 'alert-triangle' as const },
    error: { bg: c.destructiveSoft, fg: c.destructive, ic: 'alert-circle' as const },
    ok: { bg: c.successSoft, fg: c.success, ic: 'check-circle' as const },
  }[tone];
  const parts = React.Children.toArray(children);
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={{ backgroundColor: m.bg, borderRadius: c.radius, padding: 14, flexDirection: 'row', gap: 10 }}>
      <Feather name={icon ?? m.ic} size={18} color={m.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>
        {title ? <T v="label" color={m.fg}>{title}</T> : null}
        {parts.length > 0 && parts.every(p => typeof p === 'string' || typeof p === 'number')
          ? <T v="small" color={m.fg}>{parts.join('')}</T>
          : parts.map((p, i) => typeof p === 'string' || typeof p === 'number' ? <T key={i} v="small" color={m.fg}>{p}</T> : p)}
      </View>
    </View>
  );
}

export function Badge({ label, tone = 'info' }: { label: string; tone?: 'info' | 'ok' | 'warn' | 'error' | 'muted' }) {
  const c = useColors();
  const m = { info: [c.primarySoft, c.primary], ok: [c.successSoft, c.success], warn: [c.warningSoft, c.warning], error: [c.destructiveSoft, c.destructive], muted: [c.secondary, c.mutedForeground] }[tone];
  return (
    <View style={{ backgroundColor: m[0], borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <T v="small" color={m[1]} style={{ fontWeight: '700', fontSize: 12, lineHeight: 16 }}>{label}</T>
    </View>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  const c = useColors();
  return (
    <View accessibilityLabel="불러오는 중" accessibilityLiveRegion="polite" style={{ gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ backgroundColor: c.card, borderRadius: c.radius + 2, padding: 16, gap: 10 }}>
          <View style={{ height: 18, width: '60%', backgroundColor: c.secondary, borderRadius: 6 }} />
          <View style={{ height: 16, width: '90%', backgroundColor: c.secondary, borderRadius: 6 }} />
          <View style={{ height: 16, width: '40%', backgroundColor: c.secondary, borderRadius: 6 }} />
        </View>
      ))}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Notice tone="error" title="불러오지 못했습니다">{message}</Notice>
      {onRetry ? <Btn label="다시 시도" icon="refresh-cw" onPress={onRetry} testID="retry-button" /> : null}
    </View>
  );
}

export function Empty({ icon = 'inbox', title, body, action }: { icon?: keyof typeof Feather.glyphMap; title: string; body?: string; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={24} color={c.primary} />
      </View>
      <T v="h3" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>{body}</T> : null}
      {action ? <View style={{ alignSelf: 'stretch', marginTop: 6, gap: 10 }}>{action}</View> : null}
    </Card>
  );
}

export function Disclaimer() {
  const c = useColors();
  return <T v="small" color={c.mutedForeground} style={{ textAlign: 'center', fontSize: 12, lineHeight: 18 }} testID="disclaimer">{DISCLAIMER}</T>;
}

export function Toggle({ label, desc, value, onChange, disabled, testID }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={desc}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{label}</T>
        {desc ? <T v="small" color={c.mutedForeground}>{desc}</T> : null}
      </View>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? c.primary : c.input, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      <T v="h2" accessibilityRole="header">{title}</T>
      {children}
    </View>
  );
}

export function ListRow({ icon, label, desc, onPress, testID }: { icon: keyof typeof Feather.glyphMap; label: string; desc?: string; onPress: () => void; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={desc ? `${label}. ${desc}` : label}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: c.radius, paddingHorizontal: 14, paddingVertical: 10, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={18} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{label}</T>
        {desc ? <T v="small" color={c.mutedForeground}>{desc}</T> : null}
      </View>
      <Feather name="chevron-right" size={20} color={c.mutedForeground} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  back: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -6 },
});
export { ScrollView };

export function FooterLinks() {
  const c = useColors();
  const items: [string, string, string][] = [
    ['서비스 소개', '/about', 'footer-about'],
    ['개인정보처리방침', '/legal?section=privacy', 'footer-privacy'],
    ['이용약관', '/legal?section=terms', 'footer-terms'],
    ['계정 삭제 요청', '/delete-request', 'footer-delete'],
  ];
  return (
    <View accessibilityRole="menu" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, justifyContent: 'center' }}>
      {items.map(([l, h, id]) => (
        <Link key={id} href={h as never} testID={id} accessibilityRole="link" accessibilityLabel={l} style={{ minHeight: 40, paddingVertical: 10, color: c.mutedForeground, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>
          {l}
        </Link>
      ))}
    </View>
  );
}

/** 참고 영상의 상세 화면처럼 제목이 테두리에 걸친 묶음 상자 */
export function Box({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.card, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 14, gap: 6 }}>{children}</View>
      <View style={{ position: 'absolute', top: -11, left: 10, backgroundColor: c.card, paddingHorizontal: 6, borderRadius: 4 }}>
        <T v="h3" accessibilityRole="header">{title}</T>
      </View>
    </View>
  );
}

/** 화면 위쪽에 잠깐 떠서 저장 결과를 알리는 알약 모양 안내 */
export function Toast({ text, tone = 'ok' }: { text: string | null; tone?: 'ok' | 'error' }) {
  const c = useColors();
  if (!text) return null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', zIndex: 50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4, maxWidth: '90%' }}>
        <Feather name={tone === 'ok' ? 'check' : 'alert-circle'} size={18} color={tone === 'ok' ? c.primary : c.destructive} />
        <T v="small" style={{ fontWeight: '600' }}>{text}</T>
      </View>
    </View>
  );
}

/** 섹션 제목 옆에서 살짝 움직이는 그림 문자. 장식이므로 화면 낭독에서는 건너뛴다. */
export function Emoji({ char, size = 22, motion = 'bounce' }: { char: string; size?: number; motion?: 'bounce' | 'wiggle' | 'pulse' }) {
  const v = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(v, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(500),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const transform = motion === 'wiggle' ? [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '12deg'] }) }]
    : motion === 'pulse' ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }]
    : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }];
  return <Animated.Text accessibilityElementsHidden importantForAccessibility="no" aria-hidden style={{ fontSize: size, lineHeight: size * 1.3, transform }}>{char}</Animated.Text>;
}

/** 0에서 목표 숫자까지 빠르게 올라가는 숫자 */
export function CountUp({ to, duration = 900, format, style, color }: { to: number; duration?: number; format?: (n: number) => string; style?: StyleProp<TextStyle>; color?: string }) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <T v="hero" color={color} style={style} accessibilityRole="text">{format ? format(n) : n.toLocaleString('ko-KR')}</T>;
}

/** 큰 금액: 숫자는 또렷하게, 단위(만원)는 한 단계 작게. */
export function BigMoney({ manwon, color, testID }: { manwon: number; color?: string; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={`${manwon.toLocaleString('ko-KR')}만원`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
      <CountUp to={manwon} color={color} style={{ fontSize: 40, lineHeight: 50, fontWeight: '700', letterSpacing: -0.5 }} />
      <T color={color} style={{ fontSize: 22, lineHeight: 30, fontWeight: '700' }}>만원</T>
    </View>
  );
}

/** 제목 왼쪽에 움직이는 그림 문자가 붙는 섹션 머리 */
export function SectionHead({ emoji, motion, title, onMore, testID }: { emoji?: string; motion?: 'bounce' | 'wiggle' | 'pulse'; title: string; onMore?: () => void; testID?: string }) {
  const c = useColors();
  return (
    <Pressable testID={testID} accessibilityRole={onMore ? 'button' : 'header'} accessibilityLabel={onMore ? `${title} 더 보기` : title} disabled={!onMore} onPress={onMore}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 2 }}>
      {emoji ? <Emoji char={emoji} motion={motion} /> : null}
      <T v="h2" style={{ flex: 1 }}>{title}</T>
      {onMore ? <Feather name="chevron-right" size={22} color={c.foreground} /> : null}
    </Pressable>
  );
}
