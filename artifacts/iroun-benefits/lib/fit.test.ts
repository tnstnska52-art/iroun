import { describe, expect, it } from 'vitest';
import { smallBizGate, stageGate, dedupePrograms, industryGate, needsEmployees, ownerGate, sameProgramKey } from './fit';

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

describe('ownerGate: 대표자 자격', () => {
  it('여성 기업 전용은 여성 대표만', () => {
    expect(ownerGate({ title: '2026년 여성기업 육성사업 공고' }, '아니오')).toBe('out');
    expect(ownerGate({ title: '여성 벤처 활성화 지원' }, '예')).toBe('ok');
  });
  it('특정 대표자 대상은 확인 필요', () => {
    expect(ownerGate({ title: '북한이탈주민 경영개선자금 지원' }, '아니오')).toBe('check');
    expect(ownerGate({ title: '1인 사업자 보조공학기기 지원' })).toBe('check');
    expect(ownerGate({ title: '소상공인 고용보험료 지원' })).toBe('ok');
  });
});

describe('dedupePrograms: 같은 사업 중복 빼기', () => {
  it('출처마다 이름이 조금 달라도 같은 사업으로 본다', () => {
    expect(sameProgramKey('산재근로자 대체인력지원금')).toBe(sameProgramKey('산재근로자 대체인력지원 사업'));
    expect(sameProgramKey('2026년 소상공인 고용보험료 지원사업 공고')).toBe(sameProgramKey('소상공인 고용보험료 지원'));
  });
  it('다른 사업은 남긴다', () => {
    const it = (title: string) => ({ benefit: { title } });
    expect(dedupePrograms([it('고용유지지원금 지원'), it('고용유지지원금'), it('청년일자리 도약장려금')]).map((x) => x.benefit.title)).toEqual(['고용유지지원금 지원', '청년일자리 도약장려금']);
  });
});

describe('업종 힌트·벤처·특정 상황', () => {
  it('제목이 다른 업종을 가리키면 확인 필요', () => {
    expect(industryGate({ category: '고용·창업', title: '기획취재 지원(방송, 영상)', fit: { industries: [] } }, '도소매')).toBe('check');
    expect(industryGate({ category: '경영', title: '소공인 집적지구 공동장비 활용', fit: { industries: [] } }, '음식점')).toBe('check');
    expect(industryGate({ category: '경영', title: '소공인 집적지구 공동장비 활용', fit: { industries: [] } }, '제조')).toBe('ok');
  });
  it('매장 업종에 벤처·스타트업 공고는 확인 필요', () => {
    expect(industryGate({ category: '사업화', title: '2026년 국가철도공단 창업·벤처기업 지원사업', fit: { industries: [] } }, '음식점')).toBe('check');
    expect(industryGate({ category: '사업화', title: '2026년 국가철도공단 창업·벤처기업 지원사업', fit: { industries: [] } }, '정보통신')).toBe('ok');
  });
  it('산재·폐업·고용유지 같은 특정 상황 사업은 확인 필요', () => {
    for (const t of ['산재근로자 대체인력지원금', '고용유지지원금 지원', '[경기] 2026년 소상공인 사업정리 지원사업', '자영업자 실업급여', '장애인고용장려금지원'])
      expect(ownerGate({ title: t })).toBe('check');
    expect(ownerGate({ title: '고용안정장려금지원(정규직전환지원)' })).toBe('ok');
  });
});

describe('stageGate: 창업 초기 전용 공고', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  it('개업 3년 넘은 사업장은 뺀다', () => expect(stageGate({ title: '[경남] 함양군 2026년 3차 소규모 창업자 초기 창업자금 지원 사업' }, 2015, now)).toBe('out'));
  it('올해·작년 개업은 그대로', () => expect(stageGate({ title: '초기 창업기업 지원' }, 2025, now)).toBe('ok'));
  it('창업 초기 공고가 아니면 그대로', () => expect(stageGate({ title: '소상공인 고용보험료 지원' }, 2010, now)).toBe('ok'));
});

describe('제목에 업종이 분명하면 제목을 따른다', () => {
  it('축산물판매업소 공고는 제조에 안 나온다', () => {
    expect(industryGate({ category: '경영', title: '축산물판매업소 기자재 구입비용 지원', fit: { industries: ['제조', '도소매'] } }, '제조')).toBe('out');
    expect(industryGate({ category: '경영', title: '축산물판매업소 기자재 구입비용 지원', fit: { industries: ['제조', '도소매'] } }, '도소매')).toBe('ok');
  });
});

describe('smallBizGate: 소상공인 규모', () => {
  const b = { title: '2026년 소상공인 고용보험료 지원사업 공고', summary: '소상공인이 자영업자 고용보험에 가입·유지할 때 납부한 보험료 지원' };
  it('직원 10명 넘으면 소상공인 공고 제외', () => expect(smallBizGate(b, { employeeBand: '10~29명', industry: '건설' })).toBe('out'));
  it('5~9명은 제조·건설·운수만', () => {
    expect(smallBizGate(b, { employeeBand: '5~9명', industry: '음식점' })).toBe('out');
    expect(smallBizGate(b, { employeeBand: '5~9명', industry: '제조' })).toBe('ok');
  });
  it('4명 이하는 그대로', () => expect(smallBizGate(b, { employeeBand: '1~4명', industry: '음식점' })).toBe('ok'));
  it('중소기업 공고는 거르지 않는다', () => expect(smallBizGate({ title: '중소기업 수출 부대비용 지원', summary: '' }, { employeeBand: '30명 이상' })).toBe('ok'));
  it('자영업자 공고는 법인 제외', () => expect(smallBizGate({ title: '서울특별시 자영업자 고용보험료 지원', summary: '' }, { entity: '법인', employeeBand: '1~4명' })).toBe('out'));
});

describe('3회차 표본에서 찾은 오류', () => {
  it('일자리창출 사회보험료는 직원이 있어야', () => expect(needsEmployees({ title: '[제주] 2026년 일자리창출 소상공인 사회보험료 지원사업 참여기업 모집' }, '없음')).toBe(true));
  it('내일채움공제는 직원이 있어야', () => expect(needsEmployees({ title: '2026년 상생협력형 내일채움공제 도입 및 지원 공고' }, '없음')).toBe(true));
  it('작업환경측정은 제조·건설만 조건 일치', () => expect(industryGate({ category: '보건·의료', title: '작업환경측정 비용 지원', fit: { industries: [] } }, '음식점')).toBe('check'));
  it('공동구매·협업체 사업은 확인 필요', () => expect(ownerGate({ title: '외식업체 식재료 공동구매 지원' })).toBe('check'));
});
