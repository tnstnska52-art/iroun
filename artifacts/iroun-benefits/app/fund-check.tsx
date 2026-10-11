import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestFundDiagnosis, type FundLeadInput } from '@workspace/api-client-react';
import { Btn, Field, T, Toggle } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { apiErrorMessage } from '@/lib/text';
import { newId } from '@/lib/util';
import { DISTRICTS, PROVINCE_ORDER } from '@/lib/regions';
import { INDUSTRIES } from './onboarding';
import {
  ASSET_BANDS, CONSULT_COUNT, CREDIT_BANDS, DEPOSIT_BANDS, FUND_DONE_KEY, ISSUES, LENDERS, LOAN_BANDS, MONTHS, OPEN_YEARS, REVENUE_BANDS, REVENUE_YEARS,
} from '@/lib/funds';

type Answers = {
  entity?: '개인' | '법인'; openedYear?: number; openedMonth?: number; industry?: string; province?: string; district?: string;
  revenue: Record<number, string>; creditKcb?: string; creditNice?: string; loans: { lender: string; amount: string }[];
  issues: (typeof ISSUES)[number][]; premises?: '임차' | '자가'; premisesValue?: string; home?: '임차' | '자가'; homeValue?: string;
  businessName: string; name: string; phone: string;
};
type Step =
  | { id: string; kind: 'select'; title: string; hint?: string; options: string[]; value?: string; set: (a: Answers, v: string) => Answers }
  | { id: 'loans' | 'issues' | 'contact'; kind: 'custom'; title: string; hint?: string };

const phoneOk = (s: string) => /^01[016789]-?\d{3,4}-?\d{4}$/.test(s.trim());

