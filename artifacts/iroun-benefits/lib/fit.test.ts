import { describe, expect, it } from 'vitest';
import { rentGate, districtGate, orgTargetGate, textLimitGate, easeOf, smallBizGate, stageGate, dedupePrograms, industryGate, needsEmployees, ownerGate, sameProgramKey } from './fit';

const b = (category: string, industries?: string[]) => ({ category, fit: industries ? { industries } : undefined });

describe('industryGate: 다른 업종 공고 거르기', () => {
  it('관련 업종이 정해진 공고는 그 업종만', () => {
    expect(industryGate({ category: '경영', title: '2026년 산림신품종 육성지원 사업', fit: { industries: ['농림어업'] } }, '음식점')).toBe('out');
    expect(industryGate(b('경영', ['농림어업']), '음식점')).toBe('check');
    expect(industryGate(b('경영', ['음식점']), '음식점')).toBe('ok');
    expect(industryGate(b('행정·안전', ['정보통신']), '음식점')).toBe('check');
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
  it('업종을 안 골랐으면 거르지 않는다', () => expect(industryGate(b('경영', ['농림어업']))).toBe('ok'));
  it('업종이 기타면 빼지는 않고 특정 업종 공고만 확인 필요', () => {
    expect(industryGate(b('경영', ['농림어업']), '기타')).toBe('check');
    expect(industryGate(b('경영', []), '기타')).toBe('ok');
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
    expect(industryGate({ category: '사업화', title: '2026년 국가철도공단 창업·벤처기업 지원사업', fit: { industries: [] } }, '농림어업')).toBe('check');
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

describe('easeOf: 받기 쉬운 정도', () => {
  it('신청만 하면 받는 돈은 0', () => { for (const t of ['노란우산공제 희망장려금', '소상공인 고용보험료 지원', '[부산] 동백전 카드수수료 지원사업', '[부산] 소상공인 에너지바우처 지급']) expect(easeOf({ title: t })).toBe(0); });
  it('직원을 뽑아야 받는 돈은 2', () => { for (const t of ['고용안정장려금지원(정규직전환지원)', '2026년 청년일자리 도약장려금', '고령자 계속고용장려금']) expect(easeOf({ title: t })).toBe(2); });
  it('그 밖에는 1', () => expect(easeOf({ title: '소상공인 스마트상점 기술보급' })).toBe(1));
  it('식품·농산물 가공 공고는 제조에서 확인 필요', () => expect(industryGate({ category: '경영', title: '꿀 가공산업 육성 지원', fit: { industries: ['제조'] } }, '제조')).toBe('check'));
});

describe('textLimitGate: 요약에 적힌 한도', () => {
  const nr = { summary: '부산시 소재 연매출액 3억원 이하 소상공인 대상', rules: [] };
  it('매출 한도를 넘으면 제외', () => expect(textLimitGate(nr, { revenue: '5억~10억 원' })).toBe('out'));
  it('한도 안이면 그대로', () => expect(textLimitGate(nr, { revenue: '1억~3억 원' })).toBe('ok'));
  it('직원 5인 이상 사업은 직원 1~4명이면 제외', () => expect(textLimitGate({ summary: '고용보험 피보험자 5인 이상 기업 대상', rules: [] }, { employeeBand: '1~4명' })).toBe('out'));
  it('규칙이 있으면 요약은 보지 않는다', () => expect(textLimitGate({ summary: '연매출 3억원 이하', rules: [{ field: 'revenue' }] as never }, { revenue: '10억 원 이상' })).toBe('ok'));
});
describe('기타 업종·세부 산업', () => {
  it('업종 기타면 농업 공고는 확인 필요', () => expect(industryGate({ category: '농림축산어업', title: '농업용 면세유 유가연동보조금', fit: { industries: [] } }, '기타')).toBe('check'));
  it('화장품 박람회는 도소매라도 확인 필요', () => expect(industryGate({ category: '수출', title: '[충북] 이탈리아 볼로냐 코스모프로프 화장품 박람회', fit: { industries: [] } }, '제조')).toBe('check'));
  it('매출채권보험은 음식점 제외', () => expect(industryGate({ category: '경영', title: '매출채권보험료지원', fit: { industries: [] } }, '음식점')).toBe('out'));
});

describe('districtGate: 요약에 적힌 시·군·구', () => {
  const b = { title: '하수도요금 감면(소상공인)', summary: '거창군 소재 소상공인 사업장을 대상으로 하수도 사용료를 감면' };
  it('다른 시·군·구 사업장은 제외', () => expect(districtGate(b, '경상남도', '의령군')).toBe('out'));
  it('그 시·군·구면 해당', () => expect(districtGate(b, '경상남도', '거창군')).toBe('ok'));
  it('제목 앞 [시도] 시·군·구 목록', () => {
    const t = { title: '[경기] 수원시ㆍ용인시ㆍ화성시 2026년 청년일자리도약장려금', summary: '' };
    expect(districtGate(t, '경기도', '용인시')).toBe('ok');
    expect(districtGate(t, '경기도', '고양시')).toBe('out');
  });
  it('시·군·구가 없으면 그대로', () => expect(districtGate({ title: '경상남도 소상공인 지원', summary: '도내 소상공인' }, '경상남도', '의령군')).toBe('ok'));
});
describe('orgTargetGate: 조직 대상 공고', () => {
  it('농협·영농조합 대상은 확인 필요', () => expect(orgTargetGate({ summary: '농협조직, 농업법인, 협동조합 등이 대상' })).toBe('check'));
  it('소상공인도 대상이면 그대로', () => expect(orgTargetGate({ summary: '협동조합 및 소상공인 대상' })).toBe('ok'));
});

describe('7회차 표본에서 찾은 오류', () => {
  it('자동차 부품업종 공고는 제조라도 확인 필요', () => expect(industryGate({ category: '인력', title: '[울산] 2026년 자동차 부품업종 근로자 지역정착 지원사업', fit: { industries: ['제조'] } }, '제조')).toBe('check'));
  it('어선·양식 공고는 농림어업이라도 확인 필요', () => expect(industryGate({ category: '농림축산어업', title: '러시아감독관 승선선박 경비 지원', fit: { industries: [] } }, '농림어업')).toBe('ok'));
  it('작년 매출이 있어야 하는 공고는 올해 개업 제외', () => expect(textLimitGate({ summary: "'25년 연 매출액 0원 초과 1억 400만원 미만 소상공인", rules: [] }, { openedYear: 2026 }, new Date('2026-10-21T00:00:00Z'))).toBe('out'));
});

describe('8회차 표본에서 찾은 오류', () => {
  it('요약에 모빌리티 산업이라고 적힌 공고는 확인 필요', () => expect(industryGate({ category: '인력', title: '[대구] 2026년 지역 플러스 고용활력 프로젝트', summary: '대구지역 모빌리티 산업의 신규 고용 지원', fit: { industries: [] } } as never, '교육')).toBe('check'));
  it('제목이 소상공인이면 요약에 중소기업 말이 있어도 소상공인 규모로 본다', () => expect(smallBizGate({ title: '[경북] 2026년 소상공인 사회보험료 지원 사업', summary: '자영업자 고용보험료, 중소기업사업주 산재보험료 지원' }, { employeeBand: '10~29명', industry: '서비스' })).toBe('out'));
});

describe('10회차 표본에서 찾은 오류', () => {
  it('생애 첫 창업 지원은 오래된 사업장 제외', () => expect(stageGate({ title: '[경남] 하동군 2026년 소상공인 생애 첫 창업 지원사업' }, 2019, new Date('2026-10-21T00:00:00Z'))).toBe('out'));
  it('여행사 대상 공고는 확인 필요', () => expect(industryGate({ category: '경영', title: '외국인 관광객 유치 인센티브 지원', summary: '부산 관광객을 모객한 여행사를 대상으로', fit: { industries: [] } } as never, '서비스')).toBe('check'));
  it('착한가격업소 지원은 지정 업소만이라 확인 필요', () => expect(ownerGate({ title: '착한가격업소 인센티브 지원' })).toBe('check'));
  it('노동자 휴게시설은 직원이 있어야', () => expect(needsEmployees({ title: '[경남] 양산시 2026년 노동자 휴게시설 지원사업' }, '없음')).toBe(true));
});

describe('11회차 표본에서 찾은 오류', () => {
  it('업종 기타에 벤처 공고는 확인 필요', () => expect(industryGate({ category: '사업화', title: '2026년 벤처나라 벤처창업기업제품 등록 지원', fit: { industries: [] } }, '기타')).toBe('check'));
  it('요약에 폐업 후 재창업이 조건이면 확인 필요', () => expect(ownerGate({ title: '소상공인 임차료 지원', summary: '서구에서 60일 이상 사업 후 폐업하고 재창업한 임차 소상공인' })).toBe('check'));
  it('요약상 양식장 대상은 확인 필요', () => expect(industryGate({ category: '농림축산어업', title: '육상수조 EHP 지원', summary: '양식장 어가가 교체할 때', fit: { industries: [] } } as never, '농림어업')).toBe('check'));
});

describe('12회차: 지나치게 빼던 공고', () => {
  it('AI 관련 업종만 다르고 제목이 그 업종을 가리키지 않으면 확인 필요로 남긴다', () => expect(industryGate({ category: '고용·창업', title: '중소기업 기술유출 방지 시스템 구축 지원', fit: { industries: ['정보통신'] } }, '제조')).toBe('ok'));
  it('소상공인 고용보험 가입 지원은 직원 없어도 남긴다', () => expect(needsEmployees({ title: '소상공인 고용보험 가입 지원' }, '없음')).toBe(false));
});

describe('13회차', () => {
  it('요약에 2026.1.1. 이후 개업이면 2025년 개업 제외', () => expect(stageGate({ title: '[경남] 함양군 소규모 창업자 창업자금', summary: '예비창업자 또는 초기창업자(2026.1.1. 이후 개업)를 대상으로' }, 2025, new Date('2026-10-21T00:00:00Z'))).toBe('out'));
  it('회원사 대상은 확인 필요', () => expect(orgTargetGate({ summary: '경북수출기업협회 유료회원사를 대상으로' })).toBe('check'));
});

describe('15회차', () => {
  it('업종 기타에 요약상 모빌리티 산업 공고는 확인 필요', () => expect(industryGate({ category: '인력', title: '[대구] 지역 플러스 고용활력 프로젝트', summary: '대구지역 모빌리티 산업의 신규 고용', fit: { industries: [] } } as never, '기타')).toBe('check'));
  it('축산물 판매업소 공고는 음식점 제외', () => expect(industryGate({ category: '경영', title: '축산물 판매업소 위생시설 개선 지원', fit: { industries: [] } }, '음식점')).toBe('out'));
  it('코로나 손실보상은 특정 상황', () => expect(ownerGate({ title: '소상공인 손실보상금 지원(현장신청 지원)' })).toBe('check'));
});

describe('18회차', () => {
  it('요약상 근로자를 고용한 사업주 대상이면 직원 없음 제외', () => expect(needsEmployees({ title: '[충남] 2026년 3분기분 소상공인 사회보험료 지원사업 공고', summary: '10인 미만 근로자를 고용한 소상공인 중 두루누리 지원을 받고 있는 사업주' }, '없음')).toBe(true));
  it('자영업자 본인 보험료는 그대로', () => expect(needsEmployees({ title: '[전북] 2026년 자영업자 사회보험료 지원', summary: '고용보험 또는 산재보험에 가입한 자영업자의 사회보험료 일부 지원' }, '없음')).toBe(false));
});

describe('20회차', () => {
  it('1인 소상공인 사업은 직원이 있으면 제외', () => expect(smallBizGate({ title: '1인 소상공인 고용보험료 지원', summary: '근로자가 없는 1인 소상공인' }, { employeeBand: '1~4명', industry: '도소매' })).toBe('out'));
  it('1인 소상공인 사업은 직원 없음이면 그대로', () => expect(smallBizGate({ title: '1인 소상공인 고용보험료 지원', summary: '근로자가 없는 1인 소상공인' }, { employeeBand: '없음', industry: '도소매' })).toBe('ok'));
});

describe('rentGate: 자가 사업장', () => {
  it('자가면 임차료 지원 제외', () => expect(rentGate({ title: '청년 사업자 및 창업자 월 임차료 지원' }, '자가')).toBe('out'));
  it('임차면 그대로', () => expect(rentGate({ title: '청년 사업자 및 창업자 월 임차료 지원' }, '임차')).toBe('ok'));
  it('기숙사 임차비는 거르지 않는다', () => expect(rentGate({ title: '중소기업 노동자 기숙사 임차비 지원' }, '자가')).toBe('ok'));
});
