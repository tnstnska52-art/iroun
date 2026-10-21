import { describe, expect, it } from 'vitest';
import { industryGate } from './fit';

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
