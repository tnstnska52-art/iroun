import React from 'react';
import { DeleteFlow } from '@/components/DeleteFlow';
import { Disclaimer, FooterLinks, Page } from '@/components/ui';

export default function DeleteAccount() {
  return (
    <Page back title="회원 탈퇴">
      <DeleteFlow />
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
