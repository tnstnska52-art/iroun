import React from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput,
  TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useSettings } from '@/lib/settings';
import { DISCLAIMER } from '@/lib/text';
import { KeyboardAwareScrollViewCompat } from './KeyboardAwareScrollViewCompat';

type Variant = 'hero' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'label';
const SIZES: Record<Variant, { s: number; w: TextStyle['fontWeight']; l: number }> = {
  hero: { s: 32, w: '800', l: 42 },
  title: { s: 28, w: '800', l: 38 },
  h2: { s: 22, w: '700', l: 31 },
  h3: { s: 20, w: '700', l: 28 },
  body: { s: 18, w: '400', l: 28 },
  small: { s: 16, w: '400', l: 24 },
  label: { s: 17, w: '700', l: 24 },
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
      style={[{ fontSize: z.s * scale, lineHeight: z.l * scale, fontWeight: z.w, color: color ?? c.foreground, flexShrink: 1 }, style]}
    >
      {children}
    </Text>
  );
}

export function Page({ title, subtitle, back, children, tab, right }: {
  title?: string; subtitle?: string; back?: boolean; children: React.ReactNode; tab?: boolean; right?: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [focused,setFocused] = React.useState(true);
  useFocusEffect(React.useCallback(()=>{
    setFocused(true);
    return ()=>setFocused(false);
  },[]));
  const top = Platform.OS === 'web' ? 67 : insets.top + 8;
  const bottom = Platform.OS === 'web' ? 34 + 24 : insets.bottom + (tab ? 24 : 40);
  return (
    <KeyboardAwareScrollViewCompat
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!focused}
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: 20, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' }}
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
          <Feather name="arrow-left" size={24} color={c.primary} />
          <T v="label" color={c.primary}>뒤로</T>
        </Pressable>
      ) : null}
      {title ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T v="title" style={{ flex: 1 }}>{title}</T>
            {right}
          </View>
          {subtitle ? <T color={c.mutedForeground}>{subtitle}</T> : null}
        </View>
      ) : null}
      {children}
    </KeyboardAwareScrollViewCompat>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'soft' | 'plain' }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: tone === 'soft' ? c.primarySoft : c.card, borderRadius: c.radius + 4, padding: 18, gap: 10, borderWidth: 1, borderColor: tone === 'soft' ? c.primarySoft : c.border }, style]}>
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
        minHeight: 60, borderRadius: c.radius, backgroundColor: bg, paddingHorizontal: 18, paddingVertical: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        borderWidth: kind === 'secondary' ? 2 : 0, borderColor: c.primary,
        opacity: off ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }],
      }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={22} color={fg} /> : null}
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
        style={[{
          minHeight: 60, borderWidth: 2, borderColor: error ? c.destructive : c.input, borderRadius: c.radius,
          paddingHorizontal: 14, paddingVertical: 12, fontSize: 19 * scale, color: c.foreground, backgroundColor: c.card,
        }, rest.multiline ? { minHeight: 110, textAlignVertical: 'top' } : null]}
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
      style={{ minHeight: 52, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 26, justifyContent: 'center', backgroundColor: selected ? c.primary : c.card, borderWidth: 2, borderColor: selected ? c.primary : c.input, flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      {selected ? <Feather name="check" size={18} color="#fff" /> : null}
      <T v="label" color={selected ? '#fff' : c.foreground}>{label}</T>
    </Pressable>
  );
}

export function Wrap({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
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
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={{ backgroundColor: m.bg, borderRadius: c.radius, padding: 16, flexDirection: 'row', gap: 12 }}>
      <Feather name={icon ?? m.ic} size={24} color={m.fg} style={{ marginTop: 2 }} />
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
    <View style={{ backgroundColor: m[0], borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <T v="small" color={m[1]} style={{ fontWeight: '700' }}>{label}</T>
    </View>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  const c = useColors();
  return (
    <View accessibilityLabel="불러오는 중" accessibilityLiveRegion="polite" style={{ gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 18, gap: 10, borderWidth: 1, borderColor: c.border }}>
          <View style={{ height: 22, width: '60%', backgroundColor: c.secondary, borderRadius: 6 }} />
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
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={30} color={c.primary} />
      </View>
      <T v="h3" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T color={c.mutedForeground} style={{ textAlign: 'center' }}>{body}</T> : null}
      {action ? <View style={{ alignSelf: 'stretch', marginTop: 6, gap: 10 }}>{action}</View> : null}
    </Card>
  );
}

export function Disclaimer() {
  const c = useColors();
  return <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }} testID="disclaimer">{DISCLAIMER}</T>;
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
      style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{label}</T>
        {desc ? <T v="small" color={c.mutedForeground}>{desc}</T> : null}
      </View>
      <View style={{ width: 64, height: 36, borderRadius: 18, backgroundColor: value ? c.primary : c.input, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          {value ? <Feather name="check" size={18} color={c.primary} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
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
      style={({ pressed }) => ({ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.card, borderRadius: c.radius + 2, padding: 16, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={24} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{label}</T>
        {desc ? <T v="small" color={c.mutedForeground}>{desc}</T> : null}
      </View>
      <Feather name="chevron-right" size={24} color={c.mutedForeground} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  back: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
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
    <View accessibilityRole="menu" style={{ gap: 4, alignItems: 'center' }}>
      {items.map(([l, h, id]) => (
        <Link key={id} href={h as never} testID={id} accessibilityRole="link" accessibilityLabel={l} style={{ minHeight: 48, paddingVertical: 12, color: c.primary, fontSize: 17, fontWeight: '700', textDecorationLine: 'underline' }}>
          {l}
        </Link>
      ))}
    </View>
  );
}
