import { chromium } from "playwright";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
if(process.platform==="linux"&&!execFileSync("fc-list",[":lang=ko"],{encoding:"utf8"}).trim())throw new Error("한글 글꼴이 없어 화면 크기 검증을 중단합니다. docs/verification/2026-10-11-company-services/README.ko.md의 FONTCONFIG_FILE 준비를 확인하세요.");

const base=`https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
if(!process.env.REPLIT_EXPO_DEV_DOMAIN) throw new Error("개발 미리보기 주소가 없습니다.");
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:375,height:812}});
const page=await context.newPage(),results=[],errors=[];
page.on("pageerror",e=>errors.push(e.message));
async function visit(path,text) {
  await page.goto(base+path,{waitUntil:"domcontentloaded"});
  await page.getByText(text,{exact:false}).first().waitFor({timeout:90000});
}
async function check(name,fn){await fn();results.push(name);console.log("PASS",name);}
try{
  await check("무료 홈: 일반 안내와 실제 공고",async()=>{
    await visit("/","이로운혜택");
    await page.getByText("소담스퀘어",{exact:false}).first().waitFor({timeout:45000});
    assert(!(await page.locator("body").innerText()).includes("예상 환급액"));
  });
  await check("일반 목록 4개와 환급금 검색",async()=>{
    await visit("/benefits","혜택 찾기");
    const search=page.getByTestId("search-input");
    await search.fill("환급");
    await page.getByText("국세환급금 공식 조회 안내",{exact:true}).waitFor({timeout:15000});
    await search.fill("검색결과없음123");
    await page.getByText("없",{exact:false}).first().waitFor();
    await search.fill("");
  });
  await check("무료 상세에서 공식 출처·확인일 표시",async()=>{
    await visit("/benefit/nts-earned-income","근로장려금 제도 안내");
    const body=await page.locator("body").innerText();
    assert(body.includes("국세청"));assert(body.includes("공식"));assert(body.includes("확인"));
    assert(!body.includes("나의 예상 금액"));
  });
  await check("큰 글씨 실제 토글과 재시작 유지",async()=>{
    await visit("/account","내 정보");
    const toggle=page.getByTestId("large-text-toggle");
    await toggle.click();
    await page.waitForTimeout(400);
    assert.equal(await toggle.getAttribute("aria-checked"),"true");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByTestId("large-text-toggle").waitFor({timeout:45000});
    assert.equal(await page.getByTestId("large-text-toggle").getAttribute("aria-checked"),"true");
  });
  await check("큰 글씨 320·375px 공개 화면 가로 잘림 검사",async()=>{
    for(const width of [320,375]){
      await page.setViewportSize({width,height:812});
      for(const [path,text] of [["/","이로운혜택"],["/benefits","혜택 찾기"],["/benefit/nts-earned-income","근로장려금 제도 안내"],["/account","내 정보"],["/legal","개인정보처리방침"]]){
        await visit(path,text);await page.waitForTimeout(700);
        const overflow=await page.evaluate(()=>{
          const w=innerWidth;
          return [...document.querySelectorAll('[dir="auto"]')].filter(el=>{
            const r=el.getBoundingClientRect(),style=getComputedStyle(el);
            return r.width>0&&r.height>0&&style.visibility!=="hidden"&&r.right>w+2&&el.textContent.trim();
          }).map(el=>el.textContent.slice(0,70));
        });
        assert.deepEqual(overflow,[],`${width}px ${path} 화면 바깥 글자: ${overflow}`);
      }
    }
  });
  await check("개인정보·약관·웹 삭제요청·소개 공개 경로",async()=>{
    for(const [path,text] of [["/about","정부기관"],["/legal?section=terms","이용약관"],["/delete-request","탈퇴"],["/delete-account","탈퇴"]]) await visit(path,text);
  });
  await check("한 질문 입력·모름 선택·이전·재시작 이어하기",async()=>{
    await visit("/onboarding","동의");
    await page.getByTestId("consent-toggle").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-input").fill("1960");
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("opt-부산광역시").click();
    await page.getByTestId("wizard-input").fill("해운대구");
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-unknown").click();
    await page.getByText("함께 사는 가구원",{exact:false}).waitFor();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByText("함께 사는 가구원",{exact:false}).waitFor({timeout:30000});
    await page.getByTestId("wizard-back").click();
    await page.getByText("가구 소득",{exact:false}).waitFor();
    assert((await page.locator("body").innerText()).includes("모르겠어요"));
  });
  await check("고객 비회원 관리자 차단 화면",async()=>{
    await visit("/admin","로그인");
    assert(!(await page.locator("body").innerText()).includes("새 공지 작성"));
  });
  assert.deepEqual(errors,[],"브라우저 실행 오류");
  console.log(JSON.stringify({passed:results.length,tests:results,nativeDeviceChecked:false,realSignInChecked:false},null,2));
}finally{await browser.close();}
