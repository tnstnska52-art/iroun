import { useEffect, useState } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import {
  getGetOfficeStateQueryKey, getGetServiceMatchesQueryKey, getGetServiceStateQueryKey,
  useGetOfficeState, useGetServiceMatches, useGetServiceState,
} from '@workspace/api-client-react';
import type { Account, Benefit, Profile, Recommendation } from '@workspace/api-client-react';
import { useAccount } from '@/lib/session';
import { errStatus } from '@/lib/util';

/* ---------- DTO (서버 계약) ---------- */
export interface SvcRequest {
  id: string; benefitId: string; businessId: string; kind: string; state: string; createdAt: string;
  snapshot: Snapshot | null; customerTasks: string[]; completedTasks: string[];
  benefitTitle?: string; updatedAt?: string;
  contact: { name?: string; phone?: string; kakao?: string } | null;
}
export interface SvcInquiry {
  id: string; title: string; body: string; state: string;
  replies: { body: string; at: string; author?: string }[];
}
export interface SvcInboxItem { id: string; benefit_id: string; title: string; read_at: string | null; created_at: string }
export interface SvcConsent { kind: string; version: string; content?: string; accepted: boolean; recorded_at: string }
export interface CompanyInfo { phone?: string | null; kakao?: string | null; website?: string | null }
export interface ServiceState {
  companyUpdates?: {id:string;requestId:string;title:string;state:string;updatedAt:string;read:boolean}[];
  pushDelivery?: import('@workspace/api-client-react').PushDeliveryStatus;
  account: Account;
  membership?: unknown;
  consents: SvcConsent[]; consentVersion: string; consentTexts: { service?: string; marketing?: string };
  trialUsed: boolean; requests: SvcRequest[]; inquiries: SvcInquiry[]; inbox: SvcInboxItem[];
  company: CompanyInfo; limitations?: string[] | string;
}
export interface MatchEntry extends Recommendation { basis?: string; referenceYear?: number; referenceExclusions?: string[] }
export interface MatchItem {
  benefit: Benefit; closed: boolean; matches: MatchEntry[]; basis?: string; noticeYear?: number; closureBasis?: string; warning?: string;
}
export interface MatchesPayload { items: MatchItem[]; coverage?: unknown }
export interface Snapshot {
  title?: string; sourceUrl?: string; checkedAt?: string; endsAt?: string; documents?: string[]; checks?: string[]; warning?: string; caution?: string; cautions?: string[];
  decision?: { result?: string; reasons?: string[]; unknowns?: string[]; exclusions?: string[] };
}
export interface OfficeRequest {
  id: string; user_id: string; benefit_id: string; business_id: string; kind: string; state: string; assigned_to: string | null;
  snapshot: Snapshot | null; customer_tasks: string[]; staff_tasks: string[]; completed_tasks: string[];
  internal_note?: string | null; staff_name?: string | null; staff_phone?: string | null; staff_kakao?: string | null;
}
export interface OfficeStaffRow { user_id: string; name: string; phone?: string | null; kakao?: string | null; enabled: boolean }
export interface OfficeContract { id: string; user_id: string; starts_at: string; ends_at: string; reason?: string; evidence?: string; revoked_at?: string | null }
export interface OfficeState {
  admin: boolean; requests: OfficeRequest[]; customers: { id: string; role: string; profile?: Profile }[];
  inquiries: (SvcInquiry & { user_id?: string })[]; staff: OfficeStaffRow[]; contracts: OfficeContract[];
  company: CompanyInfo; contractPolicy?: unknown;
}

export const REQUEST_STATES = ['회사 접수', '자격 확인', '자료 준비', '공식 신청 안내', '고객 확인', '회사 지원 종료'] as const;
export const INQUIRY_STATES = ['접수됨', '확인 중', '답변 완료'] as const;

/* ---------- 신선도/소유 ---------- */
function useFresh(updatedAt: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!updatedAt) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(50, 15000 - (Date.now() - updatedAt)));
    return () => clearTimeout(t);
  }, [updatedAt]);
  const age = Date.now() - updatedAt;
  return updatedAt > 0 && age >= 0 && age < 15000;
}

