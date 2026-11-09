import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { deleteMyDocument, fetchMyDocument } from '@workspace/api-client-react';
import { Disclaimer, Loading, Page, T } from '@/components/ui';
import { DOCS_KEY, DocShelf, useMyDocuments } from '@/components/DocList';
import { DOC_KINDS } from '../../api-server/src/lib/doc-kinds';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { apiErrorMessage } from '@/lib/text';
import { fmtDate } from '@/lib/util';

/** 내 서류함: 올려 둔 서류를 보고 지운다. 한 번 올린 서류는 다른 지원금에도 그대로 쓰인다. */
export default function Documents() {
  const c = useColors();
  const qc = useQueryClient();
  const acc = useAccount();
  const contract = !!acc.me?.entitlement.contractActive;
  const { docs, loading } = useMyDocuments(contract);
  const [msg, setMsg] = useState<string | null>(null);
  const view = async (id: string) => {
    try {
      const blob = await fetchMyDocument(id);
      if (Platform.OS === 'web') window.open(URL.createObjectURL(blob), '_blank');
      else setMsg('휴대폰에서는 아직 미리 볼 수 없어요. 파일은 안전하게 저장돼 있어요.');
    } catch (e) { setMsg(apiErrorMessage(e)); }
  };
  const remove = async (id: string) => { try { await deleteMyDocument(id); await qc.invalidateQueries({ queryKey: DOCS_KEY }); } catch (e) { setMsg(apiErrorMessage(e)); } };
  return (
    <Page back title="내 서류함">
      <T v="small" color={c.mutedForeground}>여기 담아 둔 서류는{'\n'}신청할 때 바로 가져와요</T>
      {!contract ? <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 20 }}><T color={c.mutedForeground}>서류 등록은 계약 고객만 할 수 있어요</T></View>
        : loading ? <Loading rows={2} />
        : docs.length === 0 ? <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 20 }}><T color={c.mutedForeground}>아직 담아 둔 서류가 없어요{'\n'}아래에서 자주 쓰는 서류를{'\n'}미리 담아 두세요</T></View>
        : (
          <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
            {docs.map((d, i) => (
              <View key={d.id} testID={`mydoc-${d.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, borderBottomWidth: i === docs.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
                <Feather name="check-circle" size={22} color={c.success} />
                <Pressable accessibilityRole="button" accessibilityLabel={`${d.name} 보기`} onPress={() => view(d.id)} style={{ flex: 1, paddingVertical: 10 }}>
                  <T v="label">{d.name}</T>
                  <T v="small" color={c.mutedForeground} numberOfLines={1}>{d.filename} · {fmtDate(d.created_at)}</T>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${d.name} 지우기`} onPress={() => remove(d.id)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="trash-2" size={20} color={c.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      {msg ? <T v="small" color={c.mutedForeground}>{msg}</T> : null}
      {contract ? (
        <>
          <T v="h3" style={{ marginTop: 8 }}>자주 쓰는 서류 담아 두기</T>
          <T v="small" color={c.mutedForeground}>미리 담아 두면{'\n'}신청이 훨씬 빨라져요</T>
          <View testID="doc-shelf" style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
            <DocShelf names={DOC_KINDS.map((k) => k.label).filter((n) => !docs.some((d) => d.name === n))} />
          </View>
        </>
      ) : null}
      <Disclaimer />
    </Page>
  );
}
