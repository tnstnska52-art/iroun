import { describe, expect, it } from 'vitest';
import { industryGate, needsEmployees } from './fit';

const b = (category: string, industries?: string[]) => ({ category, fit: industries ? { industries } : undefined });

describe('industryGate: 다른 업종 공고 거르기', () => {
  it('관련 업종이 정해진 공고는 그 업종만', () => {
    expect(industryGate(b('경영', ['농림어업']), '음식점')).toBe('out');
    expect(industryGate(b('경영', ['음식점']), '음식점')).toBe('ok');
    expect(industryGate(b('행정·안전', ['정보통신']), '음식점')).toBe('out');
  });
  it('관련 업종이 여러 개면 빼지 않고 확인 필요', () => {
    expect(industryGate(b('경영', ['제조', '정보통신', '도소매']), '음식점')).toBe('check');
  });
  it('농림축산어업 분야는 농림어업만', () => {
    expect(industryGate(b('농림축산어업', []), '음식점')).toBe('out');
    expect(industryGate(b('농림축산어업', []), '농림어업')).toBe('ok');
  });
  it('매장 업종에 수출·기술개발 공고는 확인 필요, 제조는 그대로', () => {
    expect(industryGate(b('수출', []), '음식점')).toBe('check');
    expect(industryGate(b('기술', []), '숙박')).toBe('check');
    expect(industryGate(b('수출', []), '제조')).toBe('ok');
  });
  it('업종을 안 골랐거나 기타면 거르지 않는다', () => {
    expect(industryGate(b('경영', ['농림어업']))).toBe('ok');
    expect(industryGate(b('경영', ['농림어업']), '기타')).toBe('ok');
  });
});

describe('needsEmployees: 직원이 없으면 고용 사업을 뺀다', () => {
  it('직원 없음 + 고용 사업 → 뺀다', () => {
    for (const t of ['산재근로자 대체인력지원금', '고용안정장려금지원(정규직전환지원)', '2026년 시니어인턴십 사업 참여 기업 모집 공고', '중소기업퇴직연금기금제도(푸른씨앗) 사업주 및 근로자 지원', '작업환경측정 비용 지원'])
      expect(needsEmployees({ title: t }, '없음')).toBe(true);
  });
  it('자영업자 본인 보험료 지원은 남긴다', () => {
    expect(needsEmployees({ title: '소상공인 고용보험료 지원' }, '없음')).toBe(false);
    expect(needsEmployees({ title: '[충남] 2026년 2차 1인 자영업자 고용보험료 지원사업' }, '없음')).toBe(false);
  });
  it('직원이 있으면 그대로', () => {
    expect(needsEmployees({ title: '산재근로자 대체인력지원금' }, '1~4명')).toBe(false);
    expect(needsEmployees({ title: '산재근로자 대체인력지원금' })).toBe(false);
  });
});
