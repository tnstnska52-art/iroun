/*
 * 홈페이지 지원금 판정 자동 점검.
 * 여러 고객 조건을 만들어 결과를 돌리고, "이 고객에게 조건 일치로 나오면 안 되는" 공고를 찾아낸다.
 * 사용: window.__C2(판정 함수 묶음), window.__L(공고 목록)을 준비한 뒤 window.__audit() 실행.
 */
(function () {
  var SHORT = { '서울특별시': '서울', '경기도': '경기', '인천광역시': '인천', '부산광역시': '부산', '대구광역시': '대구', '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남', '전북특별자치도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주' };
  var FULLNAMES = { '서울': /서울/, '경기': /경기(?!\s*(침체|회복|부진|살리기|활성))|경기도/, '인천': /인천/, '부산': /부산/, '대구': /대구/, '광주': /광주(?!시)/, '대전': /대전(?!\s*참가)/, '울산': /울산/, '세종': /세종/, '강원': /강원/, '충북': /충북|충청북도/, '충남': /충남|충청남도/, '전북': /전북|전라북도/, '전남': /전남|전라남도/, '경북': /경북|경상북도/, '경남': /경남|경상남도/, '제주': /제주/ };
  var IND_WORDS = {
    '농림어업': /농업|농가|농촌|어업|어가|어촌|축산|임업|산림|수산|양식|귀농|양봉|버섯|과수|화훼|쌀|한우|낙농/,
    '제조': /제조|공장|소공인|뿌리\s*기업|사출|공정|금형|스마트\s*공장|부품|소재/,
    '정보통신': /소프트웨어|SW|플랫폼|앱\s*개발|AI|인공지능|데이터|클라우드|정보보호|ICT|콘텐츠|게임|웹툰|방송|언론|취재/,
    '숙박': /숙박|호텔|펜션|민박|게스트하우스/,
    '운수': /택시|버스|화물|운송|물류/,
    '건설': /건설|건축|공사업|전문건설/,
    '보건·복지': /의료|병원|의원|약국|요양|돌봄\s*기관|어린이집\s*운영/,
    '음식점': /음식점|외식|식당|요식/,
    '교육': /학원|교습소/,
  };
  var STAFF = /고용|채용|인턴|근로자|직원|인력|퇴직\s*연금|정규직|육아\s*휴직|일자리|일\s*경험|대체\s*인력|인재/;
  var SELF = /자영업자|1인|대표자|본인|보험료/;
  function sample(arr, i) { return arr[i % arr.length]; }
  function personas(n) {
    var C = window.__C2, D = C.DISTRICTS, P = Object.keys(D), out = [];
    var IND = ['음식점', '도소매', '서비스', '제조', '건설', '운수', '숙박', '교육', '보건·복지', '정보통신', '농림어업', '기타'];
    var EMP = ['없음', '1~4명', '5~9명', '10~29명', '30명 이상'];
    var OPEN = [2026, 2025, 2023, 2020, 2015, 2009];
    var REV = ['5천만 원 미만', '5천만~1억 원', '1억~3억 원', '3억~5억 원', '5억~10억 원', '10억 원 이상'];
    for (var i = 0; i < n; i++) {
      var pv = sample(P, i * 7 + 3), ds = D[pv];
      out.push({
        entity: i % 5 === 0 ? '법인' : '개인', industry: sample(IND, i), province: pv, district: ds[(i * 13) % ds.length],
        openedYear: sample(OPEN, i * 3 + 1), revNow: sample(REV, i * 5 + 2), revLast: sample(REV, i * 5 + 2),
        employeeBand: sample(EMP, i * 11 + 4), premises: i % 3 ? '임차' : '자가', woman: i % 4 === 1 ? '예' : '아니오',
        credit: '750~799점', loans: [], bad: ['해당 없음'], loanAmt: {}
      });
    }
    return out;
  }
  /* 한 공고가 이 고객에게 '조건 일치'로 나오면 안 되는 이유. 없으면 null */
  function wrong(b, a, x) {
    var t = b.title, me = SHORT[a.province];
    // 1) 다른 시·도/시·군·구
    var head = t.match(/^\s*\[([^\]]+)\]\s*([가-힣]+(시|군|구))?/);
    if (head) {
      var tag = head[1].replace(/\s/g, '');
      var okTag = tag.indexOf(me) >= 0 || tag === '전국' || (tag.indexOf('전남광주') >= 0 && (me === '전남' || me === '광주'));
      if (!okTag && Object.keys(FULLNAMES).some(function (k) { return tag.indexOf(k) >= 0; })) return '다른 시·도 [' + tag + ']';
      if (head[2] && okTag) {
        var listed = (t.match(/[가-힣]+(시|군|구)/g) || []).slice(0, 4);
        var ds = window.__C2.DISTRICTS[a.province] || [];
        var named = listed.filter(function (d) { return ds.indexOf(d) >= 0; });
        if (named.length && named.indexOf(a.district) < 0 && !/전\s*지역|전역/.test(t)) return '다른 시·군·구 ' + named.join(',');
      }
    }
    // 2) 다른 업종 전용으로 보이는 공고
    if (a.industry !== '기타') {
      for (var ind in IND_WORDS) {
        if (ind === a.industry) continue;
        if (IND_WORDS[ind].test(t) && !(IND_WORDS[a.industry] && IND_WORDS[a.industry].test(t))) {
          if (ind === '음식점' && a.industry === '숙박') continue;
          return '업종 ' + ind + ' 공고';
        }
      }
    }
    // 3) 직원 없음
    if (a.employeeBand === '없음' && STAFF.test(t) && !SELF.test(t)) return '직원 없음인데 고용 사업';
    // 4) 대표자
    if (a.woman === '아니오' && /여성/.test(t) && !/여성\s*(근로자|고용|인력|경력)/.test(t)) return '여성 대표 전용';
    if (/청년\s*(창업|대표|사업자|CEO|기업|소상공인)|만\s*39세|중장년\s*창업|시니어\s*창업/.test(t)) return '대표자 나이 조건(출생연도 안 물음)';
    if (/장애인|북한\s*이탈|보훈|다문화|한부모/.test(t)) return '특정 대상자';
    // 5) 사업자 형태
    if (a.entity === '개인' && /(?<!개인\s*)법인(?!\s*(및|·|ㆍ|,)\s*개인)/.test(t) && !/개인/.test(t)) return '법인 전용으로 보임';
    if (a.entity === '법인' && /개인\s*사업자/.test(t) && !/법인/.test(t)) return '개인사업자 전용으로 보임';
    // 6) 업력
    if (a.openedYear <= 2022 && /예비\s*창업|초기\s*창업|창업\s*초기|신규\s*창업|창업\s*\d\s*년\s*(이내|미만)|청년\s*창업/.test(t)) return '창업 초기 전용인데 업력 ' + (2026 - a.openedYear) + '년';
    if (a.openedYear >= 2025 && /재\s*창업|업력\s*\d+\s*년\s*이상/.test(t)) return '업력 조건';
    // 7) 규모
    if (/중견\s*기업|대기업|상장/.test(t) && !/중소/.test(t)) return '중견·대기업 대상';
    // 8) 특정 상황
    if (/산재|폐업|재기|사업\s*정리|휴업|고용\s*유지|실업\s*급여|재해|피해/.test(t)) return '특정 상황 전용';
    return null;
  }
  window.__audit = function (n, opts) {
    opts = opts || {};
    var C = window.__C2, L = window.__L, ps = personas(n || 300), errs = {}, ex = {}, total = 0, sureTotal = 0, tops = [];
    L.forEach(function (b) { delete b._mt; });
    ps.forEach(function (a, i) {
      C.S.ans = a;
      var e = C.estimate(L, C.profile());
      var sure = e.items.filter(function (x) { return x.result === '조건 일치'; });
      sureTotal += sure.length;
      sure.forEach(function (x) {
        total++;
        var w = wrong(x.benefit, a, x);
        if (w) {
          var k = w.replace(/\[.*|\d+년|[가-힣]+(시|군|구)(,[가-힣]+(시|군|구))*/g, '').trim();
          errs[k] = (errs[k] || 0) + 1;
          (ex[k] = ex[k] || []).length < (opts.ex || 4) && ex[k].push(a.industry + '/' + SHORT[a.province] + ' ' + a.district + '/' + a.employeeBand + '/' + a.entity + '/' + a.openedYear + ' → ' + x.benefit.title.slice(0, 50) + ' (' + w + ')');
        }
      });
      if (i < (opts.tops || 0)) tops.push(a.industry + '/' + SHORT[a.province] + '/' + a.employeeBand + ': ' + sure.slice(0, 5).map(function (x) { return x.benefit.title.slice(0, 22); }).join(' | '));
    });
    var bad = Object.keys(errs).reduce(function (s, k) { return s + errs[k]; }, 0);
    return { personas: ps.length, sureAvg: +(sureTotal / ps.length).toFixed(1), checked: total, flagged: bad, rate: total ? +(bad / total * 100).toFixed(2) + '%' : '0%', byType: errs, examples: ex, tops: tops };
  };
})();
