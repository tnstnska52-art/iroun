export function isAxiosLike(e: unknown): e is { status: number } {
  return typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number';
}
export function errStatus(e: unknown): number | undefined {
  return isAxiosLike(e) ? e.status : undefined;
}
export function fmtDate(s?: string | null): string {
  if (!s) return '확인 필요';
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (dm) return `${+dm[1]}년 ${+dm[2]}월 ${+dm[3]}일`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
/** 마감 시각(ms). 날짜만 있는 값(YYYY-MM-DD)은 한국시간 그날 23:59:59로 본다. */
export function endTime(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})$/.exec(s.trim());
  const t = m ? new Date(`${m[1]}T23:59:59+09:00`).getTime() : new Date(s).getTime();
  return isNaN(t) ? null : t;
}
export function daysLeft(s?: string | null): number | null {
  const t = endTime(s);
  if (t === null) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}
export function newId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