/** 정책자금 진단: 고르기만 하면 되는 질문을 하나씩 보여주고, 끝나면 회사 담당자에게 전달한다. 한도·금리는 앱이 계산하지 않는다. */
export default function FundCheck() {
  const c = useColors();
  const router = useRouter();
  const acc = useAccount();
  const { user } = useUser();
  const first = acc.me?.profile.businesses[0];
  const [a, setA] = useState<Answers>(() => ({ revenue: {}, loans: [], issues: [], businessName: '', name: '', phone: '' }));
  const [i, setI] = useState(0);
  const [lender, setLender] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<'form' | 'sending' | 'done'>('form');
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newId());
  const scroll = useRef<ScrollView>(null);

  // 이미 아는 값은 미리 채워 둔다(고객이 바꿀 수 있다).
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || acc.loading) return;
    filled.current = true;
    setA((p) => ({
      ...p,
      industry: p.industry ?? (first?.industry && INDUSTRIES.includes(first.industry) ? first.industry : undefined),
      province: p.province ?? (first?.province && PROVINCE_ORDER.includes(first.province) ? first.province : undefined),
      district: p.district ?? first?.district,
      premises: p.premises ?? (first?.premises as Answers['premises']),
      businessName: p.businessName || first?.name || '',
      name: p.name || user?.firstName || '',
      phone: p.phone || (user?.primaryPhoneNumber?.phoneNumber ?? '').replace(/^\+82/, '0').replace(/[^\d-]/g, ''),
    }));
  }, [acc.loading, first, user]);

  const districts = a.province ? DISTRICTS[a.province] ?? [] : [];
  const sel = (id: string, title: string, options: string[], value: string | undefined, set: (x: Answers, v: string) => Answers, hint?: string): Step => ({ id, kind: 'select', title, options, value, set, hint });
  const steps: Step[] = [
    sel('entity', '개인사업자인가요, 법인인가요?', ['개인', '법인'], a.entity, (x, v) => ({ ...x, entity: v as Answers['entity'] })),
    sel('openedYear', '언제 개업하셨나요?', OPEN_YEARS, a.openedYear ? (a.openedYear <= 2009 ? '2009년 이전' : `${a.openedYear}년`) : undefined, (x, v) => ({ ...x, openedYear: parseInt(v, 10) }), '사업자등록증 기준'),
    sel('openedMonth', '몇 월에 개업하셨나요?', MONTHS, a.openedMonth ? `${a.openedMonth}월` : undefined, (x, v) => ({ ...x, openedMonth: parseInt(v, 10) })),
    sel('industry', '어떤 업종인가요?', INDUSTRIES, a.industry, (x, v) => ({ ...x, industry: v }), '가장 가까운 것 하나'),
    sel('province', '사업장은 어느 지역에 있나요?', PROVINCE_ORDER, a.province, (x, v) => ({ ...x, province: v, district: x.province === v ? x.district : undefined })),
    ...(districts.length ? [sel('district', '어느 시·군·구인가요?', districts, a.district, (x, v) => ({ ...x, district: v }))] : []),
    ...REVENUE_YEARS.map((y) => sel(`rev${y}`, `${y}년 매출은 어느 정도였나요?`, REVENUE_BANDS, a.revenue[y], (x, v) => ({ ...x, revenue: { ...x.revenue, [y]: v } }), '1년 매출 합계')),
    sel('kcb', 'KCB 신용점수는 몇 점대인가요?', CREDIT_BANDS, a.creditKcb, (x, v) => ({ ...x, creditKcb: v }), '올크레딧 · 카카오뱅크·토스에서 볼 수 있어요'),
    sel('nice', 'NICE 신용점수는 몇 점대인가요?', CREDIT_BANDS, a.creditNice, (x, v) => ({ ...x, creditNice: v }), '나이스지키미 · 네이버페이에서 볼 수 있어요'),
    { id: 'loans', kind: 'custom', title: '지금 받고 있는 대출이 있나요?', hint: '기관을 누르고 금액을 고르세요' },
    { id: 'issues', kind: 'custom', title: '해당하는 것을 모두 골라 주세요', hint: '없으면 "해당 없음"' },
    sel('premises', '사업장은 임차인가요, 자가인가요?', ['임차', '자가'], a.premises, (x, v) => ({ ...x, premises: v as Answers['premises'], premisesValue: x.premises === v ? x.premisesValue : undefined })),
    sel('premisesValue', a.premises === '자가' ? '사업장 자산가치는 얼마쯤인가요?' : '사업장 보증금은 얼마인가요?', a.premises === '자가' ? ASSET_BANDS : DEPOSIT_BANDS, a.premisesValue, (x, v) => ({ ...x, premisesValue: v })),
    sel('home', '자택은 임차인가요, 자가인가요?', ['임차', '자가'], a.home, (x, v) => ({ ...x, home: v as Answers['home'], homeValue: x.home === v ? x.homeValue : undefined })),
    sel('homeValue', a.home === '자가' ? '자택 자산가치는 얼마쯤인가요?' : '자택 보증금은 얼마인가요?', a.home === '자가' ? ASSET_BANDS : DEPOSIT_BANDS, a.homeValue, (x, v) => ({ ...x, homeValue: v })),
    { id: 'contact', kind: 'custom', title: '어디로 안내드릴까요?', hint: '전화로 진단 결과를 알려드려요' },
  ];
  const idx = Math.min(i, steps.length - 1);
  const s = steps[idx];
  const go = (n: number) => { setErr(null); setLender(null); setI(Math.max(0, Math.min(steps.length - 1, n))); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const back = () => (idx === 0 ? (router.canGoBack() ? router.back() : router.replace('/funds' as never)) : go(idx - 1));

  const submit = async () => {
    if (!a.businessName.trim() || !a.name.trim()) { setErr('상호명과 이름을 적어 주세요.'); return; }
    if (!phoneOk(a.phone)) { setErr('휴대폰 번호를 확인해 주세요.'); return; }
    if (!consent) { setErr('동의가 필요해요.'); return; }
    const body: FundLeadInput = {
      requestKey: key.current, consent: true, entity: a.entity!, openedYear: a.openedYear!, openedMonth: a.openedMonth!, industry: a.industry!, province: a.province!, district: a.district ?? '',
      revenue: REVENUE_YEARS.map((y) => ({ year: y, band: a.revenue[y]! })), creditKcb: a.creditKcb!, creditNice: a.creditNice!, loans: a.loans, issues: a.issues,
      premises: a.premises!, premisesValue: a.premisesValue!, home: a.home!, homeValue: a.homeValue!, businessName: a.businessName.trim(), name: a.name.trim(), phone: a.phone.trim(),
    };
    setErr(null); setPhase('sending');
    const started = Date.now();
    try {
      await requestFundDiagnosis(body);
      await AsyncStorage.setItem(FUND_DONE_KEY, new Date().toISOString()).catch(() => {});
      setTimeout(() => setPhase('done'), Math.max(0, 2800 - (Date.now() - started)));
    } catch (e) { setPhase('form'); setErr(apiErrorMessage(e, '전달하지 못했어요. 다시 시도해 주세요.')); }
  };

  if (phase === 'sending') return <Sending />;
  if (phase === 'done') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.card }}>
        <View testID="fund-done" style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 16 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
            <Feather name="check" size={36} color="#FFFFFF" />
          </View>
          <T v="title" style={{ textAlign: 'center' }}>전달했어요</T>
          <T style={{ textAlign: 'center' }}>24시간 이내로{'\n'}누적 상담 {CONSULT_COUNT.toLocaleString('ko-KR')}건 이상의 전문가가{'\n'}대표님께 진단 결과를 안내드릴 예정이에요</T>
          <View style={{ backgroundColor: c.primarySoft, borderRadius: 14, padding: 16 }}>
            <T color={c.primary} style={{ textAlign: 'center', fontWeight: '700' }}>전화가 와서 "이로운사람들"이라고{'\n'}소속을 밝히면 성실히 답변해 주세요</T>
          </View>
          <Btn label="정책자금 목록 보기" onPress={() => router.replace('/funds' as never)} testID="fund-done-list" />
        </View>
      </SafeAreaView>
    );
  }

  const OptionRow = ({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) => (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 56, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.8 : 1 })}>
      <T style={{ flex: 1, fontWeight: on ? '700' : '500' }} color={on ? c.primary : c.foreground}>{label}</T>
      {on ? <Feather name="check" size={20} color={c.primary} /> : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.card }}>
      <View style={{ paddingHorizontal: 12, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable testID="fund-back" accessibilityRole="button" accessibilityLabel="이전" onPress={back} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-left" size={28} color={c.foreground} />
        </Pressable>
        <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: idx + 1 }} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.secondary, overflow: 'hidden' }}>
          <View style={{ width: `${((idx + 1) / steps.length) * 100}%`, height: 6, backgroundColor: c.primary }} />
        </View>
        <T v="small" color={c.mutedForeground} style={{ width: 52, textAlign: 'right' }}>{idx + 1} / {steps.length}</T>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <T v="title" testID="fund-title">{s.title}</T>
        {s.hint ? <T v="small" color={c.mutedForeground}>{s.hint}</T> : null}

        {s.kind === 'select' ? s.options.map((o) => (
          <OptionRow key={o} testID={`fund-opt-${o}`} label={o} on={s.value === o} onPress={() => { setA((x) => s.set(x, o)); go(idx + 1); }} />
        )) : null}

        {s.id === 'loans' ? (
          <>
            {a.loans.map((l, n) => (
              <View key={n} testID={`fund-loan-${n}`} style={{ minHeight: 52, borderRadius: 12, backgroundColor: c.secondary, paddingLeft: 16, paddingRight: 4, flexDirection: 'row', alignItems: 'center' }}>
                <T style={{ flex: 1, fontWeight: '700' }}>{l.lender} · {l.amount}</T>
                <Pressable accessibilityRole="button" accessibilityLabel={`${l.lender} 대출 지우기`} onPress={() => setA((x) => ({ ...x, loans: x.loans.filter((_, k) => k !== n) }))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={20} color={c.mutedForeground} />
                </Pressable>
              </View>
            ))}
            {!lender ? (
              <>
                <T v="label" style={{ marginTop: 4 }}>{a.loans.length ? '대출 더 추가' : '어디서 받으셨나요?'}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {LENDERS.map((l) => (
                    <Pressable key={l} testID={`fund-lender-${l}`} accessibilityRole="button" onPress={() => setLender(l)}
                      style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' }}>
                      <T style={{ fontWeight: '600' }}>{l}</T>
                    </Pressable>
                  ))}
                </View>
                <Btn label={a.loans.length ? '다음' : '대출 없음'} kind={a.loans.length ? 'primary' : 'secondary'} onPress={() => go(idx + 1)} testID="fund-loans-next" style={{ marginTop: 8 }} />
              </>
            ) : (
              <>
                <T v="label" style={{ marginTop: 4 }}>{lender} 대출 금액</T>
                {LOAN_BANDS.map((b) => <OptionRow key={b} testID={`fund-amount-${b}`} label={b} on={false} onPress={() => { setA((x) => ({ ...x, loans: [...x.loans, { lender, amount: b }] })); setLender(null); }} />)}
                <Btn kind="ghost" label="취소" onPress={() => setLender(null)} />
              </>
            )}
          </>
        ) : null}

        {s.id === 'issues' ? (
          <>
            {ISSUES.map((o) => {
              const on = a.issues.includes(o);
              return <OptionRow key={o} testID={`fund-issue-${o}`} label={o} on={on} onPress={() => setA((x) => ({ ...x, issues: on ? x.issues.filter((k) => k !== o) : [...x.issues, o] }))} />;
            })}
            {a.issues.length === 0
              ? <OptionRow testID="fund-issue-none" label="해당 없음" on={false} onPress={() => go(idx + 1)} />
              : <Btn label="다음" onPress={() => go(idx + 1)} testID="fund-issues-next" />}
          </>
        ) : null}

        {s.id === 'contact' ? (
          <>
            <Field testID="fund-biz" label="상호명" value={a.businessName} onChangeText={(v) => setA((x) => ({ ...x, businessName: v }))} maxLength={60} />
            <Field testID="fund-name" label="이름" value={a.name} onChangeText={(v) => setA((x) => ({ ...x, name: v }))} maxLength={30} autoComplete="name" />
            <Field testID="fund-phone" label="휴대폰 번호" value={a.phone} onChangeText={(v) => setA((x) => ({ ...x, phone: v }))} keyboardType="phone-pad" placeholder="010-1234-5678" autoComplete="tel" />
            <Toggle testID="fund-consent" label="[필수] 진단을 위한 정보 수집·이용 동의" desc="신용점수·대출·연체 이력 포함 · 전화 안내에만 써요" value={consent} onChange={setConsent} />
            <Btn label="진단 요청하기" onPress={submit} testID="fund-submit" />
          </>
        ) : null}
        {err ? <T v="small" color={c.destructive} testID="fund-error">{err}</T> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Sending() {
  const c = useColors();
  const [pct, setPct] = useState(1);
  useEffect(() => {
    const started = Date.now(), total = 2600;
    const h = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / total);
      setPct(Math.max(1, Math.round(100 * (1 - Math.pow(1 - t, 2)))));
      if (t >= 1) clearInterval(h);
    }, 40);
    return () => clearInterval(h);
  }, []);
  return (
    <View testID="fund-sending" style={{ flex: 1, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 }}>
      <T v="title" style={{ textAlign: 'center' }}>이로운사람들{'\n'}정책자금 전문가님에게{'\n'}전달 중이에요</T>
      <T v="hero" color={c.primary} style={{ fontSize: 56, lineHeight: 66 }} accessibilityRole="text">{pct}%</T>
      <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ alignSelf: 'stretch', height: 14, borderRadius: 7, backgroundColor: c.secondary, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 14, borderRadius: 7, backgroundColor: c.primary }} />
      </View>
    </View>
  );
}
