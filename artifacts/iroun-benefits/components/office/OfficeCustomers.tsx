import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchOfficeDocument, listCustomerDocuments } from '@workspace/api-client-react';
import { apiErrorMessage } from '@/lib/text';
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
                {Object.keys(u.profile?.confirmations ?? {}).length ? (
                  <>
                    <T v="label">고객이 추가로 답한 조건</T>
                    {Object.entries(u.profile?.confirmations ?? {}).map(([k, v]) => <T key={k} v="small">• {v.label}: {v.answer}</T>)}
                  </>
                ) : null}
                <CustomerDocs userId={u.id} />
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

/** 고객이 올린 서류. 누르면 새 창에서 열린다(PC 화면 기준). 열람은 기록된다. */
function CustomerDocs({ userId }: { userId: string }) {
  const c = useColors();
  const q = useQuery({ queryKey: ['customer-documents', userId], queryFn: () => listCustomerDocuments(userId), staleTime: 5000 });
  const [msg, setMsg] = useState<string | null>(null);
  const docs = q.data?.documents ?? [];
  const view = async (id: string) => {
    try { const blob = await fetchOfficeDocument(id); if (Platform.OS === 'web') window.open(URL.createObjectURL(blob), '_blank'); else setMsg('서류 열람은 PC 화면에서 해 주세요.'); }
    catch (e) { setMsg(apiErrorMessage(e)); }
  };
  return (
    <>
      <T v="label">올린 서류 {docs.length}건</T>
      {q.isLoading ? <T v="small" color={c.mutedForeground}>불러오는 중…</T> : docs.length === 0 ? <T v="small" color={c.mutedForeground}>아직 올린 서류가 없어요</T> : docs.map((d) => (
        <Pressable key={d.id} testID={`office-doc-${d.name}`} accessibilityRole="button" accessibilityLabel={`${d.name} 열기`} onPress={() => view(d.id)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="file-text" size={18} color={c.primary} />
          <T v="small" style={{ flex: 1 }}>{d.name} · {d.filename}</T>
          <Feather name="external-link" size={16} color={c.mutedForeground} />
        </Pressable>
      ))}
      {msg ? <T v="small" color={c.mutedForeground}>{msg}</T> : null}
    </>
  );
}
