import React, { useState } from 'react';
import { Linking, Modal, Platform, Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteMyDocument, listMyDocuments, uploadMyDocument, type DocMeta } from '@workspace/api-client-react';
import { Btn, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { docGuide } from '@/lib/doc-guide';
import { docMatchKey } from '../../api-server/src/lib/doc-kinds';

export const DOCS_KEY = ['my-documents'];
export function useMyDocuments(enabled: boolean) {
  const q = useQuery({ queryKey: DOCS_KEY, queryFn: () => listMyDocuments(), enabled, staleTime: 5000 });
  const docs = q.data?.documents ?? [];
  // 같은 종류의 서류(사업자등록증 ↔ 사업자등록증명원)는 내 서류함에 하나만 있으면 가져온다(서버와 같은 규칙).
  const find = (name: string): DocMeta | undefined => docs.find((d) => docMatchKey(d.name) === docMatchKey(name));
  return { docs, find, loading: enabled && q.isLoading, refetch: q.refetch, missing: (names: string[]) => names.filter((n) => !find(n)) };
}
const MAX = 10 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

/** 서류 한 줄: 어디서 받는지 안내하고, 받은 파일을 올린다(canUpload 일 때). */
function DocRow({ name, doc, canUpload, last, refetch, inBox }: { name: string; doc?: DocMeta; canUpload: boolean; last: boolean; refetch?: () => Promise<{ data?: { documents: DocMeta[] } }>; /** 내 서류함 화면: 가져오기 대신 바로 담기 */ inBox?: boolean }) {
  const c = useColors();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
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
      setMissingOpen(false);
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

  // 내 서류함에서 가져오기: 없으면 '내 서류함에 없는 서류예요' 창에서 받는 법과 올리기를 보여준다.
  const fetchFromBox = async () => {
    setChecking(true);
    const r = await refetch?.();
    setChecking(false);
    const have = (r?.data?.documents ?? []).some((d) => docMatchKey(d.name) === docMatchKey(name));
    if (!have) setMissingOpen(true);
  };
  const guide = (
    <View testID={`doc-guide-${name}`} style={{ backgroundColor: c.secondary, borderRadius: 12, padding: 14, gap: 6 }}>
      <T v="label">{g.where}에서 받아요</T>
      {g.how.map((h, i) => <T key={i} v="small">{i + 1}. {h}</T>)}
      {g.note ? <T v="small" color={c.mutedForeground}>{g.note}</T> : null}
      {g.url ? <Btn kind="secondary" icon="external-link" label={`${g.where} 열기`} onPress={() => Linking.openURL(g.url as string)} testID={`doc-open-${name}`} /> : null}
    </View>
  );
  const uploadButtons = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Btn kind="primary" icon="upload" label="파일 담기" loading={busy} onPress={async () => { await pickFile(); }} testID={`doc-upload-${name}`} /></View>
      {Platform.OS !== 'web' ? <View style={{ flex: 1 }}><Btn kind="secondary" icon="camera" label="사진 찍기" disabled={busy} onPress={takePhoto} testID={`doc-camera-${name}`} /></View> : null}
    </View>
  );

  return (
    <View testID={`doc-${name}`} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}. ${doc ? '내 서류함에서 가져옴' : canUpload ? '아직 없음' : ''}. 받는 법 보기`} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        {canUpload ? <Feather name={doc ? 'check-circle' : 'circle'} size={22} color={doc ? c.success : c.mutedForeground} /> : <Feather name="file-text" size={20} color={c.primary} />}
        <View style={{ flex: 1 }}>
          <T v="label">{name}</T>
          <T v="small" color={doc ? c.success : c.mutedForeground}>{doc ? (inBox ? '담아 뒀어요' : '내 서류함에서 가져왔어요') : g.where}</T>
        </View>
        <T v="small" color={c.primary} style={{ fontWeight: '700' }}>{open ? '접기' : '받는 법'}</T>
      </Pressable>
      {open ? guide : null}
      {canUpload && !doc && inBox ? uploadButtons : null}
      {canUpload && !doc && !inBox ? (
        <Btn kind="primary" icon="folder" label="내 서류함에서 가져오기" loading={checking} onPress={fetchFromBox} testID={`doc-fetch-${name}`} />
      ) : null}
      {canUpload && doc ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T v="small" color={c.mutedForeground} style={{ flex: 1 }} numberOfLines={1}>{doc.name} · {doc.filename}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={`${name} 지우기`} disabled={busy} onPress={remove} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Feather name="trash-2" size={20} color={c.mutedForeground} /></Pressable>
        </View>
      ) : null}
      {err ? <T v="small" color={c.destructive}>{err}</T> : null}

      <Modal visible={missingOpen} transparent animationType="fade" onRequestClose={() => setMissingOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View testID={`doc-missing-${name}`} style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="alert-circle" size={24} color={c.warning} />
              <T v="h2" style={{ flex: 1 }}>내 서류함에 없는{'\n'}서류예요</T>
            </View>
            <T>{name}</T>
            {guide}
            <T v="small" color={c.mutedForeground}>받은 파일을 담아 두면{'\n'}다른 지원금에도 그대로 쓰여요</T>
            {uploadButtons}
            {err ? <T v="small" color={c.destructive}>{err}</T> : null}
            <Btn kind="ghost" label="닫기" onPress={() => setMissingOpen(false)} testID={`doc-missing-close-${name}`} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** 이 공고에 필요한 서류 목록. 계약 고객은 여기서 바로 올린다. */
export function DocList({ names, canUpload }: { names: string[]; canUpload: boolean }) {
  const { find, refetch } = useMyDocuments(canUpload);
  return <View>{names.map((n, i) => <DocRow key={n} name={n} doc={canUpload ? find(n) : undefined} canUpload={canUpload} last={i === names.length - 1} refetch={refetch as never} />)}</View>;
}

/** 내 서류함: 자주 필요한 서류를 미리 담아 둔다. 신청할 때 여기서 가져간다. */
export function DocShelf({ names }: { names: string[] }) {
  const { find, refetch } = useMyDocuments(true);
  return <View>{names.map((n, i) => <DocRow key={n} name={n} doc={find(n)} canUpload last={i === names.length - 1} refetch={refetch as never} inBox />)}</View>;
}
