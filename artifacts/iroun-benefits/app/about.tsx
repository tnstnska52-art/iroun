import React from 'react';
import { useRouter } from 'expo-router';
import { Btn, Card, Disclaimer, FooterLinks, Page, T } from '@/components/ui';

export default function About() {
  const router = useRouter();
  return (
    <Page back title="이로운혜택 소개" subtitle="사업자이면서 시민·가구로도 받을 수 있는 지원을 모아 보여드립니다.">
      <Card>
        <T v="h3">무엇을 하나요</T>
        <T>정부·지자체 등이 공개한 지원금과 환급금을 공식 출처와 함께 모아, 사업자·개인·가구 대상별로 찾아볼 수 있게 합니다.</T>
      </Card>
      <Card>
        <T v="h3">무엇을 하지 않나요</T>
        <T>신청을 대신 접수하지 않고, 받을 금액을 알려주지 않습니다. 선정과 지급은 각 기관이 결정합니다.</T>
      </Card>
      <Card>
        <T v="h3">누구나 무료로</T>
        <T>지원 공지와 환급금 안내는 로그인 없이 볼 수 있습니다. 내 조건과 비교하는 맞춤 확인은 회원 이용권이 필요합니다.</T>
      </Card>
      <Btn label="혜택 둘러보기" icon="search" onPress={() => router.push('/benefits')} />
      <Btn kind="secondary" label="개인정보처리방침" onPress={() => router.push({ pathname: '/legal', params: { section: 'privacy' } })} />
      <Btn kind="secondary" label="이용약관" onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })} />
      <Btn kind="secondary" label="회원 탈퇴 요청" onPress={() => router.push('/delete-request')} />
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
