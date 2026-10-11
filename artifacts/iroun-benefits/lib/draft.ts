import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@workspace/api-client-react';

const SIGNIN = 'iroun.lastSignIn.v1';
export type DraftCursor={idx:number;biz:{id:string;sub:number}|null};
export type Draft = { profile: Profile; consent: boolean;cursor?:DraftCursor; serverSaved?:boolean };

const PREFIX = 'iroun.draft';
const keyOf = (uid: string | null) => `${PREFIX}.${uid ? `u.${uid}` : 'guest'}`;

/** 로그인 계정별 초안을 우선 읽고, 없으면 로그인 전(게스트) 초안을 이어받는다. */
export async function loadDraft(uid: string | null): Promise<Draft | null> {
  try {
    let s = await AsyncStorage.getItem(keyOf(uid));
    if (!s && uid) s = await AsyncStorage.getItem(keyOf(null));
    return s ? (JSON.parse(s) as Draft) : null;
  } catch { return null; }
}
/** 저장 성공 여부를 돌려준다. 실패를 숨기지 않는다. */
export async function saveDraft(d: Draft, uid: string | null): Promise<boolean> {
  try {
    await AsyncStorage.setItem(keyOf(uid), JSON.stringify(d));
    if (uid) await AsyncStorage.removeItem(keyOf(null));
    return true;
  } catch { return false; }
}
/** 모든 계정/게스트 초안을 지운다. */
export async function clearDraft() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {}
}
export async function markSignIn() {
  try { await AsyncStorage.setItem(SIGNIN, String(Date.now())); } catch {}
}
export async function clearSignInMark() {
  try { await AsyncStorage.removeItem(SIGNIN); } catch {}
}
export async function signedInRecently(minutes = 9): Promise<boolean> {
  try {
    const s = await AsyncStorage.getItem(SIGNIN);
    return !!s && Date.now() - Number(s) < minutes * 60000;
  } catch { return false; }
}
