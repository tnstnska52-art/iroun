import type { Profile } from '@workspace/api-client-react';

const PERSONAL = [] as const;
const BUSINESS = ['industry', 'province', 'district', 'openedYear', 'revenue', 'employeeBand', 'premises'] as const;
const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '');

/**
 * 입력 완성도(%). 실제로 저장된 답만 센다. '모름'으로 넘긴 항목은 채운 것으로 치지 않는다.
 * 지원금을 받을 확률이 아니라 입력한 정도를 뜻한다.
 */
export function profileCompletion(p?: Profile | null): { pct: number; answered: number; total: number } {
  if (!p) return { pct: 0, answered: 0, total: PERSONAL.length };
  const personal = p.personal as Record<string, unknown>;
  let answered = PERSONAL.filter((k) => has(personal[k])).length;
  let total = PERSONAL.length;
  {
    total += BUSINESS.length;
    const b = (p.businesses[0] ?? {}) as unknown as Record<string, unknown>;
    answered += BUSINESS.filter((k) => has(b[k])).length;
  }
  return { pct: Math.round((answered / total) * 100), answered, total };
}
