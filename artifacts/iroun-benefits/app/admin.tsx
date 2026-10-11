import React, { useState } from 'react';
import { extractAdminNotice, runOfficialFeed,runPublicOfficialFeed, type NoticeExtraction } from '@workspace/api-client-react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  createAdminBenefit, getGetAdminDashboardQueryKey, processAdminDeletion, updateAdminBenefit, updateAdminGrant,
  useGetAdminDashboard, BenefitAudience, BenefitBudgetStatus, BenefitKind, BenefitReviewStatus, BenefitStatus,
  type Account, type Benefit, type Rule,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { confirmAsk } from '@/lib/confirm';
import { apiErrorMessage } from '@/lib/text';
import { errStatus, newId } from '@/lib/util';
import { Badge, Btn, Card, Chip, Empty, ErrorState, Field, Loading, Notice, Page, Section, T, Toggle, Wrap } from '@/components/ui';

type Tab = 'benefits' | 'users' | 'audit' | 'deletions' | 'connections';
const TABS: [Tab, string][] = [['benefits', '공지·규칙'], ['users', '고객·이용권'], ['audit', '감사 기록'], ['deletions', '삭제 요청'], ['connections', '연결 상태']];
const vals = <O extends Record<string, string>>(o: O) => Object.values(o) as string[];

function blank(): Benefit {
  return { id: newId(), title: '', kind: '지원금', audience: '사업', category: '', region: '전국', agency: '', sourceUrl: '', sourceId: '', summary: '', support: '', calculation: '', checks: [], documents: [], startsAt: '', endsAt: '', checkedAt: new Date().toISOString().slice(0, 10), budgetStatus: '확인 필요', status: '확인 필요', reviewStatus: '검토대기', isTest: false, rules: [] };
}
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

const KO: Record<string, string> = {
  id: '번호', userId: '계정 번호', actor: '처리한 사람', actorId: '처리한 사람', action: '작업', target: '대상', targetId: '대상 번호', reason: '사유',
  createdAt: '기록 시각', at: '시각', status: '상태', name: '이름', state: '상태', message: '안내', requestedAt: '요청 시각', processedAt: '처리 시각',
  configured: '설정 완료 여부', provider: '연동 대상', detail: '상세', details: '상세', expiresAt: '만료 시각', error: '오류', ok: '정상 여부', service: '서비스',
  publishedDefaultDailyMaximum: '기관 기본 안내 한도 (계정 승인 아님)', approvedDailyMaximum: '계정별 승인 한도', configuredDailyLimit: '앱에 설정한 일일 호출 제한', quotaNotice: '한도와 개발 실행 안내',
  scheduleReady: '주기수집 실행 조건 충족 여부',
  updatedAt: '수정 시각', checkedAt: '확인 시각', type: '종류',
};
const koVal = (v: unknown) => (typeof v === 'boolean' ? (v ? '예' : '아니오') : typeof v === 'string' ? v : v === null || v === undefined ? '없음' : JSON.stringify(v));
function KV({ item }: { item: Record<string, unknown> }) {
  const c = useColors();
  return (
    <Card>
      {Object.entries(item).map(([k, v]) => (
        <T key={k} v="small"><T v="small" color={c.mutedForeground}>{KO[k] ?? '기타 정보'}: </T>{koVal(v)}</T>
      ))}
    </Card>
  );
}

function Select({ label, value, options, onChange, optionLabels }: { label: string; value: string; options: string[]; onChange: (v: string) => void; optionLabels?:Record<string,string> }) {
  return (
    <View style={{ gap: 8 }}>
      <T v="label">{label}</T>
      <Wrap>{options.map((o) => <Chip key={o} label={optionLabels?.[o] || o} selected={value === o} onPress={() => onChange(o)} />)}</Wrap>
    </View>
  );
}

