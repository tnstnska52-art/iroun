import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Linking } from 'react-native';
import { Btn, Card, Chip, Disclaimer, FooterLinks, Notice, Page, T, Wrap } from '@/components/ui';

type Sec = 'privacy' | 'terms' | 'support';
const DOCS: Record<Sec, { title: string; blocks: [string, string][] }> = {
  privacy: {
    title: '개인정보처리방침',
    blocks: [
      ['운영 주체', '주식회사 이로운사람들 · 대표 김진영 · 사업자등록번호 659-81-03910 · 경기도 시흥시 서울대학로 59-69, 8층 830호'],
      ['필수 수집 항목', '휴대폰 번호, 비밀번호(암호화 저장), 이름, 회원 식별자. 카카오 로그인 시 카카오 회원 식별자와 카카오가 제공하는 이름·연락처. 이용 기록, 접속 일시, 이용권·동의 상태.'],
      ['선택 수집 항목', '맞춤 확인(별도 동의): 출생연도, 거주 지역, 소득 구간, 가구 정보, 주거 형태, 사업장 정보. 정책자금 상담 신청: 매출·신용점수 구간, 기존 대출 현황 등. 서류함에 직접 올린 서류. 알림 허용 시 기기 알림 토큰.'],
      ['이용 목적', '공개된 지원금·환급금·정책자금 공고와 입력한 조건 비교, 마감 알림(동의 시), 상담·신청 지원 처리, 계약 이용권 적용, 부정 이용 방지.'],
      ['보유 기간', '탈퇴 시 회원 정보·입력 조건·서류·상담 신청·알림 토큰은 지체 없이 삭제합니다. 계약·결제 기록 5년, 분쟁 처리 기록 3년, 접속 기록 3개월, 체험 재사용 방지용 변환값은 체험 후 1년, 운영 감사 기록은 5년 보관 후 삭제합니다.'],
      ['처리 위탁 및 국외 이전', 'Clerk(미국): 로그인·본인 확인. Render(싱가포르 서버): 앱 서버·데이터베이스. Expo(미국): 푸시 알림 전달. 개인정보를 제3자에게 판매하거나 광고에 쓰지 않습니다.'],
      ['이용자의 권리', '내 정보 화면에서 직접 열람·수정·동의 철회·회원 탈퇴를 할 수 있고, 아래 연락처로도 요청할 수 있습니다. 스토어 구독은 탈퇴로 해지되지 않으니 스토어에서 해지해 주세요.'],
      ['개인정보 보호책임자', '대표이사 김진영 · tnstnska52@naver.com · 010-8243-3126 (평일 09:00~18:00)'],
    ],
  },
  terms: {
    title: '이용약관',
    blocks: [
      ['서비스 성격', '주식회사 이로운사람들이 제공하는 민간 정보 서비스이며 정부기관이 아닙니다. 공개된 지원금·환급금·정책자금 공고를 공식 출처와 함께 모아 보여줍니다.'],
      ['정보 출처 (공식 사이트)', '기업마당 www.bizinfo.go.kr · 정부24 www.gov.kr · K-Startup www.k-startup.go.kr · 복지로 www.bokjiro.go.kr · 공공데이터포털 www.data.go.kr · 중소벤처기업진흥공단 www.kosmes.or.kr · 소상공인시장진흥공단 www.semas.or.kr · 국세청 홈택스 www.hometax.go.kr. 각 공고 화면의 "공식 신청 페이지"에서 원문으로 바로 이동할 수 있습니다.'],
      ['금전 거래 없음', '회사는 대출을 직접 하거나 중개하지 않으며, 지원금이나 환급금을 대신 지급하지 않습니다.'],
      ['이용 범위', '공고 열람은 로그인 없이 무료입니다. 맞춤 확인은 1회 무료 체험(시작 후 72시간) 또는 회사와의 계약 이용권으로 제공됩니다.'],
      ['결과의 한계', '조건 비교는 입력한 정보 기준의 참고 결과이며 선정·지급·금액을 보장하지 않습니다. 신청 전 공식 출처에서 최신 내용을 확인해 주세요.'],
      ['신청 지원', '회사 신청 지원 요청은 담당자가 자격·서류·마감을 확인하는 업무 요청이며 기관 신청 완료를 뜻하지 않습니다.'],
      ['탈퇴', '내 정보 화면에서 언제든 탈퇴할 수 있습니다.'],
    ],
  },
  support: {
    title: '고객 지원',
    blocks: [
      ['문의처', '이메일 tnstnska52@naver.com · 전화 010-8243-3126 (평일 09:00~18:00)'],
      ['열람·정정·동의 철회', '내 정보 화면에서 직접 고치거나 동의를 철회할 수 있습니다.'],
      ['회원 탈퇴', '앱의 내 정보 화면에서 탈퇴할 수 있고, 앱 없이도 이메일·전화로 요청할 수 있습니다.'],
      ['지원 정보 오류', '공식 출처와 다른 내용을 발견하면 상세 화면의 공식 출처 링크로 기관 안내를 먼저 확인해 주세요.'],
    ],
  },
};
const FULL: Record<Sec, string> = { privacy: '/privacy', terms: '/terms', support: '/delete-account' };
const SITE = process.env.EXPO_PUBLIC_API_URL || 'https://iroun-api.onrender.com';

export default function Legal() {
    const p = useLocalSearchParams<{ section?: string }>();
  const [sec, setSec] = useState<Sec>((['privacy', 'terms', 'support'] as string[]).includes(p.section ?? '') ? (p.section as Sec) : 'privacy');
  const d = DOCS[sec];
  return (
    <Page back title={d.title}>
      <Wrap>
        <Chip label="개인정보" selected={sec === 'privacy'} onPress={() => setSec('privacy')} testID="legal-privacy" />
        <Chip label="이용약관" selected={sec === 'terms'} onPress={() => setSec('terms')} testID="legal-terms" />
        <Chip label="고객 지원" selected={sec === 'support'} onPress={() => setSec('support')} testID="legal-support" />
      </Wrap>
      {d.blocks.map(([h, b]) => (
        <Card key={h}><T v="h3">{h}</T><T>{b}</T></Card>
      ))}
      <Btn kind="secondary" icon="external-link" label={sec === 'support' ? '계정 삭제 안내 전체 보기' : '전체 문서 보기'} onPress={() => { void Linking.openURL(SITE + FULL[sec]); }} testID="legal-full" />
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
