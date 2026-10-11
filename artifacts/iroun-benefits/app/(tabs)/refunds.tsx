import React from 'react';
import { View } from 'react-native';
import { Page, T } from '@/components/ui';

/** 숨김 호환 경로. 준비 중 표시만 하며 새 기능·링크를 두지 않는다. */
export default function RefundsScreen() {
  return (
    <Page tab>
      <View testID="refunds-placeholder" style={{ alignItems: 'center', paddingVertical: 96 }}>
        <T v="title" style={{ textAlign: 'center' }}>준비 중</T>
      </View>
    </Page>
  );
}