/** 자동 정리 결과: 무엇을 읽었고 원문 어느 문장이 근거인지 보여준다. */
function ExtractionBox({ x }: { x: { confidence: number; evidence: { field: string; label: string; quote: string }[]; missing: string[]; cautions: string[] } }) {
  const c = useColors();
  return (
    <View testID="adm-extraction" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Badge label={`찾은 항목 ${x.confidence}%`} tone={x.confidence >= 80 ? 'ok' : x.confidence >= 50 ? 'info' : 'warn'} />
        {x.cautions.length ? <Badge label={`주의 ${x.cautions.length}`} tone="warn" /> : null}
      </View>
      {x.evidence.map((e, i) => (
        <View key={i} style={{ gap: 2 }}>
          <T v="label">{e.label}</T>
          <T v="small" color={c.mutedForeground}>“{e.quote}”</T>
        </View>
      ))}
      {x.missing.length ? <T v="small" color={c.warning}>못 찾음: {x.missing.join(', ')}</T> : null}
      {x.cautions.map((s, i) => <T key={`c${i}`} v="small" color={c.warning}>주의: {s}</T>)}
    </View>
  );
}

function BenefitForm({ initial, isNew, onDone }: { initial: Benefit; isNew: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [b, setB] = useState<Benefit>(initial);
  const [checks, setChecks] = useState(initial.checks.join('\n'));
  const [docs, setDocs] = useState(initial.documents.join('\n'));
  const [rules, setRules] = useState<{ scope: string; field: string; operator: string; value: string; label: string }[]>(
    initial.rules.map((r) => ({ scope: r.scope, field: r.field, operator: r.operator, value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value), label: r.label })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [found, setFound] = useState<NoticeExtraction | null>(null);
  const [reading, setReading] = useState(false);
  // 원문을 붙여 넣으면 서버가 지역·조건·금액·서류를 뽑아 아래 칸을 채운다. 이미 적어 둔 값은 바꾸지 않는다.
  const autoFill = async () => {
    setReading(true); setErr(null);
    try {
      const x = await extractAdminNotice({ title: b.title, text: raw });
      setFound(x);
      setB((p) => ({
        ...p,
        region: x.region && (!p.region || p.region === '전국' || p.region === '관할 확인 필요') ? x.region : p.region,
        maxAmount: p.maxAmount ?? x.maxAmount, startsAt: p.startsAt || x.startsAt || '', endsAt: p.endsAt || x.endsAt || '',
        status: p.status === '확인 필요' && x.status ? x.status : p.status,
        budgetStatus: p.budgetStatus === '확인 필요' && x.endsAt ? x.budgetStatus : p.budgetStatus,
        extraction: { confidence: x.confidence, evidence: x.evidence, missing: x.missing, cautions: x.cautions, at: new Date().toISOString() },
      }));
      if (!docs.trim() && x.documents.length) setDocs(x.documents.join('\n'));
      const have = new Set(rules.map((r) => `${r.scope}.${r.field}`));
      setRules([...rules, ...x.rules.filter((r) => !have.has(`${r.scope}.${r.field}`)).map((r) => ({ scope: r.scope, field: r.field, operator: r.operator, value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value), label: r.label }))]);
    } catch (e) { setErr(apiErrorMessage(e)); }
    setReading(false);
  };
  const set = <K extends keyof Benefit>(k: K, v: Benefit[K]) => setB((p) => ({ ...p, [k]: v }));
  const parseVal = (s: string,op:string): unknown => {
    if(op==='in'&&!s.trim().startsWith('[')) return s.split(',').map(x=>x.trim()).filter(Boolean);
    try { return JSON.parse(s); } catch { return s; }
  };

  const save = async () => {
    if (!b.title.trim() || !b.sourceUrl.trim() || !b.agency.trim()) { setErr('제목, 제공 기관, 공식 출처 주소는 꼭 입력해야 합니다.'); return; }
    const body: Benefit = { ...b, checks: lines(checks), documents: lines(docs), rules: rules.map((r) => ({ scope: r.scope as Rule['scope'], field: r.field, operator: r.operator as Rule['operator'], value: parseVal(r.value,r.operator), label: r.label })) };
    setBusy(true); setErr(null);
    try {
      if (isNew) await createAdminBenefit(body); else await updateAdminBenefit(body.id, body);
      await qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
      onDone();
    } catch (e) { setErr(apiErrorMessage(e)); }
    setBusy(false);
  };
  return (
    <Card>
      <T v="h3">{isNew ? '새 공지 작성' : '공지 고치기'}</T>
      <Field label="제목" value={b.title} onChangeText={(v) => set('title', v)} testID="adm-title" />
      <Card tone="soft">
        <T v="label">공고 원문 붙여넣기</T>
        <Field label="원문" value={raw} onChangeText={setRaw} multiline maxLength={30000} testID="adm-raw" placeholder="지원대상, 지원내용, 신청기간, 제출서류가 적힌 부분을 붙여 넣으세요" />
        <Btn kind="secondary" label="자동 정리" icon="zap" loading={reading} disabled={raw.trim().length < 10} onPress={autoFill} testID="adm-extract" />
        {found ? <ExtractionBox x={found} /> : null}
      </Card>
      <Field label="제공 기관" value={b.agency} onChangeText={(v) => set('agency', v)} />
      <Field label="공식 출처 주소" value={b.sourceUrl} onChangeText={(v) => set('sourceUrl', v)} autoCapitalize="none" keyboardType="url" />
      <Field label="출처 식별 번호" value={b.sourceId} onChangeText={(v) => set('sourceId', v)} autoCapitalize="none" />
      <Field label="출처 확인일 (YYYY-MM-DD)" value={b.checkedAt} onChangeText={(v) => set('checkedAt', v)} autoCapitalize="none" />
      <Field label="분류" value={b.category} onChangeText={(v) => set('category', v)} />
      <Field label="지역" value={b.region} onChangeText={(v) => set('region', v)} testID="adm-region" />
      <Field label="최대 지원금액 (원, 원문에 있을 때만)" value={b.maxAmount ? String(b.maxAmount) : ''} onChangeText={(v) => { const n = parseInt(v.replace(/\D/g, ''), 10); setB((p) => { const { maxAmount: _m, ...rest } = p; return n > 0 ? { ...rest, maxAmount: n } : rest; }); }} keyboardType="number-pad" testID="adm-amount" />
      <Field label="요약" value={b.summary} onChangeText={(v) => set('summary', v)} multiline />
      <Field label="지원 내용" value={b.support} onChangeText={(v) => set('support', v)} multiline />
      <Field label="산정 방식" value={b.calculation} onChangeText={(v) => set('calculation', v)} multiline />
      <Field label="확인할 사항 (한 줄에 하나)" value={checks} onChangeText={setChecks} multiline />
      <Field label="필요 서류 (한 줄에 하나)" value={docs} onChangeText={setDocs} multiline />
      <Field label="시작일 (YYYY-MM-DD)" value={b.startsAt} onChangeText={(v) => set('startsAt', v)} autoCapitalize="none" />
      <Field label="마감일 (YYYY-MM-DD)" value={b.endsAt} onChangeText={(v) => set('endsAt', v)} autoCapitalize="none" />
      <Select label="종류" value={b.kind} options={vals(BenefitKind)} onChange={(v) => set('kind', v as Benefit['kind'])} />
      <Select label="대상" value={b.audience} options={vals(BenefitAudience)} onChange={(v) => set('audience', v as Benefit['audience'])} />
      <Select label="진행 상태 (마감 = 종료)" value={b.status} options={vals(BenefitStatus)} onChange={(v) => set('status', v as Benefit['status'])} />
      <Select label="예산 상태" value={b.budgetStatus} options={vals(BenefitBudgetStatus)} onChange={(v) => set('budgetStatus', v as Benefit['budgetStatus'])} />
      <Select label="공개 상태 (검토대기 / 공개 / 비공개)" value={b.reviewStatus} options={vals(BenefitReviewStatus)} onChange={(v) => set('reviewStatus', v as Benefit['reviewStatus'])} />
      <Toggle label="시험용 항목" desc="켜면 시험용 표시가 붙습니다." value={b.isTest} onChange={(v) => set('isTest', v)} />
      <T v="h3">조건 규칙</T>
      {rules.map((r, i) => (
        <Card key={i} tone="soft">
          <Select label="적용 대상" value={r.scope} options={['personal', 'business']} optionLabels={{personal:'개인·가구',business:'사업장'}} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, scope: v } : x)))} />
          <Select label="비교할 항목" value={r.field} options={['province','district','birthYear','age','income','household','children','housing','entity','industry','situation','openedAt','revenue','employees','duplicateBenefit','premises']} optionLabels={{province:'시·도',district:'시·군·구',birthYear:'출생연도',age:'만 나이',income:'소득구간',household:'가구원 수',children:'부양자녀 수',housing:'주거형태',entity:'사업자 형태',industry:'업종',situation:'사업 상황',openedAt:'개업일',revenue:'매출구간',employees:'직원 수',duplicateBenefit:'중복수혜'}} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, field: v } : x)))} />
          <Select label="비교 방식" value={r.operator} options={['eq', 'in', 'gte', 'lte', 'before', 'after']} optionLabels={{eq:'같음',in:'목록 중 하나',gte:'이상',lte:'이하',before:'이전 또는 당일',after:'이후 또는 당일'}} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, operator: v } : x)))} />
          <Field label="비교할 값 (목록은 쉼표로 구분)" value={r.value} onChangeText={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, value: v } : x)))} autoCapitalize="none" />
          <Field label="사용자에게 보일 설명" value={r.label} onChangeText={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
          <Btn kind="ghost" label="이 규칙 삭제" icon="trash-2" onPress={() => setRules(rules.filter((_, j) => j !== i))} />
        </Card>
      ))}
      <Btn kind="secondary" label="규칙 추가" icon="plus" onPress={() => setRules([...rules, { scope: 'business', field: '', operator: 'eq', value: '', label: '' }])} />
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Btn label="저장" icon="save" loading={busy} onPress={save} testID="adm-save" />
      <Btn kind="ghost" label="취소" onPress={onDone} />
    </Card>
  );
}

