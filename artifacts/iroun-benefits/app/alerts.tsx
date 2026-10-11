import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, getListBenefitsQueryKey, savePreferences, useListBenefits } from '@workspace/api-client-react';
import { Disclaimer, ErrorState, Loading, Page, T, Toggle } from '@/components/ui';
import { GrantList, GrantRow, useJoinHref } from '@/components/GrantList';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { useAccount } from '@/lib/session';
import { useServiceStateView } from '@/lib/service';
import { registerNativeNotifications } from '@/lib/native-notifications';
import { daysLeft } from '@/lib/util';
import { estimate, hasConditions, useDraftProfile } from '@/lib/estimate';

/** 지금 신청할 수 있는 지원금·환급금. 홈 종 아이콘의 숫자와 이 화면의 목록은 같은 계산을 쓴다. */
export function useOpenGrants() {
  const acc = useAccount();
  const svc = useServiceStateView();
  const [focus, setFocus] = useState(0);
  useFocusEffect(useCallback(() => { setFocus((n) => n + 1); }, []));
  const draft = useDraftProfile(acc.me?.id ?? null, focus);
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const list = benefits.data ?? [];
  const expired = acc.isSignedIn && !acc.active && !!svc.data?.trialUsed;
  const profile = expired ? null : hasConditions(acc.me?.profile) ? acc.me!.profile : hasConditions(draft) ? draft : null;
  const items = profile
    ? estimate(list, profile).items
    : list.filter((b) => b.status !== '마감' && (daysLeft(b.endsAt) ?? 0) >= 0).map((b) => ({ benefit: b, result: '추가 확인 필요' as const }));
  return { acc, benefits, items, matched: !!profile };
}

/** 알림: 맨 위에서 알림을 켜고 끄고, 아래에 지금 신청할 수 있는 지원금·환급금이 모두 나온다. */
export default function Alerts() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const join = useJoinHref();
  const { acc, benefits, items, matched } = useOpenGrants();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const on = !!acc.me?.preferences.notifications;

  const toggle = async (v: boolean) => {
    if (!acc.me) { router.push(join); return; }
    setSaving(true); setNote(null);
    try {
      await savePreferences({ ...acc.me.preferences, notifications: v, personalizedAlerts: v && acc.active });
      if (v && acc.active) await registerNativeNotifications().catch(() => undefined);
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e) { setNote(apiErrorMessage(e)); }
    setSaving(false);
  };

  return (
    <Page back title="알림">
      <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16, paddingVertical: 6 }}>
        <Toggle testID="alerts-toggle" label="새 지원금 알림" desc={acc.me ? (on ? '켜져 있어요' : '꺼져 있어요') : '가입하면 받을 수 있어요'} value={on} onChange={toggle} disabled={saving} />
      </View>
      {note ? <T v="small" color={c.destructive}>{note}</T> : null}

      {benefits.isLoading || (acc.isSignedIn && acc.loading) ? <Loading /> : benefits.error ? <ErrorState message={apiErrorMessage(benefits.error)} onRetry={() => benefits.refetch()} /> : (
        <>
          <T v="h2" testID="alerts-count">지금 신청 가능 {items.length}건</T>
          {items.length === 0 ? (
            <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 20 }}><T color={c.mutedForeground}>새 공고가 뜨면 알려드릴게요</T></View>
          ) : matched ? <GrantList items={items} unlocked={acc.active} /> : (
            <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
              {items.map((x, i) => <GrantRow key={x.benefit.id} item={x} last={i === items.length - 1} />)}
            </View>
          )}
        </>
      )}
      <Disclaimer />
    </Page>
  );
}
