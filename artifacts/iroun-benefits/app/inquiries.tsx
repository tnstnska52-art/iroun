import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createInquiry, getGetServiceStateQueryKey } from '@workspace/api-client-react';
import { Badge, Btn, Card, Empty, Field, Loading, Notice, Page, Section, T } from '@/components/ui';
import { Pending, AuthGate, NotGovernment, QueryProblem, ServiceLinks } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { newId } from '@/lib/util';
import { kst, useServiceStateView } from '@/lib/service';

function Body() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, error, isLoading, refetch } = useServiceStateView();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  // 같은 문의는 실패해도 같은 키로 다시 보낸다. 성공하면 새 키.
  const key = useRef(newId());

  if (error) return <QueryProblem error={error} next="/inquiries" onRetry={() => refetch()} />;
  if (isLoading || !data) return <Pending onRetry={() => refetch()} />;

  const send = async () => {
    if (!title.trim() || !body.trim()) { setMsg({ t: 'error', s: '제목과 내용을 모두 적어 주세요.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await createInquiry({ title: title.trim(), body: body.trim(), requestKey: key.current });
      key.current = newId(); setTitle(''); setBody('');
      setMsg({ t: 'ok', s: '문의를 보냈습니다. 답변은 이 화면에서 볼 수 있어요.' });
      await qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() });
    } catch (e) { setMsg({ t: 'error', s: `${apiErrorMessage(e)} 같은 내용으로 다시 보내도 두 번 접수되지 않습니다.` }); }
    setBusy(false);
  };

  return (
    <>
      <Notice tone="info">앱과 웹에서 같은 계정으로 보낸 문의가 함께 보입니다. 이용 기간이 끝나도 내 문의는 볼 수 있어요.</Notice>
      <Card>
        <Field label="제목" value={title} onChangeText={setTitle} maxLength={100} testID="svc-inq-title" />
        <Field label="내용" value={body} onChangeText={setBody} multiline maxLength={2000} testID="svc-inq-body" hint="주민번호, 계좌번호는 적지 마세요." />
        {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
        <Btn label="문의 보내기" icon="send" loading={busy} onPress={send} testID="svc-inq-send" />
      </Card>
      <Section title="내 문의">
        {data.inquiries.length === 0 ? <Empty icon="message-square" title="보낸 문의가 없어요" body="궁금한 점이나 건의를 편하게 적어 주세요." /> : data.inquiries.map((q) => (
          <Card key={q.id}>
            <Badge label={q.state} tone={q.state === '답변 완료' ? 'ok' : 'warn'} />
            <T v="h3">{q.title}</T>
            <T>{q.body}</T>
            {q.replies.map((r, i) => (
              <Card key={i} tone="soft">
                <T v="small" color={c.mutedForeground}>{r.author ?? '회사'} · {kst(r.at)}</T>
                <T>{r.body}</T>
              </Card>
            ))}
            {q.replies.length === 0 ? <T v="small" color={c.mutedForeground}>아직 답변이 없어요.</T> : null}
          </Card>
        ))}
      </Section>
      <ServiceLinks current="/inquiries" />
    </>
  );
}

export default function Inquiries() {
  return (
    <Page back title="문의·건의" subtitle="궁금한 점을 회사에 보내세요.">
      <NotGovernment />
      <AuthGate next="/inquiries"><Body /></AuthGate>
    </Page>
  );
}
