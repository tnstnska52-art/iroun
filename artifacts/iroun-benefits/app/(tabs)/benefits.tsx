import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getListBenefitsQueryKey, useListBenefits, type Benefit, type ListBenefitsParams } from '@workspace/api-client-react';
import { keepPreviousData } from '@tanstack/react-query';
import { BenefitCard } from '@/components/BenefitCard';
import { Btn, Chip, Empty, ErrorState, Field, Loading, Notice, Page, T, Wrap, Disclaimer } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { useAccount } from '@/lib/session';
import { useMatchesView } from '@/lib/service';
import { endTime } from '@/lib/util';

const AUDIENCES = ['사업', '개인', '가구'];
const KINDS = ['지원금', '환급금'];
const STATUSES = ['접수 중', '상시 조회', '확인 필요', '마감'];
type Period = 'current' | 'past' | 'all';
type Sort = 'latest' | 'deadline' | 'recommended';
interface Filters { search: string; region: string; audience?: string; status?: string; category?: string; kind?: string; period: Period; sort: Sort }
const EMPTY: Filters = { search: '', region: '', period: 'current', sort: 'latest' };
// 탭을 오가거나 상세에서 돌아와도 조건이 유지되도록 화면 밖에 보관한다.
let saved: Filters = EMPTY;

const t = (s?: string) => { const n = s ? new Date(s).getTime() : NaN; return isNaN(n) ? null : n; };
const isPast = (b: Benefit) => b.status === '마감' || ((endTime(b.endsAt) ?? Infinity) < Date.now());

