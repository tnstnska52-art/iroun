import React from 'react';
import { View } from 'react-native';
import { T } from '@/components/ui';
import { LINE_MAX, shortLines } from '@/lib/lines';

/** 긴 안내 글을 한 줄 15자 안의 짧은 줄로 끊어 보여준다. 문장 사이는 조금 띄운다. */
export function ShortText({ text, v = 'body', color, max = LINE_MAX, testID }: {
  text: string; v?: 'body' | 'small' | 'label' | 'h3'; color?: string; max?: number; testID?: string;
}) {
  const groups = shortLines(text, max);
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {groups.map((lines, i) => <T key={i} v={v} color={color}>{lines.join('\n')}</T>)}
    </View>
  );
}
