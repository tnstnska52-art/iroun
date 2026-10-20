import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, saveProfile, type Profile } from '@workspace/api-client-react';
import { Btn, Chip, Loading, Notice, Page, T, Wrap } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { apiErrorMessage } from '@/lib/text';

const THIS_YEAR = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
/** 대표자 출생연도: 만 18세~85세 */
const BIRTH_YEARS = Array.from({ length: 68 }, (_, i) => THIS_YEAR - 18 - i);

/**
 * 지원금 패키지 고객용 정밀 조건. 대표자 출생연도·사업자 형태·여성 대표 여부를 더 받아
 * 청년·법인/개인·여성 전용 공고까지 정확히 거른다. 무료 고객에게는 묻지 않는다.
 */
export default function Precise() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const profile = acc.me?.profile as Profile | undefined;
  const biz = profile?.businesses[0] as (Profile['businesses'][number] & { womanOwned?: '예' | '아니오' }) | undefined;
  const [birthYear, setBirthYear] = useState<number | undefined>();
  const [entity, setEntity] = useState<'개인' | '법인' | undefined>();
  const [woman, setWoman] = useState<'예' | '아니오' | undefined>();
  const [showYears, setShowYears] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const filled = React.useRef(false);
  useEffect(() => {
    if (filled.current || !profile) return;
    filled.current = true;
    setBirthYear(profile.personal?.birthYear);
    setEntity(biz?.entity === '개인' || biz?.entity === '법인' ? biz.entity : undefined);
    setWoman(biz?.womanOwned);
  }, [profile, biz]);

  if (acc.loading || (acc.isSignedIn && !acc.me)) return <Page back title="정밀 조건"><Loading rows={3} /></Page>;
  if (!profile || !biz) {
    return (
      <Page back title="정밀 조건">
        <Notice tone="info">먼저 사업장 조건(업종·지역 등)을 골라 주세요.</Notice>
        <Btn label="사업장 조건 고르기" onPress={() => router.replace('/onboarding' as never)} testID="precise-onboarding" />
      </Page>
    );
  }
  const ready = !!birthYear && !!entity && !!woman;
  const save = async () => {
    if (!ready) return;
    setBusy(true); setErr('');
    const next: Profile = {
      ...profile,
      personal: { ...profile.personal, birthYear },
      businesses: profile.businesses.map((b, i) => (i === 0 ? ({ ...b, entity, womanOwned: woman } as Profile['businesses'][number]) : b)),
    };
    try {
      await saveProfile(next);
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      router.replace('/result' as never);
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally { setBusy(false); }
  };
  const Q = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 18, gap: 10 }}>
      <T v="h3">{title}</T>
      {hint ? <T v="small" color={c.mutedForeground}>{hint}</T> : null}
      {children}
    </View>
  );
  return (
    <Page back title="정확하게 골라 드릴게요" subtitle="3가지만 더 알려 주시면, 대표님 조건에 확실히 맞는 지원사업만 보여드려요."
      footer={<>
        {err ? <Notice tone="error">{err}</Notice> : null}
        <Btn label="저장하고 결과 보기" onPress={save} disabled={!ready} loading={busy} testID="precise-save" />
      </>}>
      <Q title="대표자 출생연도" hint="청년(만 39세 이하)·중장년 전용 사업을 거를 때만 써요">
        {birthYear && !showYears ? (
          <Wrap><Chip label={`${birthYear}년생`} selected onPress={() => setShowYears(true)} testID="precise-birth-selected" /></Wrap>
        ) : (
          <Wrap>{BIRTH_YEARS.map((y) => <Chip key={y} label={`${y}`} selected={birthYear === y} onPress={() => { setBirthYear(y); setShowYears(false); }} testID={`precise-birth-${y}`} />)}</Wrap>
        )}
      </Q>
      <Q title="사업자 형태" hint="사업자등록증 기준">
        <Wrap>{(['개인', '법인'] as const).map((v) => <Chip key={v} label={`${v}사업자`} selected={entity === v} onPress={() => setEntity(v)} testID={`precise-entity-${v}`} />)}</Wrap>
      </Q>
      <Q title="대표자가 여성인가요?" hint="여성기업 전용 사업을 거를 때만 써요">
        <Wrap>{(['예', '아니오'] as const).map((v) => <Chip key={v} label={v} selected={woman === v} onPress={() => setWoman(v)} testID={`precise-woman-${v}`} />)}</Wrap>
      </Q>
    </Page>
  );
}
