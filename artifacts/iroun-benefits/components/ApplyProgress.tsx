import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Btn, Card, Loading, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { kst, useServiceStateView, type SvcRequest } from '@/lib/service';

/**
 * 고객이 [신청할게요]를 누른 뒤 회사가 처리하는 단계.
 * 회사 업무 상태(서버 값)를 고객이 알아듣는 말로 바꿔 보여준다.
 */
export const APPLY_STEPS = ['접수', '자격 확인', '서류 준비', '기관 신청', '결과 확인'] as const;
const STEP_OF: Record<string, number> = {
  '회사 접수': 0, '자격 확인': 1, '자료 준비': 2, '공식 신청 안내': 3, '고객 확인': 4, '회사 지원 종료': 5,
};
const NOW_TEXT = [
  '회사가 받았어요\n곧 자격을 확인해요',
  '조건이 맞는지\n확인하고 있어요',
  '서류를 살펴보고\n신청 준비를 해요',
  '기관에 신청하고\n결과를 기다려요',
  '결과를 확인해요\n안내를 기다려 주세요',
  '회사 지원이\n끝났어요',
];
export const stepOf = (state: string) => STEP_OF[state] ?? 0;
export const isOngoing = (r: SvcRequest) => stepOf(r.state) < 5;

/** 다섯 단계 막대: 지난 단계는 채우고, 지금 단계는 강조한다. */
export function StepBar({ step }: { step: number }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {APPLY_STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? c.primary : c.border }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {APPLY_STEPS.map((s, i) => (
          <T key={s} v="small" style={{ flex: 1, textAlign: 'center', fontSize: 12 }} color={i === step ? c.primary : c.mutedForeground}>{s}</T>
        ))}
      </View>
    </View>
  );
}

function RequestCard({ r }: { r: SvcRequest }) {
  const c = useColors();
  const router = useRouter();
  const step = stepOf(r.state);
  const todo = r.customerTasks.length;
  return (
    <Pressable onPress={() => router.push('/company-progress')} accessibilityRole="button" testID={`apply-${r.id}`}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <T v="h3" style={{ flex: 1 }} numberOfLines={2}>{r.benefitTitle ?? r.snapshot?.title ?? '신청한 사업'}</T>
          <Feather name="chevron-right" size={20} color={c.mutedForeground} />
        </View>
        <StepBar step={Math.min(step, 4)} />
        <T>{NOW_TEXT[step]}</T>
        {todo > 0 && step < 5 ? <T color={c.warning}>내가 할 일 {todo}가지</T> : null}
        <T v="small" color={c.mutedForeground}>{kst(r.updatedAt ?? r.createdAt)} 변경</T>
      </Card>
    </Pressable>
  );
}

/** 내 정보 맨 위: 지금 진행 중인 신청 */
export function OngoingApplications() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading } = useServiceStateView();
  if (isLoading || !data) return <Loading rows={1} />;
  const ongoing = data.requests.filter(isOngoing);
  const done = data.requests.length - ongoing.length;
  if (ongoing.length === 0) {
    return (
      <Card tone="soft" style={{ gap: 6 }}>
        <T>진행 중인 신청이 없어요</T>
        <T v="small" color={c.mutedForeground}>{'[신청할게요]를 누르면\n여기서 진행을 볼 수 있어요'}</T>
        {done > 0 ? <Btn kind="ghost" label={`끝난 신청 ${done}건 보기`} onPress={() => router.push('/company-progress')} testID="apply-done" /> : null}
      </Card>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {ongoing.map((r) => <RequestCard key={r.id} r={r} />)}
      {done > 0 ? <Btn kind="ghost" label={`끝난 신청 ${done}건 보기`} onPress={() => router.push('/company-progress')} testID="apply-done" /> : null}
    </View>
  );
}
