import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { listWelfare, type WelfareItem } from '@workspace/api-client-react';
import { Btn, Chip, Disclaimer, Emoji, Empty, ErrorState, Loading, Page, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { DISTRICTS, PROVINCE_ORDER } from '@/lib/regions';
import { apiErrorMessage } from '@/lib/text';
import { daysLeft } from '@/lib/util';

/** '서울특별시' → '서울' 처럼 짧게 */
const short = (p: string) => p.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '').replace(/^(충청|전라|경상)(북|남)$/, (_, a: string, b: string) => `${a[0]}${b}`);

function Row({ x, last }: { x: WelfareItem; last: boolean }) {
  const c = useColors();
  const router = useRouter();
  const left = daysLeft(x.endsAt);
  const when = x.status === '상시 조회' || left === null ? '상시 신청' : left < 0 ? '마감' : left === 0 ? '오늘 마감' : `D-${left}`;
  return (
    <Pressable testID={`welfare-${x.id}`} accessibilityRole="button" accessibilityLabel={`${x.title}. ${x.agency}. ${when}. 자세히 보기`}
      onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: x.id } })}
      style={({ pressed }) => ({ paddingVertical: 14, gap: 4, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="h3" numberOfLines={2} style={{ flex: 1 }}>{x.title}</T>
        <T v="small" color={left !== null && left <= 7 && left >= 0 ? c.destructive : c.primary} style={{ fontWeight: '700' }}>{when}</T>
      </View>
      {x.summary ? <T v="small" color={c.mutedForeground} numberOfLines={2}>{x.summary}</T> : null}
      <T v="small" color={c.mutedForeground} numberOfLines={1}>{[x.agency, x.region === '전국' || x.region === '관할 확인 필요' ? '전국' : x.region, x.category, ...x.ages].filter(Boolean).join(' · ')}</T>
    </Pressable>
  );
}

function ChipRow({ items, value, onChange, testID }: { items: { key: string; label: string }[]; value: string; onChange: (v: string) => void; testID: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} testID={testID}>
      {items.map((x) => <Chip key={x.key || 'all'} label={x.label} selected={value === x.key} onPress={() => onChange(x.key)} testID={`${testID}-${x.key || 'all'}`} />)}
    </ScrollView>
  );
}

export default function Welfare() {
  const c = useColors();
  const acc = useAccount();
  const me = acc.me?.profile;
  const homeProvince = me?.personal.province || (me?.businesses[0] as { province?: string } | undefined)?.province || '';
  const homeDistrict = me?.personal.district || (me?.businesses[0] as { district?: string } | undefined)?.district || '';
  const [province, setProvince] = useState(homeProvince);
  const [district, setDistrict] = useState(homeDistrict);
  const [field, setField] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WelfareItem[]>([]);
  // 로그인 정보가 늦게 오면 그때 내 지역으로 맞춘다.
  useEffect(() => { if (homeProvince && !province) { setProvince(homeProvince); setDistrict(homeDistrict); } }, [homeProvince, homeDistrict]);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 350); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setPage(1); setItems([]); }, [province, district, field, q]);
  const birthYear = me?.personal.birthYear;
  const query = useQuery({
    queryKey: ['welfare', province, district, birthYear ?? 0, field, q, page],
    queryFn: () => listWelfare({ province, district, birthYear, field, q, page }),
    placeholderData: keepPreviousData, staleTime: 5 * 60_000,
  });
  useEffect(() => {
    const d = query.data;
    if (!d || query.isPlaceholderData) return;
    setItems((prev) => (d.page === 1 ? d.items : [...prev, ...d.items.filter((x) => !prev.some((p) => p.id === x.id))]));
  }, [query.data, query.isPlaceholderData]);
  const provinces = useMemo(() => [{ key: '', label: '전국' }, ...PROVINCE_ORDER.map((p) => ({ key: p, label: short(p) }))], []);
  const districts = useMemo(() => [{ key: '', label: '전체' }, ...(DISTRICTS[province] ?? []).map((d) => ({ key: d, label: d }))], [province]);
  const fields = query.data?.fields ?? [];
  const total = query.data?.total ?? 0;

  return (
    <Page back title="복지 지원금" subtitle="개인·가구가 받을 수 있는 정부·지자체 복지예요.">
      <View testID="welfare-hero" style={{ backgroundColor: c.successSoft, borderRadius: c.radius + 6, padding: 18, gap: 6 }}>
        <Emoji char="🏠" size={30} motion="bounce" />
        <T v="h2" color={c.success}>우리 가족이 받을 수 있는 복지</T>
        <T v="small" color={c.success}>정부24에 올라온 중앙부처·지자체 복지 서비스를 모았어요. {birthYear ? '내 나이로 걸렀어요.' : '내 정보에 출생연도를 넣으면 나이로도 걸러 드려요.'}</T>
      </View>

      <View style={{ gap: 8 }}>
        <T v="label">사는 곳</T>
        <ChipRow items={provinces} value={province} onChange={(v) => { setProvince(v); setDistrict(''); }} testID="welfare-province" />
        {province ? <ChipRow items={districts} value={district} onChange={setDistrict} testID="welfare-district" /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: c.radius, paddingHorizontal: 12, minHeight: 48 }}>
        <Feather name="search" size={18} color={c.mutedForeground} />
        <TextInput testID="welfare-search" value={text} onChangeText={setText} placeholder="예: 출산, 월세, 어르신, 장애" placeholderTextColor={c.mutedForeground}
          accessibilityLabel="복지 검색" style={{ flex: 1, fontSize: 16, color: c.foreground, paddingVertical: 10 }} returnKeyType="search" />
        {text ? <Pressable accessibilityLabel="검색어 지우기" onPress={() => setText('')} style={{ padding: 6 }}><Feather name="x" size={18} color={c.mutedForeground} /></Pressable> : null}
      </View>
      {fields.length ? <ChipRow items={[{ key: '', label: '모든 분야' }, ...fields.slice(0, 14).map((f) => ({ key: f.name, label: `${f.name} ${f.count}` }))]} value={field} onChange={setField} testID="welfare-field" /> : null}

      {query.isLoading && !items.length ? <Loading rows={4} /> : query.error && !items.length ? (
        <ErrorState message={apiErrorMessage(query.error, '복지 정보를 불러오지 못했어요.')} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <Empty icon="search" title="찾는 복지가 없어요" body="지역이나 검색어를 바꿔 보세요. 복지 정보는 매일 새로 받아와요." />
      ) : (
        <>
          <T v="label" testID="welfare-total">{total.toLocaleString()}건 · 내 지역 서비스 먼저</T>
          <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
            {items.map((x, i) => <Row key={x.id} x={x} last={i === items.length - 1} />)}
          </View>
          {items.length < total ? <Btn kind="secondary" label="더 보기" loading={query.isFetching} onPress={() => setPage((p) => p + 1)} testID="welfare-more" /> : null}
        </>
      )}
      <T v="small" color={c.mutedForeground}>자격(소득·재산·가구 등)은 기관이 최종 확인해요. 자세히 보기에서 공식 신청 페이지로 이동할 수 있어요.</T>
      <Disclaimer />
    </Page>
  );
}
