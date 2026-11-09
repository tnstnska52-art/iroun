import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Btn, Card, Empty, Loading, Notice, Page, Section, T } from '@/components/ui';
import { Pending, AuthGate, ContactButtons, NotGovernment, QueryProblem, ServiceLinks } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { kst, useServiceStateView } from '@/lib/service';
import { isOngoing, StepBar, stepOf } from '@/components/ApplyProgress';

function Body() {
  const c = useColors();
  const router = useRouter();
  const { acc, data, error, isLoading, refetch } = useServiceStateView();
  if (error) return <QueryProblem error={error} next="/company-progress" onRetry={() => refetch()} />;
  if (isLoading || !data) return <Pending onRetry={() => refetch()} />;
  return (
    <>
      <Notice tone="info" title="회사가 돕는 진행이에요">{'기관의 선정·지급 결과는\n따로 알려 드려요'}</Notice>
      {data.requests.length === 0 ? (
        <Empty icon="clipboard" title="회사에 보낸 요청이 없어요" body="맞춤 공고에서 신청 지원이나 자격 확인을 요청할 수 있어요." action={<Btn label="맞춤 공고 보기" onPress={() => router.push('/matches')} testID="svc-progress-matches" />} />
      ) : [...data.requests].sort((a, b) => Number(!isOngoing(a)) - Number(!isOngoing(b))).map((r) => (
        <Card key={r.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Badge label={r.state} tone="info" /><Badge label={r.kind} tone="muted" />
          </View>
          <T v="h3">{r.benefitTitle ?? r.snapshot?.title ?? '접수한 공고'}</T>
          <StepBar step={Math.min(stepOf(r.state), 4)} />
          <T v="small" color={c.mutedForeground}>접수번호 {r.id} · {kst(r.createdAt)}</T>
          <T v="small" color={c.mutedForeground}>마지막 변경 {kst(r.updatedAt ?? r.createdAt)}</T>
          {!acc.active ? <T v="small" color={c.warning}>새 맞춤 판정은 잠겨 있어요. 이미 접수한 기록과 담당자 연락은 계속 확인할 수 있어요.</T> : null}
          <T v="label">내가 할 일</T>
          {r.customerTasks.length === 0 && r.completedTasks.length === 0 ? <T v="small" color={c.mutedForeground}>지금 할 일이 없어요.</T> : null}
          {r.customerTasks.map((t, i) => <T key={`t${i}`}>• {t}</T>)}
          {r.completedTasks.map((t, i) => <T key={`d${i}`} color={c.success}>완료: {t}</T>)}
          <T v="label">담당자 연락</T>
          {r.contact ? (
            <View style={{ gap: 8 }}>
              {r.contact.name ? <T>{r.contact.name} 담당자</T> : null}
              <ContactButtons phone={r.contact.phone} kakao={r.contact.kakao} prefix={`svc-contact-${r.id}`} />
            </View>
          ) : <T v="small" color={c.mutedForeground}>아직 담당자가 정해지지 않았어요. 회사 연락처를 이용해 주세요.</T>}
        </Card>
      ))}
      <Section title="회사 연락처"><Card><ContactButtons phone={data.company?.phone} kakao={data.company?.kakao} prefix="svc-progress-company" /></Card></Section>
      <ServiceLinks current="/company-progress" />
    </>
  );
}

export default function CompanyProgress() {
  return (
    <Page back title="진행 중인 신청" subtitle="회사가 도와드리는 진행 상황이에요.">
      <NotGovernment />
      <AuthGate next="/company-progress"><Body /></AuthGate>
    </Page>
  );
}
