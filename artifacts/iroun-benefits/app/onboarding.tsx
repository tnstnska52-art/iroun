import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, getListBenefitsQueryKey, saveProfile, savePreferences, useListBenefits, type Business, type Personal, type Profile } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { loadDraft, saveDraft } from '@/lib/draft';
import { confirmAsk } from '@/lib/confirm';
import { apiErrorMessage } from '@/lib/text';
import { DISTRICTS, PROVINCE_ORDER } from '@/lib/regions';
import { estimate, won } from '@/lib/estimate';
import { newId } from '@/lib/util';
import { Btn, Field, Loading, Notice, T, Toast, Toggle } from '@/components/ui';

type Q = { key: string; title: string; hint?: string; kind: 'number' | 'text' | 'select' | 'multi'; options?: string[]; min?: number; max?: number; placeholder?: string; unit?: string };

// 개인 정보는 꼭 필요한 두 가지만 묻는다(나이 조건, 거주지 조건이 있는 공고 판단용).
const PERSONAL_Q: Q[] = [
  { key: 'birthYear', title: '태어난 해는 언제인가요?', hint: '나이 조건이 있는 지원금을 찾는 데 써요. 예: 1968', kind: 'number', min: 1900, max: new Date().getFullYear(), placeholder: '1968', unit: '년' },
  { key: 'province', title: '사시는 곳은 어느 지역인가요?', hint: '사업장과 사는 곳이 다르면 받을 수 있는 지원금이 달라져요.', kind: 'select', options: PROVINCE_ORDER },
];
const NONE = '해당 없음';
export const INDUSTRIES = ['음식점', '도소매', '서비스', '제조', '건설', '운수', '숙박', '교육', '보건·복지', '정보통신', '농림어업', '기타'];
// 앞의 조건(업종·지역·매출·직원·형태)만 고르면 바로 결과를 보여준다. 나머지는 나중에 채운다.
const QUICK = 6;
const BIZ_Q: Q[] = [
  { key: 'industry', title: '어떤 업종인가요?', hint: '가장 가까운 것을 골라 주세요.', kind: 'select', options: INDUSTRIES },
  { key: 'province', title: '사업장은 어느 지역에 있나요?', hint: '사는 곳이 아니라 사업장 주소 기준이에요.', kind: 'select', options: PROVINCE_ORDER },
  { key: 'district', title: '어느 시·군·구인가요?', hint: '시 단위까지 골라야 지역 지원금을 정확히 찾아요.', kind: 'select', options: [] },
  { key: 'revenue', title: '지난해 연매출은 어느 정도인가요?', hint: '1년 매출 합계예요. 정확한 금액은 묻지 않아요.', kind: 'select', options: ['1억 원 미만', '1억~3억 원', '3억~10억 원', '10억 원 이상'] },
  { key: 'employees', title: '4대보험에 가입된 직원은 몇 명인가요?', hint: '대표자 본인은 빼고 세어 주세요. 없으면 0을 입력해 주세요.', kind: 'number', min: 0, max: 100000, placeholder: '0', unit: '명' },
  { key: 'entity', title: '개인사업자인가요, 법인인가요?', kind: 'select', options: ['개인사업자', '법인사업자'] },
  { key: 'name', title: '사업장 이름을 알려주세요', hint: '담당자가 도와드릴 때 필요해요.', kind: 'text', placeholder: '상호' },
  { key: 'openedAt', title: '개업한 날은 언제인가요?', hint: '2015-03-01처럼 입력해 주세요. 일까지 모르면 \'잘 모르겠어요\'를 눌러 주세요.', kind: 'text', placeholder: 'YYYY-MM-DD' },
];
function validDate(t: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return false;
  const y = +m[1], mo = +m[2], da = +m[3];
  const d = new Date(Date.UTC(y, mo - 1, da));
  return y >= 1900 && d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da && d.getTime() <= Date.now();
}
const HUB = PERSONAL_Q.length + 1; // 0=consent, 1..n personal, HUB=businesses, HUB+1=done
const DONE = HUB + 1;
const EMPTY: Profile = { personal: {}, businesses: [], step: 0 };

