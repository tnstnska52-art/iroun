/**
 * 미리보기 전용 로그인 대역. '@clerk/expo' 자리에 연결되어 실제 로그인 서버 없이 화면을 확인하게 한다.
 * 운영 빌드에는 포함되지 않는다(EXPO_PUBLIC_PREVIEW=1일 때만 metro가 연결).
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ensureUser, installPreviewServer, liveState, previewUser, resetPreview } from './server';

type Listener = () => void;
let userId: string | null = null;
const listeners = new Set<Listener>();
const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => userId;
function setUser(id: string | null) { userId = id; listeners.forEach((l) => l()); }
installPreviewServer(() => userId);
// 미리보기 화면 틀에서는 브라우저 확인창이 뜨지 않으므로 바로 진행한다.
if (Platform.OS === 'web' && typeof window !== 'undefined') window.confirm = () => true;

const PERSONAS: { id: string | null; label: string; desc: string }[] = [
  { id: null, label: '비회원', desc: '로그인하지 않은 첫 방문자' },
  { id: 'demo-free', label: '무료회원', desc: '가입만 한 상태. 정보 입력 전' },
  { id: 'demo-trial', label: '체험 중', desc: '3일 체험 중. 정보 입력·회사 접수 있음' },
  { id: 'demo-contract', label: '계약회원', desc: '계약 이용권. 접수 직후(담당자 미배정)' },
  { id: 'demo-expired', label: '이용 종료', desc: '체험이 끝남. 예전 접수 기록 있음' },
  { id: 'demo-staff', label: '직원', desc: '배정된 고객만 보는 담당자' },
  { id: 'demo-admin', label: '관리자', desc: '전체 접수·직원·계약 관리' },
];

function PreviewBar() {
  if (process.env.EXPO_PUBLIC_STORE_SHOTS === '1') return null;
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [open, setOpen] = useState(false);
  const known = PERSONAS.find((p) => p.id === current);
  const [live, setLive] = useState(liveState.count);
  useEffect(() => { const t = setInterval(() => setLive(liveState.count), 1500); return () => clearInterval(t); }, []);
  const pick = (id: string | null) => { setOpen(false); setUser(id); try { router.replace('/'); } catch { /* 라우터 준비 전 */ } };
  return (
    <View style={{ width: '100%', backgroundColor: '#0f1b33', zIndex: 1000 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="미리보기 사용자 바꾸기" onPress={() => setOpen(!open)}
        style={{ minHeight: 40, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: '#9fb4dc', fontSize: 13, fontWeight: '600' }}>미리보기</Text>
        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>{known ? known.label : '새로 가입한 회원'} 화면</Text>
        <Text style={{ color: live ? '#7ee2a8' : '#9fb4dc', fontSize: 12, fontWeight: '700' }}>{live ? `실제 공고 ${live}건` : '예시 공고'}</Text>
        <Text style={{ color: '#9fb4dc', fontSize: 13, fontWeight: '600' }}>{open ? '닫기 ▲' : '사용자 바꾸기 ▼'}</Text>
      </Pressable>
      {open ? (
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 10, gap: 6 }}>
          {PERSONAS.map((p) => (
            <Pressable key={String(p.id)} accessibilityRole="button" onPress={() => pick(p.id)}
              style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: p.id === current ? '#1d4ed8' : '#1b2b4d' }}>
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>{p.label}</Text>
              <Text style={{ color: '#c5d3ee', fontSize: 13, marginTop: 2 }}>{p.desc}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => { resetPreview(); pick(null); }}
            style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#3b4f7a' }}>
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>처음 상태로 되돌리기</Text>
            <Text style={{ color: '#c5d3ee', fontSize: 13, marginTop: 2 }}>미리보기에서 입력·접수한 내용을 모두 지웁니다. 실제 자료와는 무관합니다.</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
  );
}

export function ClerkProvider({ children }: { children: React.ReactNode; [k: string]: unknown }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#dfe6f1', alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', backgroundColor: '#ffffff', overflow: 'hidden' }}>
        <PreviewBar />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </View>
  );
}

