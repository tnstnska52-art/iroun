import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';

const TABS = [
  { name: 'index', label: '홈', sf: 'house', feather: 'home' },
  { name: 'benefits', label: '지원금', sf: 'list.bullet.rectangle', feather: 'list' },
  { name: 'consult', label: '상담', sf: 'bubble.left', feather: 'message-circle' },
  { name: 'account', label: '더보기', sf: 'ellipsis', feather: 'more-horizontal' },
] as const;
/** 탭에는 보이지 않지만 기존 주소(/refunds, /progress) 호환을 위해 남겨 둔 화면 */
const HIDDEN = ['refunds', 'progress', 'mine'] as const;

function NativeTabLayout() {
  return (
    <NativeTabs>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Icon sf={t.sf} />
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

/** 웹 전용: ARIA tablist 키보드 동작(화살표/Home/End)과 선택 탭만 Tab 순서에 두는 roving tabIndex. */
function useWebTablistKeyboard() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const tabsOf = (list: Element) => Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).filter((t) => t.closest('[role="tablist"]') === list);
    const rove = () => {
      document.querySelectorAll('[role="tablist"]').forEach((list) => {
        const tabs = tabsOf(list);
        if (!tabs.length) return;
        const sel = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
        tabs.forEach((t) => { const v = t === sel ? '0' : '-1'; if (t.getAttribute('tabindex') !== v) t.setAttribute('tabindex', v); });
      });
    };
    const onKey = (e: KeyboardEvent) => {
      const tab = (e.target as HTMLElement | null)?.closest?.('[role="tab"]') as HTMLElement | null;
      const list = tab?.closest('[role="tablist"]');
      if (!tab || !list || e.altKey || e.ctrlKey || e.metaKey) return;
      const tabs = tabsOf(list);
      const i = tabs.indexOf(tab);
      if (i < 0) return;
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n < 0) return;
      e.preventDefault();
      tabs.forEach((t) => t.setAttribute('tabindex', t === tabs[n] ? '0' : '-1'));
      tabs[n].focus();
    };
    // 포커스가 탭 밖으로 나가면 선택된 탭 기준으로 되돌린다.
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as HTMLElement | null;
      if (!next?.closest?.('[role="tablist"]')) rove();
    };
    rove();
    const mo = new MutationObserver(() => rove());
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusout', onFocusOut);
    return () => { mo.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('focusout', onFocusOut); };
  }, []);
}

function ClassicTabLayout() {
  const colors = useColors();
  useWebTablistKeyboard();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  return (
    <Tabs
      screenOptions={{
        tabBarInactiveTintColor: '#8B95A1',
        tabBarActiveTintColor: colors.foreground,
        headerShown: false,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700', ...(isWeb ? { fontFamily: 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' } : {}) },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 6,
          ...(isWeb ? { height: 70 } : {}),
        },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarAccessibilityLabel: `${t.label} 탭`,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ color }) =>
              isIOS ? <SymbolView name={t.sf} tintColor={color} size={26} /> : <Feather name={t.feather} size={24} color={color} />,
          }}
        />
      ))}
      {HIDDEN.map((n) => <Tabs.Screen key={n} name={n} options={{ href: null }} />)}
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
