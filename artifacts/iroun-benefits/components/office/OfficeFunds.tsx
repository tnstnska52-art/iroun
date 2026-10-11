import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFundLeads, updateFundLead, type FundLeadRow } from '@workspace/api-client-react';
import { Badge, Btn, Card, Chip, Empty, ErrorState, Field, Loading, T, Wrap } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { fmtDate } from '@/lib/util';

const STATES = ['접수됨', '연락 중', '안내 완료', '종료'];
const KEY = ['fund-leads'];
const tel = (d: string) => (d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d);

/** 정책자금 진단 요청 목록. 신용·대출 정보가 있으므로 관리자와 직원만 본다. */
export function OfficeFunds() {
  const q = useQuery({ queryKey: KEY, queryFn: () => getFundLeads(), staleTime: 5000 });
  if (q.isLoading) return <Loading rows={2} />;
  if (q.error) return <ErrorState message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} />;
  const leads = q.data?.leads ?? [];
  if (!leads.length) return <Empty icon="dollar-sign" title="정책자금 진단 요청이 없습니다" body="고객이 요청하면 여기에 나옵니다." />;
  return <>{leads.map((l) => <Lead key={l.id} l={l} />)}</>;
}

function Lead({ l }: { l: FundLeadRow }) {
  const c = useColors();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(l.state);
  const [memo, setMemo] = useState(l.memo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const a = l.answers;
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await updateFundLead(l.id, { state, memo }); await qc.invalidateQueries({ queryKey: KEY }); setMsg('저장했습니다.'); } catch (e) { setMsg(apiErrorMessage(e)); }
    setBusy(false);
  };
  const row = (k: string, v: string) => <T v="small"><T v="small" color={c.mutedForeground}>{k}  </T>{v}</T>;
  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Badge label={l.state} tone={l.state === '접수됨' ? 'warn' : l.state === '안내 완료' ? 'ok' : 'muted'} />
        <Badge label={fmtDate(l.created_at)} tone="muted" />
      </View>
      <T v="h3">{l.business_name} · {l.name}</T>
      <T selectable>{tel(l.phone)}</T>
      <Btn kind="secondary" icon="phone" label="전화 걸기" onPress={() => Linking.openURL(`tel:${l.phone}`)} />
      <Btn kind="ghost" label={open ? '접기' : '답변 내용 보기'} onPress={() => setOpen(!open)} testID={`fund-lead-open-${l.id}`} />
      {open ? (
        <View style={{ gap: 4 }}>
          {row('형태', `${a.entity} · ${a.industry}`)}
          {row('개업', `${a.openedYear <= 2009 ? '2009년 이전' : `${a.openedYear}년`} ${a.openedMonth}월`)}
          {row('지역', `${a.province} ${a.district}`)}
          {a.revenue.map((r) => <React.Fragment key={r.year}>{row(`${r.year}년 매출`, r.band)}</React.Fragment>)}
          {row('신용점수', `KCB ${a.creditKcb} · NICE ${a.creditNice}`)}
          {row('대출', a.loans.length ? a.loans.map((x) => `${x.lender} ${x.amount}`).join(', ') : '없음')}
          {row('연체·사고·체납', a.issues.length ? a.issues.join(', ') : '해당 없음')}
          {row('사업장', `${a.premises} · ${a.premisesValue}`)}
          {row('자택', `${a.home} · ${a.homeValue}`)}
          <T v="label" style={{ marginTop: 8 }}>진행 상태</T>
          <Wrap>{STATES.map((s) => <Chip key={s} label={s} selected={state === s} onPress={() => setState(s)} />)}</Wrap>
          <Field label="메모 (직원만 봄)" value={memo} onChangeText={setMemo} multiline maxLength={2000} />
          <Btn label="저장" loading={busy} onPress={save} />
          {msg ? <T v="small" color={c.mutedForeground}>{msg}</T> : null}
        </View>
      ) : null}
    </Card>
  );
}
