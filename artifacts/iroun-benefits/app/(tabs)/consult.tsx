import React, { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useUnreadReplies } from '@/lib/replies';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { createInquiry, getGetServiceStateQueryKey } from '@workspace/api-client-react';
import { Btn, Disclaimer, Emoji, Field, Notice, Page, SectionHead, T } from '@/components/ui';
import { Pending, QueryProblem } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { apiErrorMessage } from '@/lib/text';
import { newId } from '@/lib/util';
import { kst, useServiceStateView } from '@/lib/service';

const FAQ: [string, string][] = [
  ['무료체험이 끝나면 돈이 나가나요?', '아니요. 자동결제는 없어요.'],
  ['지원금은 누가 신청하나요?', '순서대로 직접 신청하거나,\n"회사에 신청 도움 요청"을 누르세요.'],
  ['조건을 잘못 골랐어요.', '홈 아래 "조건 다시 고르기"를 누르세요.'],
];

/** 상담 탭: 문의를 남기면 나중에 답변이 도착한다. 실시간 상담은 하지 않는다. */
export default function Consult() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const { data, error, isLoading, refetch } = useServiceStateView();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // 같은 문의는 실패해도 같은 키로 다시 보낸다. 성공하면 새 키.
  const key = useRef(newId());
  // 이 화면을 보고 있는 동안 도착한 답변은 읽은 것으로 처리한다.
  const { markSeen } = useUnreadReplies();
  useFocusEffect(useCallback(() => { markSeen(); }, [markSeen]));

  const send = async () => {
    const text = body.trim();
    if (text.length < 2) { setMsg({ t: 'error', s: '문의 내용을 적어 주세요.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await createInquiry({ title: text.split('\n')[0].slice(0, 40), body: text, requestKey: key.current });
      key.current = newId(); setBody('');
      setMsg({ t: 'ok', s: '문의를 남겼어요. 24시간 안에 답변드려요.' });
      await qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() });
    } catch (e) { setMsg({ t: 'error', s: `${apiErrorMessage(e, '문의를 보내지 못했어요. 다시 시도해 주세요.')}` }); }
    setBusy(false);
  };

  return (
    <Page tab title="상담">
      <View testID="consult-notice" style={{ backgroundColor: c.primarySoft, borderRadius: c.radius + 4, padding: 18, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Emoji char="💬" size={30} motion="bounce" />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3" color={c.primary}>24시간 안에 답변드려요</T>
          <T v="small" color={c.primary}>답변 시간 오전 9시~오후 6시</T>
        </View>
      </View>

      <SectionHead title="자주 묻는 질문" />
      <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
        {FAQ.map(([q, a], i) => (
          <View key={q} style={{ borderBottomWidth: i === FAQ.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
            <Pressable testID={`faq-${i}`} accessibilityRole="button" accessibilityState={{ expanded: openFaq === i }} onPress={() => setOpenFaq(openFaq === i ? null : i)} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T v="label" style={{ flex: 1 }}>{q}</T>
              <Feather name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={20} color={c.mutedForeground} />
            </Pressable>
            {openFaq === i ? <T color={c.mutedForeground} style={{ paddingBottom: 14 }}>{a}</T> : null}
          </View>
        ))}
      </View>

      <SectionHead title="문의 남기기" />
      {!acc.isLoaded || (acc.isSignedIn && acc.loading) ? <Pending onRetry={() => acc.refetch()} /> : !acc.isSignedIn ? (
        <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 18, gap: 10 }}>
          <T>가입하면 문의할 수 있어요</T>
          <Btn label="가입하고 문의하기" onPress={() => router.push('/auth?mode=signup&next=/consult' as never)} testID="consult-join" />
        </View>
      ) : error ? <QueryProblem error={error} next="/consult" onRetry={() => refetch()} /> : isLoading || !data ? <Pending onRetry={() => refetch()} /> : (
        <>
          <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 16, gap: 10 }}>
            <Field label="궁금한 점을 적어 주세요" value={body} onChangeText={setBody} multiline maxLength={2000} testID="consult-body" hint="주민번호, 계좌번호는 적지 마세요." />
            {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
            <Btn label="문의 보내기" loading={busy} onPress={send} testID="consult-send" />
          </View>

          <SectionHead title={`내 문의 ${data.inquiries.length}건`} />
          {data.inquiries.length === 0 ? (
            <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 18 }}><T color={c.mutedForeground}>아직 남긴 문의가 없어요.</T></View>
          ) : data.inquiries.map((q) => (
            <View key={q.id} testID={`consult-item-${q.id}`} style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 16, gap: 10 }}>
              <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: c.primary, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
                <T color="#FFFFFF">{q.body}</T>
              </View>
              {q.replies.length === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="clock" size={16} color={c.mutedForeground} />
                  <T v="small" color={c.mutedForeground}>답변 대기 중</T>
                </View>
              ) : q.replies.map((r, i) => (
                <View key={i} style={{ alignSelf: 'flex-start', maxWidth: '92%', gap: 4 }}>
                  <View style={{ backgroundColor: c.secondary, borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <T>{r.body}</T>
                  </View>
                  <T v="small" color={c.mutedForeground}>이로운사람들 · {kst(r.at)}</T>
                </View>
              ))}
            </View>
          ))}
        </>
      )}
      <Disclaimer />
    </Page>
  );
}
