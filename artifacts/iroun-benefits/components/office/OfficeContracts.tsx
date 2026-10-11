import React, { useState } from 'react';
import { View } from 'react-native';
import { saveOfficeContract } from '@workspace/api-client-react';
import { Badge, Btn, Card, Empty, Field, Notice, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { kst, kstDate, OfficeContract, toKstIso } from '@/lib/service';
import type { OfficeProps } from './shared';

export function OfficeContracts({ o, refresh }: OfficeProps) {
  const c = useColors();
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);

  const reset = () => { setEditId(null); setCode(''); setStart(''); setEnd(''); setReason(''); setEvidence(''); };
  const edit = (k: OfficeContract) => { setEditId(k.id); setStart(kstDate(k.starts_at)); setEnd(kstDate(k.ends_at)); setReason(k.reason ?? ''); setEvidence(k.evidence ?? ''); setCode(''); setMsg(null); };
  const submit = async () => {
    setMsg(null);
    const s = toKstIso(start, false), e = toKstIso(end, true);
    if (!s || !e) { setMsg({ t: 'error', s: '날짜를 2025-03-01 처럼 실제 있는 날로 적어 주세요.' }); return; }
    if (new Date(e) <= new Date(s)) { setMsg({ t: 'error', s: '끝나는 날은 시작하는 날보다 뒤여야 합니다.' }); return; }
    if (!editId && !code.trim()) { setMsg({ t: 'error', s: '고객이 받은 계정 연결번호가 필요합니다. 이름만으로는 연결할 수 없습니다.' }); return; }
    if (!reason.trim() || !evidence.trim()) { setMsg({ t: 'error', s: '사유와 근거를 적어 주세요.' }); return; }
    setBusy(true);
    try {
      await saveOfficeContract({ ...(editId ? { id: editId } : { accountCode: code.trim() }), startsAt: s, endsAt: e, reason: reason.trim(), evidence: evidence.trim() });
      await refresh(); setMsg({ t: 'ok', s: '계약을 기록했습니다.' }); reset();
    } catch (x) { setMsg({ t: 'error', s: apiErrorMessage(x) }); }
    setBusy(false);
  };
  const revoke = async (k: OfficeContract) => {
    setBusy(true); setMsg(null);
    try {
      await saveOfficeContract({ id: k.id, startsAt: k.starts_at, endsAt: k.ends_at, reason: k.reason ?? '회수', evidence: k.evidence ?? '회수', revoke: true });
      await refresh(); setMsg({ t: 'ok', s: '계약을 회수했습니다.' });
    } catch (x) { setMsg({ t: 'error', s: apiErrorMessage(x) }); }
    setBusy(false);
  };
  return (
    <>
      <Notice tone="info" title="연간 패키지 169만원">회사와 고객 사이의 계약 기록입니다. 앱 안 결제는 없습니다. 스토어 심사 적합성은 아직 검토하지 않았습니다.</Notice>
      <Card>
        <T v="h3">{editId ? '계약 수정' : '새 계약 기록'}</T>
        {!editId ? <Field label="고객 계정 연결번호" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} hint="고객이 앱에서 받은 15분 번호입니다." testID="office-contract-code" /> : null}
        <Field label="시작일 (한국 시간 0시)" value={start} onChangeText={setStart} placeholder="2025-03-01" keyboardType="numbers-and-punctuation" testID="office-contract-start" />
        <Field label="종료일 (한국 시간 23시 59분)" value={end} onChangeText={setEnd} placeholder="2026-02-28" keyboardType="numbers-and-punctuation" testID="office-contract-end" />
        <Field label="사유" value={reason} onChangeText={setReason} testID="office-contract-reason" />
        <Field label="근거" value={evidence} onChangeText={setEvidence} multiline testID="office-contract-evidence" />
        {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
        <Btn label={editId ? '수정 저장' : '계약 기록하기'} icon="save" loading={busy} onPress={submit} testID="office-contract-save" />
        {editId ? <Btn kind="ghost" label="수정 취소" onPress={reset} testID="office-contract-cancel" /> : null}
      </Card>
      {o.contracts.length === 0 ? <Empty icon="file-text" title="계약 기록이 없습니다" /> : o.contracts.map((k) => (
        <Card key={k.id}>
          <Badge label={k.revoked_at ? '회수됨' : '유효'} tone={k.revoked_at ? 'muted' : 'ok'} />
          <T v="label">고객 {k.user_id}</T>
          <T v="small" color={c.mutedForeground}>{kst(k.starts_at)} ~ {kst(k.ends_at)}</T>
          {k.reason ? <T v="small">사유: {k.reason}</T> : null}
          {!k.revoked_at ? (
            <View style={{ gap: 8 }}>
              <Btn kind="secondary" label="기간·사유 수정" icon="edit-2" onPress={() => edit(k)} testID={`office-contract-edit-${k.id}`} />
              <Btn kind="danger" label="계약 회수" icon="slash" loading={busy} onPress={() => revoke(k)} testID={`office-contract-revoke-${k.id}`} />
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}