export default function Onboarding() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const { userId } = useAuth();
  const uid = userId ?? null;
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [consent, setConsent] = useState(true);
  const [idx, setIdx] = useState(0);
  const [biz, setBiz] = useState<{ id: string; sub: number } | null>(null);
  const [quick, setQuick] = useState(false);
  const [result, setResult] = useState(false);
  const [more, setMore] = useState(false);
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const [text, setText] = useState('');
  const [multi, setMulti] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sync, setSync] = useState<{ t: 'ok' | 'warn' | 'error'; s: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (sync?.t !== 'ok') return; const h = setTimeout(() => setSync((x) => (x?.t === 'ok' ? null : x)), 1600); return () => clearTimeout(h); }, [sync]);
  const inited = useRef(false);
  const commitInFlight=useRef(false);

  useEffect(() => {
    if (inited.current || acc.loading) return;
    inited.current = true;
    (async () => {
      const d = await loadDraft(uid);
      const srv = acc.me;
      const useDraft = !!d && !(d.serverSaved && srv);
      let p = useDraft ? d!.profile : (srv ? srv.profile : EMPTY);
      const cs = d ? d.consent : srv ? !!srv.preferences.privacyConsent : true;
      setProfile(p); setConsent(cs);
      setIdx(cs ? Math.min(Math.max(p.step, 1), HUB) : 0);
      if(cs && d?.cursor && (useDraft || p.step === d.profile.step)) {
        setIdx(Math.max(1,Math.min(d.cursor.idx,HUB)));
        const cursor=d.cursor.biz;
        if(cursor && p.businesses.some(b=>b.id===cursor.id)) { setBiz({id:cursor.id,sub:Math.max(0,Math.min(cursor.sub,BIZ_Q.length-1))}); setQuick(cursor.sub<QUICK); }
      }
      // 사업장 조건 다섯 가지가 비어 있으면 그 질문부터 이어간다.
      if (cs && !(d?.cursor?.biz)) {
        const first = p.businesses[0] as unknown as Record<string, unknown> | undefined;
        const sub = first ? BIZ_Q.slice(0, QUICK).findIndex((x) => first[x.key] === undefined || first[x.key] === '') : -1;
        if (first && sub >= 0) { setQuick(true); setBiz({ id: p.businesses[0].id, sub }); }
        else if (!first) setIdx(0);
      }
      setReady(true);
    })();
  }, [acc.loading, acc.me]);

  const bizObj = biz ? profile.businesses.find((b) => b.id === biz.id) : undefined;
  const rawQ: Q | null = biz ? BIZ_Q[biz.sub] : idx >= 1 && idx <= PERSONAL_Q.length ? PERSONAL_Q[idx - 1] : null;
  // 시·군·구는 앞에서 고른 시·도에 맞는 목록을 보여준다. 시·도를 모르면 직접 입력한다.
  const districtOptions = biz && rawQ?.key === 'district' ? DISTRICTS[String(bizObj?.province ?? '')] ?? [] : null;
  const q: Q | null = rawQ && districtOptions ? (districtOptions.length ? { ...rawQ, options: districtOptions } : { ...rawQ, kind: 'text', placeholder: '예: 수원시' }) : rawQ;
  const cur = (): string | number | undefined => {
    if (!q) return undefined;
    return biz ? (bizObj as Record<string, unknown> | undefined)?.[q.key] as string | number | undefined : (profile.personal as Record<string, unknown>)[q.key] as string | number | undefined;
  };
  // sync the text input whenever the question changes
  const qKey = biz ? `b${biz.id}-${biz.sub}` : `p${idx}`;
  useEffect(() => {
    const v = (() => {
      if (!q) return '';
      const o = biz ? (bizObj as Record<string, unknown> | undefined) : (profile.personal as Record<string, unknown>);
      const x = o?.[q.key];
      return x === undefined || x === null || Array.isArray(x) ? '' : String(x);
    })();
    const e = !biz && q?.kind === 'multi' ? (profile.personal as Record<string, unknown>)[q.key] : undefined;
    setMulti(Array.isArray(e) ? e.map(String) : []);
    setText(v); setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey, ready]);

  const persist = async (p: Profile, forceServer = false,cursor={idx,biz},pending?:{profile:Profile;cursor:{idx:number;biz:typeof biz}}) => {
    const stored = await saveDraft({ profile: pending?.profile ?? p, consent,cursor:pending?.cursor ?? cursor }, uid);
    const storeErr = stored ? '' : '이 기기에 저장하지 못했습니다(저장 공간 오류). ';
    if (!acc.isSignedIn || !acc.me || !consent) {
      if (!stored) { setSync({ t: 'error', s: `${storeErr}입력한 내용이 사라질 수 있으니 저장 공간을 확인하고 다시 시도해 주세요.` }); return false; }
      setSync(acc.isSignedIn ? { t: 'warn', s: '이 기기에 임시 저장했어요. 서버에 저장하려면 개인정보 동의가 필요해요.' } : { t: 'ok', s: '저장했어요.' });
      return true;
    }
    try {
      if (!acc.me.preferences.privacyConsent) {
        await savePreferences({ ...acc.me.preferences, privacyConsent: true });
      }
      await saveProfile(p);
      const syncedDraft = await saveDraft({profile:p,consent,cursor,serverSaved:true},uid);
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setSync({ t: syncedDraft ? 'ok' : 'error', s: syncedDraft ? '저장했어요.' : '서버에는 저장했지만 이 기기 임시 저장은 실패했습니다.' });
      return true;
    } catch (e) {
      // 로그인·동의 상태에서 서버 저장이 실패하면 다음으로 넘어가지 않는다.
      setSync({ t: 'error', s: stored ? `${apiErrorMessage(e)} 서버에 저장하지 못해 다음으로 넘어가지 않았습니다. 입력한 내용은 이 기기에 임시 저장되어 있으니 다시 시도해 주세요.` : `${apiErrorMessage(e)} ${storeErr}입력한 내용이 저장되지 않았습니다.` });
      void forceServer;
      return false;
    }
  };

  const answerId = (k: string) => (biz ? `business.${biz.id}.${k}` : `personal.${k}`);
  const unknownIds = profile.unknownAnswers ?? [];
  const commit = async (value: string | number | string[] | undefined, advance: () => void) => {
    if(commitInFlight.current)return;
    commitInFlight.current=true;setBusy(true);
    try {
    if (!q) return;
    let p: Profile;
    if (biz) {
      p = { ...profile, businesses: profile.businesses.map((b) => (b.id === biz.id ? ({ ...b, [q.key]: value } as Business) : b)) };
    } else {
      p = { ...profile, personal: { ...profile.personal, [q.key]: value } as Personal };
    }
    // 모름: 값은 비우고(0/false로 저장하지 않음) unknownAnswers에 기록. 실제 답: 기록에서 제거.
    const id = answerId(q.key);
    const rest = (p.unknownAnswers ?? []).filter((x) => x !== id);
    p = { ...p, unknownAnswers: value === undefined ? [...rest, id] : rest };
    const clean = JSON.parse(JSON.stringify(p)) as Profile;
    if (!biz) clean.step = Math.max(clean.step, idx + 1);
    const pending = acc.isSignedIn && acc.me && consent ? {profile:{...clean,step:profile.step},cursor:{idx,biz}} : undefined;
    setProfile(pending?.profile ?? clean);
    const nextBiz=biz&&biz.sub+1<BIZ_Q.length?{...biz,sub:biz.sub+1}:null;
    if(await persist(clean,false,{idx:biz?HUB:idx+1,biz:nextBiz},pending)) { setProfile(clean); advance(); }
    }finally{commitInFlight.current=false;setBusy(false);}
  };

  const submitCurrent = () => {
    if (!q) return;
    if (q.kind === 'multi') {
      if (multi.length === 0) { setErr('하나 이상 고르거나 \'잘 모르겠어요\'를 눌러 주세요.'); return; }
      void commit(multi, goNext); return;
    }
    const t = text.trim();
    // 빈 칸은 '0'이나 '모름'으로 저장하지 않는다. 사용자가 명시적으로 고르게 한다.
    if (t === '') { setErr(q.kind === 'number' && q.min === 0 ? '없으면 0을 입력하고, 모르면 \'잘 모르겠어요\'를 눌러 주세요.' : '답을 입력하거나 \'잘 모르겠어요\'를 눌러 주세요.'); return; }
    let v: string | number = t;
    if (q.kind === 'number') {
      const n = Number(t);
      if (!Number.isInteger(n) || n < (q.min ?? 0) || n > (q.max ?? 1e9)) { setErr(`${q.min}에서 ${q.max} 사이의 숫자로 입력해 주세요.`); return; }
      v = n;
    }
    if (q.key === 'openedAt' && !validDate(t)) { setErr('실제 있는 날짜를 2015-03-01 형식으로 입력해 주세요. 모르면 \'잘 모르겠어요\'를 눌러 주세요.'); return; }
    void commit(v, goNext);
  };
  const skipUnknown = () => { setText(''); void commit(undefined, goNext); };
  const goNext = () => {
    if (biz) {
      // 처음 다섯 가지를 고르면 홈으로 돌아가 맞는 공고부터 보여준다.
      if (quick && biz.sub + 1 === QUICK) { setQuick(false); setResult(true); return; }
      if (biz.sub + 1 >= BIZ_Q.length) { setBiz(null); const next = PERSONAL_Q.findIndex((x) => { const v = (profile.personal as Record<string, unknown>)[x.key]; return v === undefined || v === '' || (Array.isArray(v) && v.length === 0); }); setIdx(next >= 0 ? next + 1 : HUB); }
      else setBiz({ ...biz, sub: biz.sub + 1 });
    }
    else setIdx((i) => i + 1);
  };
  const goBack = () => {
    if (biz) { if (biz.sub === 0) { setBiz(null); setIdx(HUB); } else setBiz({ ...biz, sub: biz.sub - 1 }); return; }
    if (idx > 0) setIdx(idx - 1); else router.back();
  };

  const addBiz = async () => {
    const b: Business = { id: newId() };
    const p = { ...profile, businesses: [...profile.businesses, b], step: HUB };
    if(await persist(p,false,{idx:HUB,biz:{id:b.id,sub:0}})){setProfile(p);setBiz({id:b.id,sub:0});}
  };
  // 동의 뒤에는 사업장 조건 다섯 가지부터 묻는다. 이미 사업장이 있으면 비어 있는 질문으로 이어간다.
  const startAfterConsent = async () => {
    if (profile.businesses.length === 0) { setBusy(true); setQuick(true); await addBiz(); setBusy(false); return; }
    const b = profile.businesses[0] as unknown as Record<string, unknown>;
    const sub = BIZ_Q.findIndex((x) => b[x.key] === undefined || b[x.key] === '');
    if (sub >= 0) { setQuick(sub < QUICK); setBiz({ id: profile.businesses[0].id, sub }); } else setIdx(1);
  };
  const removeBiz = (id: string) => confirmAsk('사업장 삭제', '이 사업장 정보를 지웁니다. 계속할까요?', '삭제', async () => {
    const p = { ...profile, businesses: profile.businesses.filter((b) => b.id !== id), unknownAnswers: (profile.unknownAnswers ?? []).filter((x) => !x.startsWith(`business.${id}.`)) };
    if (await persist(p)) setProfile(p);
  });
  const finish = async () => {
    if (!acc.isSignedIn) { if (!(await saveDraft({ profile: { ...profile, step: DONE }, consent }, uid))) { setSync({ t: 'error', s: '이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.' }); return; }
    router.replace('/'); return; }
    setBusy(true);
    const p = { ...profile, step: DONE };
    setProfile(p);
    const ok = await persist(p, true);
    setBusy(false);
    if (ok) router.replace('/');
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!ready) return <Sheet title="내 정보" onClose={close}><Loading rows={2} /></Sheet>;
  const total = PERSONAL_Q.length + 1;
  const stepNo = biz ? biz.sub + 1 : Math.min(idx + 1, total + 1);
  const totalNo = biz ? BIZ_Q.length : total + 1;
  const stepText = biz ? (quick ? `질문 ${Math.min(stepNo, QUICK)} / ${QUICK}` : `사업장 질문 ${stepNo} / ${totalNo}`) : idx >= DONE ? '입력 완료' : `질문 ${stepNo} / ${totalNo}`;
  const toast = sync?.t === 'ok' ? sync.s : null;
  const syncNote = sync && sync.t !== 'ok' ? <Notice tone={sync.t === 'warn' ? 'info' : 'error'}>{sync.s}</Notice> : null;

  if (result) {
    const est = estimate(benefits.data ?? [], profile);
    const go = (acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as never;
    return (
      <Sheet title="고객님의 예상 지원사업" step="확인 완료" onClose={() => router.replace('/')} toast={toast}>
        <View testID="estimate-result" style={{ backgroundColor: c.primarySoft, borderRadius: 14, padding: 20, gap: 6, alignItems: 'center' }}>
          <T v="label" color={c.primary}>예상 지원사업</T>
          <T v="hero" color={c.primary} style={{ fontSize: 30, lineHeight: 38 }}>{est.items.length}건</T>
          {est.total > 0 ? (
            <>
              <T v="label" color={c.primary} style={{ marginTop: 6 }}>예상 수령액</T>
              <T v="hero" color={c.primary} style={{ fontSize: 30, lineHeight: 38 }}>최대 {won(est.total)}</T>
            </>
          ) : null}
        </View>
        <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>공고에 적힌 최대 금액을 더한 값이에요. 실제 지급액은 심사·예산에 따라 달라요.</T>
        <T v="h3" style={{ textAlign: 'center', marginTop: 4 }}>{acc.active ? '홈에서 바로 확인해 보세요' : '회원가입만 하고 즉시 확인해보세요'}</T>
        <Btn testID="result-signup" label={acc.active ? '홈에서 확인하기' : acc.isSignedIn ? '3일 무료로 확인하기' : '회원가입하고 확인하기'} onPress={() => (acc.active ? router.replace('/') : router.replace(go))} />
        {!acc.active ? <Btn kind="ghost" label="홈으로" onPress={() => router.replace('/')} testID="result-home" /> : null}
      </Sheet>
    );
  }

  if (!biz && idx === 0) {
    return (
      <Sheet title="내 사업장 예상지원금 확인" hint="업종·지역·매출·직원 수·사업자 형태만 고르면 돼요. 1분이면 끝나요." step="시작하기" onClose={close} toast={toast}>
        <Pressable testID="consent-more" accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="small" style={{ fontWeight: '700' }}>개인정보 수집·이용 안내</T>
          <Feather name={more ? 'chevron-up' : 'chevron-down'} size={18} color={c.mutedForeground} />
        </Pressable>
        {more ? (
          <View style={{ backgroundColor: c.secondary, borderRadius: 10, padding: 14, gap: 6 }}>
            <T v="small">맞는 지원금을 찾기 위해 사업장 정보(업종·지역·매출 구간·직원 수·사업자 형태)를 입력받아요. 주민등록번호, 계좌, 사업자등록번호는 묻지 않습니다.</T>
            <T v="small" color={c.mutedForeground}>가입 전에는 이 기기에만 임시 저장돼요. 언제든 고치거나 지울 수 있어요.</T>
          </View>
        ) : null}
        <Toggle testID="consent-toggle" label="위 내용에 동의합니다" value={consent} onChange={async (v) => { setConsent(v); if (!(await saveDraft({ profile, consent: v }, uid))) setSync({ t: 'error', s: '이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.' }); else setSync(null); }} />
        {syncNote}
        <Btn testID="wizard-next" label="시작" disabled={!consent || sync?.t === 'error'} loading={busy} onPress={startAfterConsent} />
      </Sheet>
    );
  }

  if (!biz && idx === HUB) {
    return (
      <Sheet title="사업장 정보" hint="사업장이 여러 곳이면 모두 추가할 수 있어요. 사업장이 없으면 바로 완료하세요." step={stepText} onClose={close} toast={toast}>
        {profile.businesses.map((b, i) => (
          <View key={b.id} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14, gap: 6 }}>
            <T v="h3">{b.name || `사업장 ${i + 1}`}</T>
            <T v="small" color={c.mutedForeground}>{[b.province, b.district, b.industry].filter(Boolean).join(' · ') || '입력한 내용이 아직 없어요'}</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn kind="secondary" label="정보 수정" icon="edit-2" onPress={() => setBiz({ id: b.id, sub: 0 })} testID={`edit-biz-${i}`} style={{ flex: 1 }} />
              <Btn kind="secondary" label="삭제" icon="trash-2" onPress={() => removeBiz(b.id)} testID={`remove-biz-${i}`} style={{ flex: 1 }} />
            </View>
          </View>
        ))}
        <Btn testID="add-business" label="사업장 추가하기" icon="plus" kind="secondary" onPress={addBiz} />
        {syncNote}
        <Btn testID="wizard-finish" label="예상 지원금 확인하기" loading={busy} onPress={finish} />
        <Btn kind="ghost" label="이전 질문" onPress={goBack} />
      </Sheet>
    );
  }

  if (!biz && idx >= DONE) {
    return (
      <Sheet title="입력을 마쳤어요" hint="내정보에서 언제든 고치거나 이어서 입력할 수 있어요." step={stepText} onClose={close} toast={toast}>
        <Btn label="홈으로 가기" icon="home" onPress={() => router.replace('/')} testID="wizard-home" />
        <Btn kind="secondary" label="정보 수정" onPress={() => setIdx(1)} />
      </Sheet>
    );
  }

  if (!q) return null;
  const isSelect = q.kind === 'select';
  const selected = Array.isArray(cur()) ? '' : String(cur() ?? '');
  const wasUnknown = unknownIds.includes(answerId(q.key));
  const toggleMulti = (o: string) => { setErr(null); setMulti((m) => (m.includes(o) ? m.filter((x) => x !== o) : o === NONE ? [NONE] : [...m.filter((x) => x !== NONE), o])); };
  return (
    <Sheet title={q.title} hint={q.hint} step={stepText} onClose={close} toast={toast}>
      {wasUnknown ? <T v="small" color={c.warning}>지난번에 '잘 모르겠어요'로 넘긴 질문이에요.</T> : null}
      {q.kind === 'multi' ? (
        <>
          {q.options!.map((o) => <Option key={o} label={o} selected={multi.includes(o)} onPress={() => toggleMulti(o)} testID={`opt-${o}`} multi />)}
          {err ? <T v="small" color={c.destructive}>{err}</T> : null}
          <Btn testID="wizard-next" label="선택 완료" loading={busy} onPress={submitCurrent} />
        </>
      ) : isSelect ? (
        q.options!.map((o) => <Option key={o} label={o} selected={selected === o} disabled={busy} onPress={() => void commit(o, goNext)} testID={`opt-${o}`} />)
      ) : (
        <>
          <Field testID="wizard-input" label={q.unit ? `답변 (단위: ${q.unit})` : '답변'} value={text} onChangeText={(t) => { setText(t); setErr(null); }} keyboardType={q.kind === 'number' ? 'number-pad' : 'default'} placeholder={q.placeholder} error={err ?? undefined} onSubmitEditing={submitCurrent} returnKeyType="next" />
          <Btn testID="wizard-next" label="입력 완료" loading={busy} onPress={submitCurrent} />
        </>
      )}
      {syncNote}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn testID="wizard-back" kind="ghost" label="이전 질문" icon="chevron-left" onPress={goBack} style={{ flex: 1 }} />
        <Btn testID="wizard-unknown" kind="ghost" label="잘 모르겠어요" onPress={skipUnknown} hint="모르면 나중에 입력해도 돼요. 이 항목은 비워 두고 다음으로 넘어갑니다" style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

/** 참고 영상의 입력 방식: 아래에서 올라오는 판에 한 번에 한 질문 */
function Sheet({ title, hint, step, onClose, toast, children }: { title: string; hint?: string; step?: string; onClose: () => void; toast?: string | null; children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
      <Pressable style={{ flex: 1, minHeight: 48 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="입력 닫기" testID="sheet-backdrop" />
      <Toast text={toast ?? null} />
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingBottom: Platform.OS === 'web' ? 8 : insets.bottom }}>
        <View style={{ alignItems: 'center', paddingTop: 10 }}><View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: c.border }} /></View>
        <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 10 }} bottomOffset={24}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
            <T v="small" color={c.primary} style={{ fontWeight: '700' }}>{step ?? ''}</T>
            <Pressable testID="back-button" accessibilityRole="button" accessibilityLabel="입력 닫기" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}>
              <Feather name="x" size={22} color={c.mutedForeground} />
            </Pressable>
          </View>
          <T v="h2" accessibilityRole="header" style={{ fontSize: 20, lineHeight: 28 }}>{title}</T>
          {hint ? <T v="small" color={c.mutedForeground}>{hint}</T> : null}
          <View style={{ gap: 8, marginTop: 6 }}>{children}</View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </View>
  );
}

function Option({ label, selected, onPress, testID, disabled, multi }: { label: string; selected: boolean; onPress: () => void; testID?: string; disabled?: boolean; multi?: boolean }) {
  const c = useColors();
  return (
    <Pressable testID={testID} accessibilityRole={multi ? 'checkbox' : 'button'} accessibilityLabel={label} accessibilityState={{ selected, checked: multi ? selected : undefined, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderRadius: 10, borderWidth: 1.5, borderColor: selected ? c.primary : c.input, backgroundColor: selected ? c.primarySoft : c.card, opacity: pressed ? 0.8 : 1 })}>
      <T v="body" style={{ fontWeight: '600' }} color={selected ? c.primary : c.foreground}>{label}</T>
      {selected ? <Feather name="check" size={20} color={c.primary} /> : null}
    </Pressable>
  );
}
