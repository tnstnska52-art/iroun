import React, { useState } from 'react';
import { replyOfficeInquiry } from '@workspace/api-client-react';
import { Badge, Btn, Card, Chip, Empty, Field, Notice, T, Wrap } from '@/components/ui';
import { apiErrorMessage } from '@/lib/text';
import { INQUIRY_STATES, kst, SvcInquiry } from '@/lib/service';
import type { OfficeProps } from './shared';

function Row({ q, refresh }: { q: SvcInquiry } & Pick<OfficeProps, 'refresh'>) {
  const [body, setBody] = useState('');
  const [state, setState] = useState<string>(q.state === '접수됨' ? '답변 완료' : q.state);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const send = async () => {
    if (!body.trim()) { setMsg({ t: 'error', s: '답변을 적어 주세요.' }); return; }
    setBusy(true); setMsg(null);
    try { await replyOfficeInquiry(q.id, { body: body.trim(), state }); setBody(''); await refresh(); setMsg({ t: 'ok', s: '고객에게 공개되는 답변을 저장했습니다.' }); }
    catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setBusy(false);
  };
  return (
    <Card>
      <Badge label={q.state} tone={q.state === '답변 완료' ? 'ok' : 'warn'} />
      <T v="h3">{q.title}</T>
      <T>{q.body}</T>
      {q.replies.map((r, i) => <T key={i} v="small">답변 {kst(r.at)}: {r.body}</T>)}
      <Field label="고객에게 보이는 답변" multiline value={body} onChangeText={setBody} testID={`office-inq-${q.id}-body`} />
      <Wrap>{INQUIRY_STATES.map((s) => <Chip key={s} label={s} selected={state === s} onPress={() => setState(s)} testID={`office-inq-${q.id}-state-${s}`} />)}</Wrap>
      {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
      <Btn label="답변 저장" icon="send" loading={busy} onPress={send} testID={`office-inq-${q.id}-send`} />
    </Card>
  );
}

export function OfficeInquiries({ o, refresh }: OfficeProps) {
  if (o.inquiries.length === 0) return <Empty icon="message-square" title="문의가 없습니다" />;
  return <>{o.inquiries.map((q) => <Row key={q.id} q={q} refresh={refresh} />)}</>;
}
