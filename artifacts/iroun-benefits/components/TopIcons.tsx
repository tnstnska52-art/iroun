import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useOpenGrants } from '@/lib/open-grants';

/** 모든 화면 오른쪽 위에 고정되는 내 정보·알림 아이콘. 종에는 지금 신청 가능한 건수가 붙는다. */
export function TopIcons() {
  const c = useColors();
  const router = useRouter();
  const count = useOpenGrants().items.length;
  const press = ({ pressed }: { pressed: boolean }) => ({ width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const, opacity: pressed ? 0.6 : 1 });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable testID="nav-me" accessibilityRole="button" accessibilityLabel="내 정보" onPress={() => router.push('/account' as never)} style={press}>
        <Feather name="user" size={24} color={c.foreground} />
      </Pressable>
      <Pressable testID="nav-alerts" accessibilityRole="button" accessibilityLabel={`알림. 지금 신청 가능 ${count}건`} onPress={() => router.push('/alerts' as never)} style={press}>
        <Feather name="bell" size={24} color={c.foreground} />
        {count > 0 ? (
          <View style={{ position: 'absolute', top: 3, right: 0, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.destructive, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c.background }}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '800', ...(Platform.OS === 'web' ? { fontFamily: 'Pretendard, sans-serif' } : { fontFamily: 'Pretendard-ExtraBold', fontWeight: 'normal' as const }) }}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
