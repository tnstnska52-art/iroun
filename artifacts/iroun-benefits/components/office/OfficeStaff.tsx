import React, { useState } from 'react';
import { saveOfficeStaff } from '@workspace/api-client-react';
import { Badge, Btn, Card, Empty, Field, Notice, T, Toggle } from '@/components/ui';
import { apiErrorMessage } from '@/lib/text';
import type { OfficeProps } from './shared';

export function OfficeStaff({ o, refresh }: OfficeProps) {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [kakao, setKakao] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const save = async (d: { userId: string; name: string; phone: string; kakao: string; enabled: boolean }, reset: boolean) => {
    if (!d.userId.trim() || !d.name.trim()) { setMsg({ t: 'error', s: '가입한 계정 번호와 이름이 필요합니다.' }); return; }
    setBusy(true); setMsg(null);
    try { await saveOfficeStaff({ ...d, userId: d.userId.trim(), name: d.name.trim() }); await refresh(); setMsg({ t: 'ok', s: '저장했습니다.' }); if (reset) { setUserId(''); setName(''); setPhone(''); setKakao(''); } }
    catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setBusy(false);
  };
  return (
    <>
      <Card>
        <T v="h3">직원 등록·수정</T>
        <T v="small">이미 가입한 계정 번호로 등록합니다. 역할은 서버가 정확히 정합니다.</T>
        <Field label="계정 번호" value={userId} onChangeText={setUserId} autoCapitalize="none" autoCorrect={false} testID="office-staff-userid" />
        <Field label="이름" value={name} onChangeText={setName} testID="office-staff-name" />
        <Field label="전화번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="office-staff-phone" />
        <Field label="카카오톡 링크 (https://)" value={kakao} onChangeText={setKakao} autoCapitalize="none" testID="office-staff-kakao" />
        <Toggle label="사용함" value={enabled} onChange={setEnabled} testID="office-staff-enabled" />
        {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
        <Btn label="직원 저장" icon="user-plus" loading={busy} onPress={() => save({ userId, name, phone, kakao, enabled }, true)} testID="office-staff-save" />
      </Card>
      {o.staff.length === 0 ? <Empty icon="users" title="등록된 직원이 없습니다" /> : o.staff.map((s) => (
        <Card key={s.user_id}>
          <Badge label={s.enabled ? '사용 중' : '중지'} tone={s.enabled ? 'ok' : 'muted'} />
          <T v="h3">{s.name}</T>
          <T v="small">{s.phone || '전화 미등록'} · {s.kakao ? '카톡 등록' : '카톡 미등록'}</T>
          <Btn kind="secondary" label={s.enabled ? '사용 중지' : '다시 사용'} loading={busy} testID={`office-staff-toggle-${s.user_id}`}
            onPress={() => save({ userId: s.user_id, name: s.name, phone: s.phone ?? '', kakao: s.kakao ?? '', enabled: !s.enabled }, false)} />
          <Btn kind="ghost" label="이 정보로 고치기" onPress={() => { setUserId(s.user_id); setName(s.name); setPhone(s.phone ?? ''); setKakao(s.kakao ?? ''); setEnabled(s.enabled); }} testID={`office-staff-edit-${s.user_id}`} />
        </Card>
      ))}
    </>
  );
}
