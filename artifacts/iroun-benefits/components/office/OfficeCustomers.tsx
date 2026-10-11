import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, Empty, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { CustomerMatches } from './OfficeRequests';
import type { OfficeProps } from './shared';

/** 고객 이름을 누르면 지금 가능한 지원금·환급금과 올해 지나간 공고를 함께 보여준다. */
export function OfficeCustomers({ o }: OfficeProps) {
  const c = useColors();
  const [open, setOpen] = useState<string | null>(null);
  const list = o.customers.filter((x) => x.role === 'customer' || x.role === 'user');
  if (list.length === 0) return <Empty icon="users" title="고객이 없어요" body={o.admin ? '가입한 고객이 여기에 나타나요.' : '배정된 고객이 여기에 나타나요.'} />;
  return (
    <>
      {list.map((u) => {
        const b = u.profile?.businesses?.[0];
        const on = open === u.id;
        return (
          <Card key={u.id}>
            <Pressable testID={`office-customer-${u.id}`} accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : u.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <View style={{ flex: 1 }}>
                <T v="h3">{u.name || '이름 미확인'}{b?.name ? ` · ${b.name}` : ''}</T>
                <T v="small" color={c.mutedForeground}>{[u.phone, b?.industry, b?.province, b?.revenue].filter(Boolean).join(' · ') || '입력한 정보 없음'}</T>
              </View>
              <Feather name={on ? 'chevron-up' : 'chevron-down'} size={20} color={c.mutedForeground} />
            </Pressable>
            {on ? (
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
                <T v="label">지금 가능한 지원금·환급금</T>
                <CustomerMatches userId={u.id} period="current" />
                <T v="label">올해 지나간 공고 (당시 조건 확인 필요)</T>
                <CustomerMatches userId={u.id} period="past" />
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
