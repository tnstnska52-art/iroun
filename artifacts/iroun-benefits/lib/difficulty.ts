import type { Benefit } from '@workspace/api-client-react';

const HARD = /사업계획서|발표|평가|심사|경쟁|선발|공모|실적증명|재무제표|견적서/;
const LABELS = ['', '아주 쉬움', '쉬움', '보통', '어려움', '아주 어려움'];

/**
 * 신청 난이도 1(쉬움)~5(어려움).
 * 운영자가 공고에 직접 넣은 값이 있으면 그 값을 쓴다. 없으면 준비 서류 수, 확인할 조건 수,
 * 사업계획서·심사처럼 준비가 큰 항목이 있는지로 계산한다. 선정 가능성을 뜻하지 않는다.
 */
export function difficulty(b: Benefit): number {
  if (b.difficulty && b.difficulty >= 1 && b.difficulty <= 5) return b.difficulty;
  const text = `${b.documents.join(' ')} ${b.checks.join(' ')} ${b.support} ${b.summary}`;
  let score = b.documents.length + b.rules.length * 0.5 + b.checks.length * 0.5;
  if (HARD.test(text)) score += 2.5;
  if (b.kind === '환급금') score -= 0.5;
  return score <= 1.5 ? 1 : score <= 3 ? 2 : score <= 4.5 ? 3 : score <= 6 ? 4 : 5;
}
export const difficultyLabel = (n: number) => LABELS[n] ?? '';
