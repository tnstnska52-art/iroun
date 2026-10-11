import React, { useState } from 'react';
import { View } from 'react-native';
import { updateOfficeRequest, useGetOfficeCustomerMatches } from '@workspace/api-client-react';
import { Badge, Btn, Card, Chip, Empty, Field, Loading, Notice, T, Wrap } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { errStatus } from '@/lib/util';
import { kst, lines, MatchesPayload, OfficeRequest, REQUEST_STATES } from '@/lib/service';
import type { OfficeProps } from './shared';

export function CustomerMatches({ userId, period = 'current' }: { userId: string; period?: 'current' | 'past' }) {
  const c = useColors();
  const q = useGetOfficeCustomerMatches(userId, { period }, { query: { queryKey: ['/api/office/customers', userId, 'matches', period], retry: false, gcTime: 0 } });
  if (q.isLoading) return <Loading rows={1} />;
  if (q.error) {
    return <Notice tone="error">{errStatus(q.error) === 403 ? '이 고객의 이용 기간이 끝나 맞춤 결과를 볼 수 없습니다. 고객이 다시 체험하거나 계약해야 합니다.' : apiErrorMessage(q.error)}</Notice>;
  }
  const d = q.data as unknown as MatchesPayload | undefined;
  const items = (d?.items ?? []).filter((i) => (period === 'past' ? i.matches.some((m) => !(m.referenceExclusions?.length)) : i.matches.some((m) => m.result !== '대상 제외')));
  if (items.length === 0) return <T v="small" color={c.mutedForeground}>{period === 'past' ? '올해 지나간 공고 중 맞았던 것이 없어요.' : '지금 맞는 공고가 없어요.'}</T>;
  return <View style={{ gap: 6 }}>{items.map((i) => <T key={i.benefit.id} v="small">• {i.benefit.title} — {period === 'past' ? `${i.benefit.endsAt || ''} 마감` : i.matches.map((m) => m.result).join(', ')}{i.benefit.maxAmount ? ` · 공고상 최대 ${Math.round(i.benefit.maxAmount / 10000).toLocaleString('ko-KR')}만원` : ''}</T>)}</View>;
}

function Detail({ r }: { r: OfficeRequest }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const s = r.snapshot;
  const L = ({ t, a }: { t: string; a?: string[] }) => (a && a.length ? <View style={{ gap: 2 }}><T v="label">{t}</T>{a.map((x, i) => <T key={i} v="small">• {x}</T>)}</View> : null);
  return (
    <View style={{ gap: 8 }}>
      <Btn kind="secondary" label={open ? '공고 판정 접기' : '공고 판정·원문 정보 펼치기'} icon={open ? 'chevron-up' : 'chevron-down'} onPress={() => setOpen(!open)} testID={`office-req-${r.id}-expand`} />
      {open ? (!s ? <T v="small" color={c.mutedForeground}>저장된 공고 정보가 없습니다.</T> : (
        <View style={{ gap: 10 }}>
          {s.decision?.result ? <T v="label">판정: {s.decision.result}</T> : null}
          <L t="일치 사유" a={s.decision?.reasons} /><L t="모르는 항목" a={s.decision?.unknowns} /><L t="제외 사유" a={s.decision?.exclusions} />
          <L t="서류" a={s.documents} /><L t="확인할 것" a={s.checks} />
          {s.endsAt ? <T v="small">마감: {kst(s.endsAt)}</T> : null}
          {s.checkedAt ? <T v="small">공식 확인 시각: {kst(s.checkedAt)}</T> : null}
          {s.sourceUrl ? <T v="small" selectable>공식 원문: {s.sourceUrl}</T> : <T v="small" color={c.warning}>공식 원문 주소가 없습니다. 발급처와 절차는 원문 없이 안내하지 마세요.</T>}
          <L t="주의사항" a={[...(s.cautions ?? []), ...(s.caution ? [s.caution] : []), ...(s.warning ? [s.warning] : [])]} />
        </View>
      )) : null}
    </View>
  );
}