export function useServiceStateView() {
  const acc = useAccount();
  const uid = acc.me?.id;
  const q = useGetServiceState({ query: { queryKey: [...getGetServiceStateQueryKey(), uid ?? 'none'] as QueryKey, enabled: !!uid, staleTime: 5000, refetchInterval: 5000, gcTime: 0, retry: false } });
  const fresh = useFresh(q.dataUpdatedAt);
  const raw = q.data as unknown as ServiceState | undefined;
  const data = uid && fresh && !q.error && raw?.account?.id === uid ? raw : undefined;
  return { acc, data, error: q.error, isLoading: q.isLoading || (!!uid && !q.error && !data && q.fetchStatus === 'fetching'), refetch: q.refetch };
}

export function useMatchesView(period: 'current' | 'past', year?: number, enabled=true) {
  const acc = useAccount();
  const uid = acc.me?.id;
  const params = period === 'past' ? { period, year } : { period };
  const q = useGetServiceMatches(params, { query: { queryKey: [...getGetServiceMatchesQueryKey(params), uid ?? 'none'] as QueryKey, enabled: enabled && acc.active && !!uid, staleTime: 5000, refetchInterval: enabled ? 5000 : false, gcTime: 0, retry: false } });
  const fresh = useFresh(q.dataUpdatedAt);
  const raw = q.data as unknown as MatchesPayload | undefined;
  const data = enabled && acc.active && fresh && !q.error ? raw : undefined;
  return { acc, data, error: enabled && acc.active ? q.error : undefined, isLoading: enabled && acc.active && (q.isLoading || (!q.error && !data)), refetch: q.refetch };
}

export function useOfficeView() {
  const acc = useAccount();
  const uid = acc.me?.id;
  const q = useGetOfficeState({ query: { queryKey: [...getGetOfficeStateQueryKey(), uid ?? 'none', acc.me?.role ?? ''] as QueryKey, enabled: !!uid && (acc.isAdminRole || acc.isStaffRole), staleTime: 5000, refetchInterval: 5000, gcTime: 0, retry: false } });
  const fresh = useFresh(q.dataUpdatedAt);
  const raw = q.data as unknown as OfficeState | undefined;
  const roleOk = !!raw && (acc.isAdminRole || acc.isStaffRole) && raw.admin === acc.isAdminRole;
  const data = uid && fresh && acc.authorityFresh && !q.error && roleOk ? raw : undefined;
  return { acc, data, error: q.error, isLoading: acc.isAdminRole || acc.isStaffRole ? q.isLoading || (!q.error && !data) : false, refetch: q.refetch, denied: !!uid && acc.authorityFresh && !acc.isAdminRole && !acc.isStaffRole };
}

/* ---------- 날짜(KST) ---------- */
export function kst(iso?: string | null): string {
  if (!iso) return '확인 필요';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '확인 필요';
  const k = new Date(t + 9 * 3600000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}
export function kstDate(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  return new Date(t + 9 * 3600000).toISOString().slice(0, 10);
}
/** YYYY-MM-DD -> KST 시작/끝 ISO. 잘못된 달력 날짜는 null. */
export function toKstIso(s: string, end: boolean): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const chk = new Date(Date.UTC(y, mo - 1, d));
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${end ? '23:59:59' : '00:00:00'}+09:00`).toISOString();
}
export function remaining(endIso: string | null | undefined, nowIso: string): string {
  if (!endIso) return '';
  const ms = new Date(endIso).getTime() - new Date(nowIso).getTime();
  if (isNaN(ms)) return '';
  if (ms <= 0) return '끝났습니다';
  const h = Math.floor(ms / 3600000);
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : `${Math.max(h, 0)}시간 ${Math.floor((ms % 3600000) / 60000)}분 남음`;
}

/* ---------- 기타 ---------- */
export const validPhone = (s?: string | null) => !!s && /^[0-9+\-\s]{7,20}$/.test(s.trim());
export const validLink = (s?: string | null) => !!s && /^https:\/\/[^\s]+$/.test(s.trim());
export const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
export const status = errStatus;
