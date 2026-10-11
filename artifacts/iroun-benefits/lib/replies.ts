/**
 * 상담 답변 알림(앱 안). 회사가 답변을 남기면 상담 탭에 빨간 점, 홈에 안내가 뜬다.
 * "어디까지 봤는지"는 이 휴대폰에만 저장한다. 휴대폰 잠금화면 알림은 푸시 연결 후에 동작한다.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useServiceStateView } from '@/lib/service';

const KEY = (uid: string) => `iroun.replies.seen.${uid}`;
const seen = new Map<string, number>();
const loaded = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useUnreadReplies() {
  const { acc, data } = useServiceStateView();
  const uid = acc.me?.id;
  useSyncExternalStore(subscribe, () => version, () => version);
  useEffect(() => {
    if (!uid || loaded.has(uid)) return;
    loaded.add(uid);
    AsyncStorage.getItem(KEY(uid)).then((v) => { seen.set(uid, Math.max(seen.get(uid) ?? 0, Number(v) || 0)); emit(); }).catch(() => emit());
  }, [uid]);
  const total = data ? data.inquiries.reduce((n, q) => n + q.replies.length, 0) : undefined;
  const ready = !!uid && total !== undefined && loaded.has(uid) && seen.has(uid);
  const count = ready ? Math.max(0, total! - (seen.get(uid!) ?? 0)) : 0;
  const markSeen = useCallback(() => {
    if (!uid || total === undefined || (seen.get(uid) ?? 0) >= total) return;
    seen.set(uid, total); emit();
    AsyncStorage.setItem(KEY(uid), String(total)).catch(() => {});
  }, [uid, total]);
  return { count, markSeen };
}