export function useAuth() {
  const id = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    isLoaded: true, isSignedIn: !!id, userId: id, sessionId: id ? 'preview-session' : null,
    getToken: async () => (id ? 'preview-token' : null),
    signOut: async (_?: unknown) => { setUser(null); },
  };
}
export function useUser() {
  const id = useSyncExternalStore(subscribe, snapshot, snapshot);
  const u = previewUser(id);
  return { isLoaded: true, isSignedIn: !!u, user: u ? { id: u.id, firstName: u.name ?? null, primaryPhoneNumber: { phoneNumber: u.email }, primaryEmailAddress: null as { emailAddress: string } | null } : null };
}

type Result = { error: { message: string; errors?: { message: string; longMessage?: string; code?: string }[] } | null };
const ok: Result = { error: null };
const bad = (message: string, code = 'preview'): Result => ({ error: { message, errors: [{ message, longMessage: message, code }] } });
const local = (e164: string) => { const d = e164.replace(/\D/g, '').replace(/^82/, '0'); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d; };

export function useSignIn() {
  const [, force] = useState(0);
  const ref = React.useRef<{ status: string | null; pending: string | null }>({ status: null, pending: null });
  return {
    fetchStatus: 'idle' as const,
    signIn: {
      // 화면 코드가 호출 직후 status를 읽으므로 같은 객체에서 최신 값을 돌려준다.
      get status() { return ref.current.status; },
      supportedSecondFactors: [] as { strategy: string }[],
      password: async ({ phoneNumber, password }: { phoneNumber: string; password: string }): Promise<Result> => {
        if (!password) return bad('비밀번호를 입력해 주세요.');
        // 미리보기: 어떤 번호든 로그인된다. 준비된 인물은 위쪽 "사용자 바꾸기"에서 고른다.
        ref.current.pending = ensureUser(`new-${phoneNumber}`, local(phoneNumber)).id;
        ref.current.status = 'complete'; force((n) => n + 1);
        return ok;
      },
      finalize: async ({ navigate }: { navigate: () => void }) => { setUser(ref.current.pending); navigate(); },
      mfa: { sendPhoneCode: async (): Promise<Result> => ok, verifyPhoneCode: async (_: { code: string }): Promise<Result> => ok },
    },
  };
}

export function useSignUp() {
  const [, force] = useState(0);
  const ref = React.useRef<{ status: string | null; phone: string; name: string }>({ status: null, phone: '', name: '' });
  return {
    fetchStatus: 'idle' as const,
    signUp: {
      get status() { return ref.current.status; },
      password: async ({ phoneNumber, password, firstName }: { phoneNumber: string; password: string; firstName?: string; unsafeMetadata?: unknown }): Promise<Result> => {
        if (password.length < 8) return bad('비밀번호는 8자 이상으로 입력해 주세요.', 'form_password_length_too_short');
        ref.current.phone = phoneNumber; ref.current.name = firstName ?? ''; return ok;
      },
      verifications: {
        sendPhoneCode: async (): Promise<Result> => ok,
        // 미리보기: 실제 문자는 보내지 않는다. 숫자 6자리면 통과한다.
        verifyPhoneCode: async ({ code }: { code: string }): Promise<Result> => {
          if (!/^\d{6}$/.test(code)) return bad('인증번호 6자리를 입력해 주세요.', 'form_code_incorrect');
          ref.current.status = 'complete'; force((n) => n + 1); return ok;
        },
      },
      finalize: async ({ navigate }: { navigate: () => void }) => { setUser(ensureUser(`new-${ref.current.phone}`, local(ref.current.phone), ref.current.name).id); navigate(); },
    },
  };
}

/** 미리보기: 카카오 가입은 실제 카카오로 가지 않고 바로 가입된 것으로 처리한다. */
export function useSSO() {
  return {
    startSSOFlow: async (_: { strategy: string }) => {
      const id = ensureUser('new-kakao', '카카오 계정', '카카오').id;
      return { createdSessionId: 'preview-kakao', setActive: async (_a: { session: string }) => { setUser(id); } };
    },
  };
}
