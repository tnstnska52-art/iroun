import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * 기기에만 저장되는 공개 공고 ID 목록. 제목·계정 정보는 저장하지 않으며,
 * 화면에서는 현재 공개 목록과 겹치는 ID만 보여준다.
 */
const KEY = 'iroun.recentBenefitIds.v2';
const OLD = 'iroun.recentBenefits.v1';
const MAX = 8;
let cache: string[] | null = null;
const subs = new Set<(x: string[]) => void>();

async function load(): Promise<string[]> {
  if (cache) return cache;
  try {
    AsyncStorage.removeItem(OLD).catch(() => {});
    const v = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch { cache = []; }
  return cache;
}
/** 저장 성공 시에만 목록을 갱신하고 true를 돌려준다. */
export async function pushRecent(id: string): Promise<boolean> {
  const next = [id, ...(await load()).filter((y) => y !== id)].slice(0, MAX);
  try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch { return false; }
  cache = next; subs.forEach((f) => f(next));
  return true;
}
export async function clearRecent(): Promise<boolean> {
  try { await AsyncStorage.removeItem(KEY); } catch { return false; }
  cache = []; subs.forEach((f) => f([]));
  return true;
}
export function useRecent() {
  const [list, setList] = useState<string[]>(cache ?? []);
  useEffect(() => { subs.add(setList); load().then(setList); return () => { subs.delete(setList); }; }, []);
  return list;
}