function Row({ r, o, refresh }: { r: OfficeRequest } & OfficeProps) {
  const c = useColors();
  const [state, setState] = useState(r.state);
  const [assigned, setAssigned] = useState<string | null>(r.assigned_to);
  const [cust, setCust] = useState(r.customer_tasks.join('\n'));
  const [staffT, setStaffT] = useState(r.staff_tasks.join('\n'));
  const [doneT, setDoneT] = useState(r.completed_tasks.join('\n'));
  const [note, setNote] = useState(r.internal_note ?? '');
  const [busy, setBusy] = useState(false);
  const [showM, setShowM] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const customer = o.customers.find((x) => x.id === r.user_id);
  const pname = [customer?.name, customer?.profile?.businesses?.[0]?.name].filter(Boolean).join(' · ') || '이름 미확인';
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await updateOfficeRequest(r.id, {
        ...(o.admin ? { assignedTo: assigned } : {}), state, internalNote: note,
        customerTasks: lines(cust), staffTasks: lines(staffT), completedTasks: lines(doneT),
      });
      await refresh(); setMsg({ t: 'ok', s: '저장했습니다.' });
    } catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setBusy(false);
  };
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Badge label={r.state} tone="info" /><Badge label={r.kind} tone="muted" /></View>
      <T v="h3">{r.snapshot?.title ?? r.benefit_id}</T>
      <T v="small" color={c.mutedForeground}>접수번호 {r.id} · 고객 {pname}{customer?.phone ? ` (${customer.phone})` : ''} · 담당 {r.staff_name ?? '미지정'}</T>
      <Notice tone="warn">서류와 발급처는 공고 원문으로 다시 확인해야 합니다. 상태는 회사 안의 진행이며 기관 신청 완료가 아닙니다.</Notice>
      <Detail r={r} />
      <T v="label">진행 상태</T>
      <Wrap>{REQUEST_STATES.map((s) => <Chip key={s} label={s} selected={state === s} onPress={() => setState(s)} testID={`office-req-${r.id}-state-${s}`} />)}</Wrap>
      {o.admin ? (
        <>
          <T v="label">담당 직원</T>
          <Wrap>
            <Chip label="지정 안 함" selected={assigned === null} onPress={() => setAssigned(null)} testID={`office-req-${r.id}-unassign`} />
            {o.staff.filter((s) => s.enabled).map((s) => <Chip key={s.user_id} label={s.name} selected={assigned === s.user_id} onPress={() => setAssigned(s.user_id)} testID={`office-req-${r.id}-assign-${s.user_id}`} />)}
          </Wrap>
        </>
      ) : null}
      <Field label="고객 할일 (한 줄에 하나)" multiline value={cust} onChangeText={setCust} testID={`office-req-${r.id}-customer`} />
      <Field label="직원 체크리스트 (한 줄에 하나)" multiline value={staffT} onChangeText={setStaffT} testID={`office-req-${r.id}-staff`} />
      <Field label="완료한 일 (한 줄에 하나)" multiline value={doneT} onChangeText={setDoneT} testID={`office-req-${r.id}-done`} />
      <Field label="내부 메모 (고객에게 보이지 않음)" multiline value={note} onChangeText={setNote} testID={`office-req-${r.id}-note`} />
      {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
      <Btn label="저장하기" icon="save" loading={busy} onPress={save} testID={`office-req-${r.id}-save`} />
      <Btn kind="secondary" label={showM ? '고객 맞춤 닫기' : '고객 맞춤 결과 보기'} icon="eye" onPress={() => setShowM(!showM)} testID={`office-req-${r.id}-matches`} />
      {showM ? <CustomerMatches userId={r.user_id} /> : null}
    </Card>
  );
}

export function OfficeRequests(p: OfficeProps) {
  if (p.o.requests.length === 0) return <Empty icon="clipboard" title="접수된 요청이 없습니다" body={p.o.admin ? '고객이 요청하면 이곳에 나타납니다.' : '배정된 요청이 없습니다.'} />;
  return <>{p.o.requests.map((r) => <Row key={r.id} r={r} {...p} />)}</>;
}
