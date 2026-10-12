import React, { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteMyDocument, listMyDocuments, uploadMyDocument, type DocMeta } from '@workspace/api-client-react';
import { Btn, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { docGuide, docKey } from '@/lib/doc-guide';

export const DOCS_KEY = ['my-documents'];
export function useMyDocuments(enabled: boolean) {
  const q = useQuery({ queryKey: DOCS_KEY, queryFn: () => listMyDocuments(), enabled, staleTime: 5000 });
  const docs = q.data?.documents ?? [];
  const find = (name: string): DocMeta | undefined => docs.find((d) => docKey(d.name) === docKey(name));
  return { docs, find, loading: enabled && q.isLoading, missing: (names: string[]) => names.filter((n) => !find(n)) };
}
const MAX = 10 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

/** 서류 한 줄: 어디서 받는지 안내하고, 받은 파일을 올린다(canUpload 일 때). */
function DocRow({ name, doc, canUpload, last }: { name: string; doc?: DocMeta; canUpload: boolean; last: boolean }) {
  const c = useColors();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const g = docGuide(name);
  const send = async (uri: string, filename: string, mime: string, size?: number) => {
    const type = mime === 'image/jpg' ? 'image/jpeg' : mime;
    if (!TYPES.includes(type)) { setErr('PDF나 사진(JPG, PNG)만 올릴 수 있어요.'); return; }
    if (size && size > MAX) { setErr('파일이 너무 커요. 10MB 이하로 올려 주세요.'); return; }
    setBusy(true); setErr(null);
    try {
      const blob = await (await fetch(uri)).blob();
      if (blob.size > MAX) { setErr('파일이 너무 커요. 10MB 이하로 올려 주세요.'); setBusy(false); return; }
      await uploadMyDocument(name, blob, filename, type);
      await qc.invalidateQueries({ queryKey: DOCS_KEY });
    } catch (e) { setErr(apiErrorMessage(e, '올리지 못했어요. 다시 시도해 주세요.')); }
    setBusy(false);
  };
  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    const f = r.canceled ? undefined : r.assets?.[0];
    if (f) await send(f.uri, f.name || `${name}.pdf`, f.mimeType || (f.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'), f.size);
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setErr('카메라 사용을 허용해 주세요.'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    const f = r.canceled ? undefined : r.assets?.[0];
    if (f) await send(f.uri, f.fileName || `${name}.jpg`, f.mimeType || 'image/jpeg', f.fileSize);
  };
  const remove = async () => { if (!doc) return; setBusy(true); try { await deleteMyDocument(doc.id); await qc.invalidateQueries({ queryKey: DOCS_KEY }); } catch (e) { setErr(apiErrorMessage(e)); } setBusy(false); };

  return (
    <View testID={`doc-${name}`} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}. ${doc ? '등록됨' : canUpload ? '아직 등록 안 함' : ''}. 어디서 받는지 보기`} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        {canUpload ? <Feather name={doc ? 'check-circle' : 'circle'} size={22} color={doc ? c.success : c.mutedForeground} /> : <Feather name="file-text" size={20} color={c.primary} />}
        <View style={{ flex: 1 }}>
          <T v="label">{name}</T>
          <T v="small" color={doc ? c.success : c.mutedForeground}>{doc ? `등록됨 · ${doc.filename}` : g.where}</T>
        </View>
        <T v="small" color={c.primary} style={{ fontWeight: '700' }}>{open ? '접기' : '받는 법'}</T>
      </Pressable>
      {open ? (
        <View testID={`doc-guide-${name}`} style={{ backgroundColor: c.secondary, borderRadius: 12, padding: 14, gap: 6 }}>
          <T v="label">{g.where}</T>
          {g.how.map((h, i) => <T key={i} v="small">{i + 1}. {h}</T>)}
          {g.note ? <T v="small" color={c.mutedForeground}>{g.note}</T> : null}
          {g.url ? <Btn kind="secondary" icon="external-link" label={`${g.where} 열기`} onPress={() => Linking.openURL(g.url as string)} testID={`doc-open-${name}`} /> : null}
        </View>
      ) : null}
      {canUpload ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Btn kind={doc ? 'secondary' : 'primary'} icon="upload" label={doc ? '다시 올리기' : '파일 올리기'} loading={busy} onPress={pickFile} testID={`doc-upload-${name}`} /></View>
          {Platform.OS !== 'web' ? <View style={{ flex: 1 }}><Btn kind="secondary" icon="camera" label="사진 찍기" disabled={busy} onPress={takePhoto} testID={`doc-camera-${name}`} /></View> : null}
          {doc ? <Pressable accessibilityRole="button" accessibilityLabel={`${name} 지우기`} disabled={busy} onPress={remove} style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}><Feather name="trash-2" size={20} color={c.mutedForeground} /></Pressable> : null}
        </View>
      ) : null}
      {err ? <T v="small" color={c.destructive}>{err}</T> : null}
    </View>
  );
}

/** 이 공고에 필요한 서류 목록. 계약 고객은 여기서 바로 올린다. */
export function DocList({ names, canUpload }: { names: string[]; canUpload: boolean }) {
  const { find } = useMyDocuments(canUpload);
  return <View>{names.map((n, i) => <DocRow key={n} name={n} doc={canUpload ? find(n) : undefined} canUpload={canUpload} last={i === names.length - 1} />)}</View>;
}
