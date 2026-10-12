import React, { useState } from 'react';
import { saveOfficeSettings } from '@workspace/api-client-react';
import { Btn, Card, Field, Notice, T } from '@/components/ui';
import { ContactButtons } from '@/components/service-ui';
import { apiErrorMessage } from '@/lib/text';
import type { OfficeProps } from './shared';

export function OfficeContact({ o, refresh }: OfficeProps) {
  const [phone, setPhone] = useState(o.company?.phone ?? '');
  const [kakao, setKakao] = useState(o.company?.kakao ?? '');
  const [web, setWeb] = useState(o.company?.website ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await saveOfficeSettings({ phone: phone.trim(), kakao: kakao.trim(), website: web.trim() }); await refresh(); setMsg({ t: 'ok', s: '저장했습니다. 빈 칸은 미등록으로 표시됩니다.' }); }
    catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setBusy(false);
  };
  return (
    <Card>
      <T v="h3">회사 연락처</T>
      {o.admin ? (
        <>
          <Field label="카카오톡 채널 채팅 주소" hint="예: https://pf.kakao.com/_채널아이디/chat" placeholder="https://pf.kakao.com/_xxxxx/chat" value={kakao} onChangeText={setKakao} autoCapitalize="none" testID="office-company-kakao" />
          <Field label="웹사이트 (https://)" value={web} onChangeText={setWeb} autoCapitalize="none" testID="office-company-web" />
          {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
          <Btn label="연락처 저장" icon="save" loading={busy} onPress={save} testID="office-company-save" />
        </>
      ) : <T v="small">연락처 변경은 관리자만 할 수 있습니다.</T>}
      <ContactButtons phone={o.company?.phone} kakao={o.company?.kakao} prefix="office-company" />
    </Card>
  );
}
