import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { createServiceRequest, getGetServiceStateQueryKey } from '@workspace/api-client-react';
import { Badge, Btn, Card, Chip, Empty, Notice, Page, T, Wrap, Field } from '@/components/ui';
import { Pending, AuthGate, NotGovernment, QueryProblem } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { confirmAsk } from '@/lib/confirm';
import { apiErrorMessage } from '@/lib/text';
import { MatchEntry, MatchItem, ServiceState, status, useMatchesView } from '@/lib/service';

function Body() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const thisYear = new Date(Date.now()+9*3600000).getUTCFullYear();
  const params = useLocalSearchParams<{ period?: string }>();
  const [period, setPeriod] = useState<'current' | 'past'>(params.period === 'past' ? 'past' : 'current');
  const [year, setYear] = useState(thisYear);
  const [businessScope,setBusinessScope]=useState('all');
  const [regionQuery,setRegionQuery]=useState('');
  const [industryQuery,setIndustryQuery]=useState('');
  const { acc, data, error, isLoading, refetch } = useMatchesView(period, year);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [fail, setFail] = useState<Record<string, { s: string; conflict: boolean }>>({});
  const lock = useRef(false);
  const visible=data?.items.flatMap(it=>{
    const region=(it.benefit.region??'').replace(/광역시|특별시|특별자치시|특별자치도/g,'');
    const rq=regionQuery.trim().replace(/광역시|특별시|특별자치시|특별자치도/g,'');
    if(rq&&region!=='전국'&&!region.includes(rq))return[];
    const rules=it.benefit.rules?.filter(r=>r.field==='industry')??[];
    if(industryQuery.trim()&&rules.length&&!rules.some(r=>String(JSON.stringify(r.value)??'').replace(/\s/g,'').includes(industryQuery.replace(/\s/g,''))))return[];
    const matches=it.matches.filter(m=>businessScope==='all'||(businessScope==='personal'?!m.businessId:m.businessId===businessScope));
    return matches.length?[{...it,matches}]:[];
  })??[];

  if (!acc.active) {
    return (
      <Card tone="soft">
        <T v="h3">맞춤 확인은 이용 중일 때 열립니다</T>
        <T>무료 공고 보기는 계속 쓸 수 있어요. 72시간 체험이나 계약 상태는 이용 상태 화면에서 확인하세요.</T>
        <Btn label="이용 상태 보기" icon="award" testID="svc-matches-access" onPress={() => router.push('/access')} />
        <Btn kind="secondary" label="전체 공고 보기" testID="svc-matches-all" onPress={() => router.push('/benefits')} />
      </Card>
    );
  }

  const request = (it: MatchItem, m: MatchEntry, kind: '신청 지원' | '자격 확인') => {
    const key = `${it.benefit.id}:${m.businessId}`;
    confirmAsk(kind === '신청 지원' ? '신청 지원을 요청할까요?' : '자격 확인을 요청할까요?', '회사 담당자가 확인 후 연락합니다. 공식 기관에 제출되는 것은 아닙니다.', '요청하기', async () => {
      if (lock.current) return;
      lock.current = true; setBusy(key);
      setFail((f) => { const n = { ...f }; delete n[key]; return n; });
      try {
        const res = (await createServiceRequest({ benefitId: it.benefit.id, businessId: m.businessId, kind, confirmed: true })) as unknown as Partial<ServiceState> & { id?: string };
        const found = res.requests?.find((r) => r.benefitId === it.benefit.id && r.businessId === m.businessId);
        setDone((d) => ({ ...d, [key]: found?.id ?? res.id ?? '' }));
        await qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() });
      } catch (e) {
        const conflict = status(e) === 409;
        setFail((f) => ({ ...f, [key]: { conflict, s: conflict ? '최신 확인 결과가 바뀌어 요청하지 못했습니다. 내 정보를 고치거나 문의로 알려 주세요.' : apiErrorMessage(e) } }));
        if (conflict) void refetch();
      }
      lock.current = false; setBusy(null);
    });
  };

  return (
    <>
      <Wrap>
        <Chip label="현재 공고" selected={period === 'current'} onPress={() => setPeriod('current')} testID="svc-period-current" />
        <Chip label="지난 공고" selected={period === 'past'} onPress={() => setPeriod('past')} testID="svc-period-past" />
      </Wrap>
      {period === 'past' ? (
        <Wrap>{[0, 1, 2].map((n) => <Chip key={n} label={n === 0 ? `올해(${thisYear}년)` : `${thisYear - n}년`} selected={year === thisYear - n} onPress={() => setYear(thisYear - n)} testID={`svc-year-${thisYear - n}`} />)}</Wrap>
      ) : null}
      {period === 'past' ? <Notice tone="warn" title="지난 공고는 참고용입니다">올해 같은 지원이 같은 조건으로 열린다는 뜻이 아닙니다. 신청 요청은 현재 공고에서만 할 수 있습니다.</Notice> : null}
      <Wrap><Chip label="모두" selected={businessScope==='all'} onPress={()=>setBusinessScope('all')} /><Chip label="개인·가구" selected={businessScope==='personal'} onPress={()=>setBusinessScope('personal')} />{acc.me?.profile.businesses.map(b=><Chip key={b.id} label={b.name||'내 사업장'} selected={businessScope===b.id} onPress={()=>setBusinessScope(b.id)} />)}</Wrap>
      <Field label="지역으로 좁혀보기" value={regionQuery} onChangeText={setRegionQuery} placeholder="예: 부산, 김해 — 전국 혜택도 함께 보여요" testID="svc-match-region" />
      <Field label="업종으로 좁혀보기" value={industryQuery} onChangeText={setIndustryQuery} placeholder="업종 제한이 없는 혜택도 함께 보여요" testID="svc-match-industry" />
      {error ? <QueryProblem error={error} next="/matches" onRetry={() => refetch()} forbidden="이용 기간이 끝났거나 권한이 없습니다. 이용 상태를 확인해 주세요." /> : isLoading || !data ? <Pending onRetry={() => refetch()} /> : visible.length === 0 ? (
        <Empty icon="search" title="맞는 공고가 아직 없어요" body="내 정보를 더 채우면 더 정확히 찾을 수 있어요." action={<Btn kind="secondary" label="내 정보 고치기" onPress={() => router.push('/onboarding')} testID="svc-matches-profile" />} />
      ) : visible.map((it) => (
        <Card key={it.benefit.id} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Badge label={it.closed ? '마감' : it.benefit.status} tone={it.closed ? 'muted' : it.benefit.status==='확인 필요'?'warn':'ok'} />
            {it.noticeYear ? <Badge label={`${it.noticeYear}년 공고`} tone="info" /> : null}
          </View>
          <T v="h3">{it.benefit.title}</T>
          {it.basis ? <T v="small" color={c.mutedForeground}>{it.basis}</T> : null}
          {it.closureBasis ? <T v="small" color={c.mutedForeground}>{it.closureBasis}</T> : null}
          {it.warning ? <Notice tone="warn">{it.warning}</Notice> : null}
          {it.matches.map((m) => {
            const key = `${it.benefit.id}:${m.businessId}`;
            const known = m.result === '조건 일치' && m.unknowns.length === 0 && m.exclusions.length === 0 && !(m.referenceExclusions?.length);
            const kind = known ? '신청 지원' : '자격 확인';
            return (
              <View key={key} style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
                <Badge label={m.result} tone={m.result === '조건 일치' ? 'ok' : 'warn'} />
                {m.reasons.map((r, i) => <T key={`r${i}`} v="small">{r}</T>)}
                {m.unknowns.length ? <T v="small" color={c.warning}>모르는 항목: {m.unknowns.join(', ')}</T> : null}
                {[...m.exclusions, ...(m.referenceExclusions ?? [])].map((r, i) => <T key={`x${i}`} v="small" color={c.destructive}>{r}</T>)}
                {done[key] !== undefined ? (
                  <Notice tone="ok" title="회사에 요청했습니다">{done[key] ? `접수번호 ${done[key]}. ` : ''}공식 기관 신청이 끝난 것은 아닙니다.</Notice>
                ) : (
                  <Btn label={it.closed ? '마감되어 요청할 수 없어요' : period === 'past' ? '지난 공고는 요청 불가' : kind === '신청 지원' ? '회사에 신청 지원 요청' : '자격 확인 문의하기'}
                    icon={kind === '신청 지원' ? 'send' : 'help-circle'} testID={`svc-request-${it.benefit.id}-${m.businessId}`}
                    disabled={it.closed || period === 'past'} loading={busy === key} onPress={() => request(it, m, kind)} />
                )}
                {fail[key] ? (
                  <View style={{ gap: 8 }}>
                    <Notice tone="error">{fail[key].s}</Notice>
                    {fail[key].conflict ? <Btn kind="secondary" label="내 정보 고치기" onPress={() => router.push('/onboarding')} testID={`svc-fix-${key}`} /> : null}
                    <Btn kind="secondary" label="문의로 알리기" onPress={() => router.push('/inquiries')} testID={`svc-ask-${key}`} />
                  </View>
                ) : null}
              </View>
            );
          })}
          <Btn kind="ghost" label="공고 자세히 보기" icon="chevron-right" onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: it.benefit.id } })} testID={`svc-open-${it.benefit.id}`} />
        </Card>
      ))}
    </>
  );
}

export default function Matches() {
  return (
    <Page back title="맞춤 공고" subtitle="내 조건과 맞는 공고를 보여드려요.">
      <NotGovernment />
      <AuthGate next="/matches"><Body /></AuthGate>
    </Page>
  );
}