export default function BenefitsScreen() {
  const c = useColors();
  const p = useLocalSearchParams<{ status?: string; sort?: string; kind?: string }>();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [f, setF] = useState<Filters>(saved);
  const account = useAccount();
  const currentMatches = useMatchesView('current',undefined,f.sort==='recommended' && f.period!=='past');
  const pastMatches = useMatchesView('past',undefined,f.sort==='recommended' && f.period!=='current');
  const ranks = useMemo(()=>new Map(
    [...(currentMatches.data?.items??[]),...(pastMatches.data?.items??[])].map(item=>[
      item.benefit.id,Math.max(-1,...item.matches.map(m=>m.result==='조건 일치'?2:m.result==='추가 확인 필요'?1:0))
    ])
  ),[currentMatches.data,pastMatches.data]);
  const set = (patch: Partial<Filters>) => setF((x) => { const n = { ...x, ...patch }; saved = n; return n; });
  useEffect(()=>{if(!account.active && f.sort==='recommended')set({sort:'latest'});},[account.active,f.sort]);
  const [q, setQ] = useState(f.search.trim());
  const [r, setR] = useState(f.region.trim());

  useEffect(() => {
    if (p.status || p.sort || p.kind) set({ ...(p.status ? { status: p.status, period: p.status === '마감' ? 'past' : 'current' } : {}), ...(p.sort === 'deadline' ? { sort: 'deadline' } : {}), ...(p.kind && KINDS.includes(p.kind) ? { kind: p.kind } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.status, p.sort, p.kind]);
  useEffect(() => { const h = setTimeout(() => setQ(f.search.trim()), 350); return () => clearTimeout(h); }, [f.search]);
  useEffect(() => { const h = setTimeout(() => setR(f.region.trim()), 350); return () => clearTimeout(h); }, [f.region]);

  const params: ListBenefitsParams = {};
  if (q) params.search = q;
  if (f.audience) params.audience = f.audience;
  if (r) params.region = r;
  if (f.status) params.status = f.status;
  if (f.kind) params.kind = f.kind;
  const query = useListBenefits(params, { query: { queryKey: getListBenefitsQueryKey(params), placeholderData: keepPreviousData } });
  const all = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const categories = useMemo(() => Array.from(new Set((all.data ?? []).map((b) => b.category).filter(Boolean))).sort(), [all.data]);

  const list = useMemo(() => {
    let x = (query.data ?? []).filter((b) => (f.period === 'all' ? true : f.period === 'past' ? isPast(b) : !isPast(b)));
    if (f.category) x = x.filter((b) => b.category === f.category);
    if (f.kind) x = x.filter((b) => b.kind === f.kind);
    if(f.sort==='recommended' && account.active){
      x=[...x].sort((a,b)=>(ranks.get(b.id)??-1)-(ranks.get(a.id)??-1));
    } else if (f.sort === 'deadline') {
      // 마감일이 없는 공고는 빼지 않고 맨 뒤에 둔다.
      x = [...x].sort((a, b) => (endTime(a.endsAt) ?? Infinity) - (endTime(b.endsAt) ?? Infinity));
    } else {
      // 공고 시작일이 있는 것만 최신순으로 앞에 두고, 날짜가 없는 공고는 뒤에 둔다(확인일로 대신 정렬하지 않음).
      x = [...x].sort((a, b) => (t(b.startsAt) ?? -Infinity) - (t(a.startsAt) ?? -Infinity));
    }
    return x;
  }, [query.data, f.period, f.category, f.kind, f.sort, ranks, account.active]);

  const chips: [string, () => void][] = [];
  if (q) chips.push([`검색: ${q}`, () => set({ search: '' })]);
  if (r) chips.push([`지역: ${r}`, () => set({ region: '' })]);
  if (f.audience) chips.push([`대상: ${f.audience}`, () => set({ audience: undefined })]);
  if (f.category) chips.push([`분야: ${f.category}`, () => set({ category: undefined })]);
  if (f.status) chips.push([`상태: ${f.status}`, () => set({ status: undefined })]);
  if (f.kind) chips.push([`종류: ${f.kind}`, () => set({ kind: undefined })]);
  const filtered = chips.length > 0 || f.period !== 'current' || f.sort !== 'latest';
  const reset = () => {
    // 병합하지 않고 전체를 교체한다. 디바운스 값과 진입 파라미터도 함께 비운다.
    saved = { ...EMPTY };
    setF(saved); setQ(''); setR('');
    if (p.status || p.sort || p.kind) router.setParams({ status: undefined, sort: undefined, kind: undefined });
  };
  const toggle = (k: 'audience' | 'status' | 'category' | 'kind', v: string) => set({ [k]: f[k] === v ? undefined : v });

  return (
    <Page tab title="전체혜택" subtitle="공식 출처를 확인한 공고만 보여드립니다.">
      <Field testID="search-input" label="공고명·기관 검색" value={f.search} onChangeText={(s) => set({ search: s })} placeholder="예: 소상공인, 고용노동부" returnKeyType="search" />
      <Wrap>
        <Chip label="진행 중" selected={f.period === 'current'} onPress={() => set({ period: 'current' })} testID="period-current" />
        <Chip label="지난 공고" selected={f.period === 'past'} onPress={() => set({ period: 'past' })} testID="period-past" />
        <Chip label="전체" selected={f.period === 'all'} onPress={() => set({ period: 'all' })} testID="period-all" />
      </Wrap>
      <Pressable testID="filters-toggle" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="sliders" size={22} color={c.primary} />
          <T v="label">조건 고르기{chips.length > 0 ? ` · ${chips.length}개 선택` : ''}</T>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={22} color={c.mutedForeground} />
      </Pressable>
      {open ? (<View style={{ gap: 12 }}>
      <T v="label">종류</T>
      <Wrap>{KINDS.map((k) => <Chip key={k} label={k} selected={f.kind === k} onPress={() => toggle('kind', k)} testID={`kind-${k}`} />)}</Wrap>
      <T v="label">대상</T>
      <Wrap>{AUDIENCES.map((k) => <Chip key={k} label={k} selected={f.audience === k} onPress={() => toggle('audience', k)} testID={`aud-${k}`} />)}</Wrap>
      <Field label="지역" value={f.region} onChangeText={(s) => set({ region: s })} placeholder="예: 경기도, 수원시" />
      {categories.length > 0 ? (
        <>
          <T v="label">분야</T>
          <Wrap>{categories.map((k) => <Chip key={k} label={k} selected={f.category === k} onPress={() => toggle('category', k)} testID={`cat-${k}`} />)}</Wrap>
        </>
      ) : null}
      <T v="label">진행 상태</T>
      <Wrap>{STATUSES.map((k) => <Chip key={k} label={k} selected={f.status === k} onPress={() => toggle('status', k)} testID={`status-${k}`} />)}</Wrap>
      </View>) : null}
      <T v="label">정렬</T>
      {account.active ? <Chip label="추천순" selected={f.sort==='recommended'} onPress={()=>set({sort:'recommended'})} testID="sort-recommended"/> : null}
      {f.sort==='recommended' ? <Notice><T v="small" color={c.foreground}>조건 일치, 추가 확인 필요 순입니다. 선정·지급 순위가 아닙니다. {currentMatches.error||pastMatches.error ? '맞춤 정보를 불러오지 못했습니다. 일반 공고는 계속 볼 수 있어요.' : '미판정 공고는 뒤에 표시합니다.'}</T></Notice> : null}
      <Wrap>
        <Chip label="최신순" selected={f.sort === 'latest'} onPress={() => set({ sort: 'latest' })} testID="sort-latest" />
        <Chip label="마감 가까운 순" selected={f.sort === 'deadline'} onPress={() => set({ sort: 'deadline' })} testID="sort-deadline" />
      </Wrap>
      {f.sort === 'deadline' ? <T v="small" color={c.mutedForeground}>마감일이 없는 공고는 맨 뒤에 표시합니다.</T> : null}

      <View style={{ backgroundColor: c.primarySoft, borderRadius: c.radius, padding: 14, gap: 10 }}>
        <T v="label" color={c.primary} testID="result-count">
          {query.isLoading ? '불러오는 중' : query.error ? '결과 없음' : `${f.period === 'past' ? '지난 공고' : f.period === 'all' ? '전체 공고' : '진행 중 공고'} ${list.length}건`}
        </T>
        {chips.length > 0 ? <Wrap>{chips.map(([l, fn]) => <Chip key={l} label={`${l}  ×`} selected onPress={fn} />)}</Wrap> : null}
        {filtered ? <Btn kind="secondary" label="조건 초기화" icon="rotate-ccw" onPress={reset} testID="filters-reset" /> : null}
      </View>

      {query.isLoading ? <Loading /> : query.error ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} /> : list.length === 0 ? (
        filtered
          ? <Empty icon="search" title="조건에 맞는 공고가 없습니다" body="조건을 줄이거나 초기화해 보세요." action={<Btn label="조건 초기화" onPress={reset} />} />
          : <Empty icon="file-text" title="확인된 공고가 아직 없습니다" body="공식 출처 확인이 끝나면 이곳에 나타납니다." action={<Btn kind="secondary" label="다시 불러오기" icon="refresh-cw" onPress={() => query.refetch()} />} />
      ) : (
        list.map((b) => <BenefitCard key={b.id} b={b} />)
      )}
      {f.period !== 'current' ? <Notice tone="warn">지난 공고는 참고용입니다. 다시 열릴지는 해당 기관 공지를 확인하세요.</Notice> : null}
      <Disclaimer />
    </Page>
  );
}
