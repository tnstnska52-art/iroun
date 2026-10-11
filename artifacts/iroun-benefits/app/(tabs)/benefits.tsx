import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  const [sortOpen, setSortOpen] = useState(false);
  const [searching, setSearching] = useState(false);
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

  const SORTS: [Sort, string][] = [...(account.active ? [['recommended', '맞춤 순'] as [Sort, string]] : []), ['latest', '최신 순'], ['deadline', '마감 임박']];
  const sortLabel = SORTS.find(([k]) => k === f.sort)?.[1] ?? '최신 순';
  // 사업자도 개인·가구 대상 지원(민생지원금 등)을 받을 수 있으므로 대상으로 나누지 않고 한 목록에 모두 보여준다.
  const SEG: [string | undefined, string][] = [[undefined, '전체'], ['지원금', '지원금'], ['환급금', '환급금']];
  const heading = f.period === 'past' ? '지난 공고' : f.period === 'all' ? '전체 공고' : '사업자가 신청할 수 있는 공고';
  const extraCount = chips.filter(([l]) => !l.startsWith('종류:')).length + (f.period !== 'current' ? 1 : 0);

  return (
    <Page tab flush>
      <LinearGradient colors={['#DCE8FB', '#EEF3FB', c.background]} style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
          <T v="title" style={{ flex: 1 }}>전체혜택</T>
          <Pressable testID="search-toggle" accessibilityRole="button" accessibilityLabel="공고 검색" accessibilityState={{ expanded: searching }} onPress={() => setSearching(!searching)}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={searching ? 'x' : 'search'} size={24} color={c.foreground} />
          </Pressable>
        </View>
        {searching || f.search ? <Field testID="search-input" label="공고명·기관 검색" value={f.search} onChangeText={(s) => set({ search: s })} placeholder="예: 소상공인, 고용노동부" returnKeyType="search" autoFocus={searching} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="small" style={{ fontWeight: '600' }}>{heading}</T>
            <T v="title" testID="result-count">{query.isLoading ? '불러오는 중' : query.error ? '확인하지 못했어요' : `총 ${list.length}건`}</T>
            {!account.active ? (
              <Pressable accessibilityRole="button" onPress={() => router.push(account.isSignedIn ? '/access' : '/auth')} style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="bell" size={14} color={c.destructive} />
                <T v="small" color={c.destructive} style={{ fontWeight: '700' }}>정보를 입력하면 내게 맞는 공고를 골라드려요</T>
              </Pressable>
            ) : <T v="small" color={c.mutedForeground}>사업자가 받을 수 있는 공고를 모두 모았어요</T>}
          </View>
          <Feather name="file-text" size={64} color="#C4D4F2" />
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 10 }}>
          <View>
            <Pressable testID="sort-toggle" accessibilityRole="button" accessibilityLabel={`정렬: ${sortLabel}`} accessibilityState={{ expanded: sortOpen }} onPress={() => setSortOpen(!sortOpen)}
              style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 12 }}>
              <T v="small" style={{ fontWeight: '700' }}>{sortLabel}</T>
              <Feather name={sortOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.foreground} />
            </Pressable>
            {sortOpen ? (
              <View style={{ position: 'absolute', top: 44, left: 0, minWidth: 140, backgroundColor: c.card, borderRadius: 10, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6, zIndex: 20 }}>
                {SORTS.map(([k, l]) => (
                  <Pressable key={k} testID={`sort-${k}`} accessibilityRole="button" accessibilityState={{ selected: f.sort === k }} onPress={() => { set({ sort: k }); setSortOpen(false); }}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 }}>
                    <T v="small" color={f.sort === k ? c.foreground : c.mutedForeground} style={{ fontWeight: f.sort === k ? '700' : '500' }}>{l}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row', backgroundColor: '#E5E8EB', borderRadius: 8, padding: 3 }}>
            {SEG.map(([k, l]) => {
              const on = f.kind === k;
              return (
                <Pressable key={l} testID={`kind-${k ?? '전체'}`} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => set({ kind: k })}
                  style={{ flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: on ? c.card : 'transparent' }}>
                  <T v="small" color={on ? c.foreground : c.mutedForeground} style={{ fontWeight: on ? '700' : '500', fontSize: 13 }}>{l}</T>
                </Pressable>
              );
            })}
          </View>
          <Pressable testID="filters-toggle" accessibilityRole="button" accessibilityLabel={extraCount > 0 ? `조건 더 고르기, ${extraCount}개 선택됨` : '조건 더 고르기'} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: open || extraCount > 0 ? c.primarySoft : c.card, borderRadius: 8 }}>
            <Feather name="sliders" size={18} color={open || extraCount > 0 ? c.primary : c.foreground} />
          </Pressable>
        </View>

        {open ? (
          <View style={{ backgroundColor: c.card, borderRadius: c.radius, padding: 14, gap: 10 }}>
            <T v="label">기간</T>
            <Wrap>
              <Chip label="진행 중" selected={f.period === 'current'} onPress={() => set({ period: 'current' })} testID="period-current" />
              <Chip label="지난 공고" selected={f.period === 'past'} onPress={() => set({ period: 'past' })} testID="period-past" />
              <Chip label="전체" selected={f.period === 'all'} onPress={() => set({ period: 'all' })} testID="period-all" />
            </Wrap>
            <T v="label">신청 대상으로 좁혀 보기</T>
            <Wrap>{[['사업', '사업자 전용'], ['개인', '개인 누구나'], ['가구', '가구 단위']].map(([k, l]) => <Chip key={k} label={l} selected={f.audience === k} onPress={() => toggle('audience', k)} testID={`aud-${k}`} />)}</Wrap>
            <Field label="지역" value={f.region} onChangeText={(s) => set({ region: s })} placeholder="예: 경기도, 수원시" />
            {categories.length > 0 ? (
              <>
                <T v="label">분야</T>
                <Wrap>{categories.map((k) => <Chip key={k} label={k} selected={f.category === k} onPress={() => toggle('category', k)} testID={`cat-${k}`} />)}</Wrap>
              </>
            ) : null}
            <T v="label">접수 상태</T>
            <Wrap>{STATUSES.map((k) => <Chip key={k} label={k} selected={f.status === k} onPress={() => toggle('status', k)} testID={`status-${k}`} />)}</Wrap>
          </View>
        ) : null}

        {chips.length > 0 || filtered ? (
          <Wrap>
            {chips.map(([l, fn]) => <Chip key={l} label={`${l}  ×`} selected onPress={fn} />)}
            {filtered ? <Chip label="조건 초기화" onPress={reset} testID="filters-reset" /> : null}
          </Wrap>
        ) : null}
        {f.sort === 'recommended' ? <T v="small" color={c.mutedForeground}>조건 일치, 추가 확인 필요 순서예요. 선정·지급 순위가 아닙니다.{currentMatches.error || pastMatches.error ? ' 맞춤 정보를 불러오지 못했어요.' : ''}</T> : null}
        {f.sort === 'deadline' ? <T v="small" color={c.mutedForeground}>마감일이 없는 공고는 맨 뒤에 보여드려요.</T> : null}

        {query.isLoading ? <Loading /> : query.error ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} /> : list.length === 0 ? (
          filtered
            ? <Empty icon="search" title="선택한 조건에 맞는 공고가 없어요" body="조건을 줄이거나 초기화해 보세요." action={<Btn label="조건 초기화" onPress={reset} />} />
            : <Empty icon="file-text" title="아직 확인한 자료가 없어요" body="공식 출처 확인이 끝나면 이곳에 나타나요." action={<Btn kind="secondary" label="다시 시도" icon="refresh-cw" onPress={() => query.refetch()} />} />
        ) : (
          list.map((b) => <BenefitCard key={b.id} b={b} />)
        )}
        {f.period !== 'current' ? <Notice tone="warn">지난 공고는 참고용이에요. 다시 열릴지는 해당 기관 공지를 확인하세요.</Notice> : null}
        <Disclaimer />
      </View>
    </Page>
  );
}
