import React from 'react';
import { DeleteFlow } from '@/components/DeleteFlow';
import { Card, Disclaimer, FooterLinks, Page, T } from '@/components/ui';

export default function DeleteRequest() {
  return (
    <Page back title="계정 삭제 요청" subtitle="앱을 설치하지 않아도 이 페이지에서 계정 삭제를 요청할 수 있습니다.">
      <Card>
        <T v="h3">진행 방법</T>
        <T>1. 가입한 이메일로 로그인합니다.</T>
        <T>2. 안내를 읽고 확인 문구를 입력합니다.</T>
        <T>3. 요청이 접수되면 계정 정보가 삭제 처리됩니다.</T>
      </Card>
      <DeleteFlow returnPath="/delete-request" />
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