function UserCard({ u }: { u: Account }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const run = async (revoke: boolean) => {
    if (!reason.trim()) { setMsg({ t: 'error', s: '사유를 입력해 주세요.' }); return; }
    const date=new Date(`${expires}T00:00:00Z`);
    if (!revoke && (!/^\d{4}-\d{2}-\d{2}$/.test(expires)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==expires)) { setMsg({ t: 'error', s: '실제 있는 만료일을 YYYY-MM-DD 형식으로 입력해 주세요.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await updateAdminGrant(u.id, { reason: reason.trim(), expiresAt: expires ? new Date(`${expires}T23:59:59.999+09:00`).toISOString() : new Date().toISOString(), revoke });
      await qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
      setMsg({ t: 'ok', s: revoke ? '무상 이용권을 회수했습니다.' : '무상 이용권을 부여했습니다.' }); setReason('');
    } catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setBusy(false);
  };
  const e = u.entitlement;
  return (
    <Card>
      <T v="label" selectable>{u.displayName || u.id}</T>
      {u.email ? <T v="small">{u.email}</T> : null}
      <T v="small">{u.id} · {u.identityStatus || '인증 계정 정보 확인 필요'}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Badge label={`권한 ${u.role==='admin'?'관리자':'고객'}`} tone="muted" />
        <Badge label={e.active ? '이용 중' : '이용권 없음'} tone={e.active ? 'ok' : 'muted'} />
        <Badge label={e.subscriptionActive ? '구독 활성' : '구독 없음'} tone={e.subscriptionActive ? 'ok' : 'muted'} />
        <Badge label={e.grantActive ? '무상 이용권' : '무상 없음'} tone={e.grantActive ? 'info' : 'muted'} />
      </View>
      <T v="small">사업장 {u.profile.businesses.length}곳 · 맞춤 알림 {u.preferences.personalizedAlerts ? '켬' : '끔'}</T>
      <Btn kind="secondary" label={open ? '닫기' : '무상 이용권 관리'} onPress={() => setOpen(!open)} testID={`grant-open-${u.id}`} />
      {open ? (
        <>
          <Field label="사유 (감사 기록에 남습니다)" value={reason} onChangeText={setReason} multiline editable={!busy} />
          <Field label="만료일 (YYYY-MM-DD)" value={expires} onChangeText={setExpires} autoCapitalize="none" editable={!busy} />
          <Btn label="부여" icon="gift" loading={busy} onPress={() => run(false)} />
          <Btn kind="danger" label="회수" icon="slash" loading={busy} onPress={() => confirmAsk('이용권 회수', '이 계정의 무상 이용권을 회수합니다.', '회수', () => run(true))} />
          {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
        </>
      ) : null}
    </Card>
  );
}

export default function Admin() {
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const dash = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey(), enabled: acc.isSignedIn, retry: false } });
  const [tab, setTab] = useState<Tab>('benefits');
  const [editing, setEditing] = useState<{ b: Benefit; isNew: boolean } | null>(null);
  const [filter, setFilter] = useState('');
  const [dmsg, setDmsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!acc.isLoaded) return <Page back title="관리자"><Loading rows={1} /></Page>;
  if (!acc.isSignedIn) {
    return <Page back title="관리자"><Notice>관리자 화면은 로그인 후 사용할 수 있습니다.</Notice><Btn label="로그인" onPress={() => router.push({ pathname: '/auth', params: { next: '/admin' } })} /></Page>;
  }
  if (dash.isLoading) return <Page back title="관리자"><Loading /></Page>;
  if (dash.error) {
    const s = errStatus(dash.error);
    return (
      <Page back title="관리자">
        {s === 403 ? <Notice tone="error" title="접근할 수 없습니다">이 계정에는 관리자 권한이 없습니다.</Notice> : <ErrorState message={apiErrorMessage(dash.error)} onRetry={() => dash.refetch()} />}
      </Page>
    );
  }
  const d = dash.data;
  if (!d) return null;

  const quick = async (b: Benefit, patch: Partial<Benefit>) => {
    setBusy(b.id);
    try { await updateAdminBenefit(b.id, { ...b, ...patch }); await qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); }
    catch (e) { setDmsg(apiErrorMessage(e)); }
    setBusy(null);
  };
  const users = d.users.filter((u) => `${u.id} ${u.role} ${u.email || ''} ${u.displayName || ''}`.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <Page back title="관리자" subtitle="운영자 전용 화면입니다.">
      <Btn kind="secondary" label="회사 업무 열기" icon="briefcase" onPress={() => router.push('/office')} testID="admin-go-office" />
      <Wrap>{TABS.map(([k, l]) => <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} testID={`admin-tab-${k}`} />)}</Wrap>
      {dmsg ? <Notice tone="error">{dmsg}</Notice> : null}

      {tab === 'benefits' ? (
        editing ? <BenefitForm initial={editing.b} isNew={editing.isNew} onDone={() => setEditing(null)} /> : (
          <>
            <Btn label="새 공지 작성" icon="plus" onPress={() => setEditing({ b: blank(), isNew: true })} testID="adm-new" />
            {d.benefits.length === 0 ? <Empty icon="file-text" title="등록된 공지가 없습니다" body="새 공지를 작성하면 검토대기 상태로 저장됩니다." /> : d.benefits.map((b) => (
              <Card key={b.id}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Badge label={b.reviewStatus} tone={b.reviewStatus === '공개' ? 'ok' : b.reviewStatus === '비공개' ? 'muted' : 'warn'} />
                  <Badge label={b.status} tone={b.status === '마감' ? 'muted' : 'info'} />
                  <Badge label={`규칙 ${b.rules.length}개`} tone="muted" />
                  {b.extraction ? <Badge label={`자동 정리 ${b.extraction.confidence}%`} tone={b.extraction.confidence >= 80 && !b.extraction.cautions.length ? 'ok' : 'warn'} /> : null}
                </View>
                <T v="h3">{b.title}</T>
                <T v="small">{b.agency} · {b.sourceUrl}</T>
                {b.extraction && b.reviewStatus === '검토대기' ? <ExtractionBox x={b.extraction} /> : null}
                <Btn kind="secondary" label="고치기" icon="edit-2" onPress={() => setEditing({ b, isNew: false })} testID={`adm-edit-${b.id}`} />
                {b.reviewStatus !== '공개' ? <Btn label="공개로 전환" icon="eye" loading={busy === b.id} onPress={() => quick(b, { reviewStatus: '공개' })} /> : null}
                {b.reviewStatus === '공개' ? <Btn kind="secondary" label="비공개로 전환" icon="eye-off" loading={busy === b.id} onPress={() => quick(b, { reviewStatus: '비공개' })} /> : null}
                {b.reviewStatus !== '검토대기' ? <Btn kind="ghost" label="검토대기로 되돌리기" loading={busy === b.id} onPress={() => quick(b, { reviewStatus: '검토대기' })} /> : null}
                {b.status !== '마감' ? <Btn kind="ghost" label="신청 마감 처리" loading={busy === b.id} onPress={() => confirmAsk('마감 처리', '이 지원을 마감 상태로 바꿉니다.', '마감', () => quick(b, { status: '마감' }))} /> : null}
              </Card>
            ))}
          </>
        )
      ) : null}

      {tab === 'users' ? (
        <>
          <Field label="고객 검색 (이메일·이름·계정 번호)" value={filter} onChangeText={setFilter} autoCapitalize="none" testID="adm-user-search" />
          <T v="small">{users.length}명</T>
          {users.length === 0 ? <Empty icon="users" title="검색 결과가 없습니다" /> : users.map((u) => <UserCard key={u.id} u={u} />)}
        </>
      ) : null}

      {tab === 'audit' ? (d.audit.length === 0 ? <Empty icon="clipboard" title="감사 기록이 없습니다" /> : d.audit.map((a, i) => <KV key={i} item={a} />)) : null}

      {tab === 'deletions' ? (
        <>
          {d.deletions.length === 0 ? <Empty icon="user-x" title="처리할 삭제 요청이 없습니다" /> : d.deletions.map((x, i) => {
            const id = typeof x.id === 'string' ? x.id : typeof x.id === 'number' ? String(x.id) : null;
            return (
              <View key={i} style={{ gap: 8 }}>
                <KV item={x} />
                {id ? <Btn kind="danger" label="삭제 요청 처리" icon="check" loading={busy === id} onPress={() => confirmAsk('삭제 처리', '해당 계정 데이터를 삭제 처리합니다. 되돌릴 수 없습니다.', '처리', async () => {
                  setBusy(id);
                  try { await processAdminDeletion(id); await qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); setDmsg(null); } catch (e) { setDmsg(apiErrorMessage(e)); }
                  setBusy(null);
                })} /> : null}
              </View>
            );
          })}
        </>
      ) : null}

      {tab === 'connections' ? (
        <Section title="연결 상태">
          {(['gov24','welfareCentral','welfareLocal'] as const).map((source,i)=><Btn key={source} label={['정부24 공식 수집 확인','복지로 중앙부처 수집 확인','복지로 지자체 수집 확인'][i]!} onPress={async()=>{
            try{
              const r=await runPublicOfficialFeed({source});
              setDmsg(r.blocked===true?'미연결: 승인된 활용키·수집 설정 필요. 호출하지 않았습니다.':`공식 자료 ${r.staged??0}건 검토대기. 자동 공개하지 않았습니다.`);
              await qc.invalidateQueries({queryKey:getGetAdminDashboardQueryKey()});
            }catch(e){setDmsg(apiErrorMessage(e));}
          }}/>)}
          <Btn label="기업마당 공식 수집 확인" testID="adm-feed-run" onPress={async()=>{
            try{
              const r=await runOfficialFeed();
              const blocked=r.blocked===true;
              const limited=r.limited===true;
              const staged=typeof r.staged==="number"?r.staged:0;
              const reason=typeof r.reason==="string"?r.reason:"";
              setDmsg(blocked
                ?`수집 차단: ${reason||"운영자 승인·이용조건·인증키·범위 설정을 확인해 주세요."} 수집 완료가 아닙니다.`
                :`공식 자료 ${staged}건 검토대기. 자동 공개하지 않았습니다. ${limited?"페이지 한도에 도달해 추가 자료가 있을 수 있습니다. ":""}전국 수집 완료가 아닙니다.`);
              await qc.invalidateQueries({queryKey:getGetAdminDashboardQueryKey()});
            }catch(e){setDmsg(apiErrorMessage(e));}
          }}/>
          {d.connections.length === 0 ? <Empty icon="link" title="표시할 연결 정보가 없습니다" /> : d.connections.map((x, i) => <KV key={i} item={x} />)}
        </Section>
      ) : null}
      <Btn kind="secondary" label="새로고침" icon="refresh-cw" onPress={() => dash.refetch()} />
    </Page>
  );
}
