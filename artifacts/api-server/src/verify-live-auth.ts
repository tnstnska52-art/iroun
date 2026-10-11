import { chromium } from "playwright";
import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import {verifyCompanyBrowser} from "./verify-company-browser";

// Uses Clerk's documented development-only +clerk_test email/424242 OTP.
// No real email is sent. No password, token or identity is printed.
const email=`qa-${randomUUID()}+fixture@example.invalid`;
if(process.env.NODE_ENV==="production" || process.env.REPLIT_DEPLOYMENT==="1") throw new Error("이 검증은 개발 환경에서만 실행할 수 있습니다.");
const password=`Qa!${randomBytes(24).toString("hex")}`;
const base=`https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const api=`https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:375,height:812}});
page.setDefaultTimeout(45000);
const go=(path:string)=>page.goto(base+path,{waitUntil:"domcontentloaded",timeout:60000});
let secondary:string|undefined;
let id:string|undefined;
const passed:string[]=[];
const deletePath=process.argv.includes("--web-delete")?"/delete-request":"/delete-account";
const recommendationOnly=process.argv.includes("--recommendation-web-only");
const focusedWebDelete=process.argv.includes("--focused-web-delete");
const focusedCompanyQuality=process.argv.includes("--focused-company-quality");
const notices:string[]=[];
async function check(name:string,fn:()=>Promise<void>){await fn();passed.push(name);console.log("PASS",name);}
async function call(path:string,method="GET",body?:unknown) {
  await page.waitForFunction(()=>!!(globalThis as any).Clerk?.session,{}, {timeout:20000});
  return page.evaluate(async({url,method,body})=>{
    const clerk=(globalThis as unknown as {Clerk:{session:{getToken:()=>Promise<string>}}}).Clerk;
    let timer:ReturnType<typeof setTimeout>;
    const token=await Promise.race([clerk.session.getToken(),new Promise<string>((_,reject)=>{timer=setTimeout(()=>reject(new Error("검사 중 인증 토큰 확인이 20초를 초과했습니다.")),20000);})]).finally(()=>clearTimeout(timer));
    const r=await fetch(url,{method,signal:AbortSignal.timeout(20000),headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json() as any,cache:r.headers.get("cache-control")};
  },{url:api+path,method,body});
}
try{
  if(focusedWebDelete&&(deletePath!=="/delete-request"||!process.argv.includes("--delete-only")))throw new Error("Focused web deletion requires --web-delete --delete-only.");
  if(focusedCompanyQuality&&!process.argv.includes("--services-office"))throw new Error("Focused company-quality mode requires --services-office.");
  // Documented development test helper for bot detection only.
  // Never loaded by the app or applied to production.
  await clerkSetup();
  await setupClerkTestingToken({page});
  await check("실제 Clerk 개발 인증: 앱 가입·이메일 코드·세션",async()=>{
    await go("/auth?mode=signup");
    await page.getByTestId("email-input").waitFor({timeout:45000});
    await page.getByTestId("email-input").fill(email);
    await page.getByTestId("password-input").fill(password);
    await page.getByTestId("password2-input").fill(password);
    await page.getByRole("switch",{name:"계정 정보 수집·이용에 동의합니다"}).click();
    await page.getByRole("switch",{name:"이용약관을 확인하고 동의합니다"}).click();
    await page.getByTestId("auth-submit").click();
    try{await page.getByTestId("code-input").waitFor({timeout:20000});}
    catch{throw new Error("실제 가입 화면 오류: "+(await page.locator("body").innerText()).replaceAll(email,"[시험계정]").slice(-2400));}
    await page.getByTestId("code-input").fill("424242");
    await page.getByTestId("verify-submit").click();
    try{await page.waitForURL(u=>!u.pathname.includes("/auth"),{timeout:15000,waitUntil:"domcontentloaded"});}
    catch{throw new Error("이메일 확인 뒤 실제 화면: "+(await page.locator("body").innerText()).replaceAll(email,"[시험계정]").slice(-2000));}
    const r=await call("/me");
    assert.equal(r.status,200);id=r.body.id;
    assert.equal(r.body.preferences.accountConsent,true);
    assert.equal(r.body.preferences.termsConsent,true);
  });
  if(focusedCompanyQuality){
    await verifyCompanyBrowser({page,id:id!,go,call,check,office:true,focusedQuality:true,credentials:{email,password},registerEmployee:async()=>{
      const staffEmail=`qa-staff-${randomUUID()}+fixture@example.invalid`;
      const u=await clerkClient.users.createUser({emailAddress:[staffEmail],password});secondary=u.id;
      await pool.query("INSERT INTO iroun_accounts(id) VALUES($1)",[secondary]);
      return{id:secondary,email:staffEmail,password};
    }});
  }else{
  if(recommendationOnly){
    const consoleErrors:string[]=[];
    const pageErrors:string[]=[];
    const blockedRecommendationResponses:string[]=[];
    let consolePhase="active-trial";
    const safe=(s:string)=>s.replaceAll(email,"[TEST ACCOUNT]").replaceAll(password,"[REDACTED]").replace(/(Bearer\s+)\S+/gi,"$1[REDACTED]").slice(0,600);
    page.on("console",msg=>{if(msg.type()==="error")consoleErrors.push(`${consolePhase}: ${safe(msg.text())}`);});
    page.on("pageerror",e=>pageErrors.push(safe(e.message)));
    page.on("response",r=>{if(r.status()===403&&r.url().endsWith("/api/recommendations"))blockedRecommendationResponses.push("/api/recommendations 403");});
    await check("체험 계정 추천 Notice: 홈·혜택·정렬·상세·뒤로·새로고침",async()=>{
      await call("/preferences","PUT",{largeText:false,privacyConsent:true,notifications:false,personalizedAlerts:false,accountConsent:true,termsConsent:true});
      const profile={personal:{province:"경상남도",district:"김해시",employment:["사업자"]},businesses:[{id:"qa-rec-a",province:"경상남도",district:"김해시",industry:"음식점"}],step:9};
      assert.equal((await call("/profile","PUT",profile)).status,200);
      await go("/access");
      await page.getByTestId("svc-consent-service").waitFor({timeout:30000});
      const consent=page.waitForResponse(r=>r.url().endsWith("/api/service/consents")&&r.request().method()==="POST");
      await page.getByTestId("svc-consent-service").click();assert.equal((await consent).status(),200);
      const trial=page.waitForResponse(r=>r.url().endsWith("/api/service/trial")&&r.request().method()==="POST");
      await page.getByTestId("svc-start-trial").click();assert.equal((await trial).status(),200);
      assert((await call("/me")).body.entitlement.trialActive);
      await go("/");
      await page.getByTestId("home-all").waitFor({timeout:30000});
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/recommendation-home-trial.jpg"});
      await page.getByTestId("home-all").click();
      await page.getByTestId("sort-recommended").waitFor({timeout:30000});
      await page.getByTestId("sort-recommended").click();
      const notice=page.getByText(/조건 일치, 추가 확인 필요 순입니다/);
      await notice.waitFor({state:"visible"});
      const noticeTag=await notice.evaluate(e=>e.tagName);
      console.log("recommendation Notice text node:",noticeTag);
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/recommendation-notice.jpg"});
      await page.getByTestId("sort-deadline").click();
      await notice.waitFor({state:"hidden"});
      await page.getByTestId("sort-recommended").click();
      await notice.waitFor({state:"visible"});
      const cards=page.locator('[data-testid^="benefit-"]:not([aria-hidden="true"] *)');
      await cards.first().waitFor({state:"visible"});
      const selected=await cards.first().getAttribute("data-testid");
      console.log("recommended detail source card:",selected);
      await cards.first().click();
      await page.waitForURL(u=>u.pathname.startsWith("/benefit/"),{timeout:20000});
      await page.getByTestId("open-source").waitFor({timeout:30000});
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/recommendation-detail.jpg"});
      await page.getByTestId("back-button").click();
      await page.getByTestId("sort-recommended").waitFor({timeout:30000});
      assert.equal(await page.getByTestId("sort-recommended").getAttribute("aria-pressed"),"true");
      await notice.waitFor({state:"visible"});
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/recommendation-back.jpg"});
      const refreshed=page.waitForResponse(r=>r.url().endsWith("/api/me")&&r.status()===200,{timeout:30000});
      await page.reload({waitUntil:"domcontentloaded"});await refreshed;
      await page.getByTestId("sort-recommended").waitFor({timeout:30000});
      await page.getByTestId("sort-recommended").click();
      await notice.waitFor({state:"visible"});
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/recommendation-after-reload.jpg"});
    });
    await check("체험 만료/free 차단·공개 공고 유지",async()=>{
      consolePhase="expired-free block";
      await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 second' WHERE user_id=$1",[id]);
      const refreshed=page.waitForResponse(r=>r.url().endsWith("/api/me")&&r.status()===200,{timeout:30000});
      await page.reload({waitUntil:"domcontentloaded"});await refreshed;
      await page.getByTestId("result-count").waitFor({timeout:30000});
      assert.equal(await page.getByTestId("sort-recommended").count(),0);
      const publicList=await call("/benefits");
      assert.equal(publicList.status,200);assert(publicList.body.length>0);
      assert([401,403].includes((await call("/recommendations")).status));
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/recommendation-expired-public-list.jpg"});
      console.log("expired entitlement public result count:",await page.getByTestId("result-count").innerText());
    });
    console.log("WEB_CONSOLE_ERRORS",JSON.stringify({consoleErrors,pageErrors,blockedRecommendationResponses}));
    assert.deepEqual(consoleErrors.filter(e=>!e.startsWith("expired-free block: Failed to load resource")),[]);
    assert.equal(pageErrors.length,0,"unexpected browser page error");
    assert(blockedRecommendationResponses.length>0,"expired personalized endpoint was not observed as blocked");
  }else if(process.argv.includes("--onboarding-only")){
    const focusedIssues:string[]=[];
    await check("실제 가입 계정 홈·무료 제한 상태",async()=>{
      await go("/");
      await page.getByTestId("home-personalized").waitFor({timeout:30000});
      await page.screenshot({path:"../../generated-artifacts/iroun-auth-home.jpg"});
    });
    await check("집중 온보딩: 명시적 모름·0명·근로자+사업자·저장 실패 후 재시도",async()=>{
      await go("/onboarding");
      await page.getByTestId("consent-toggle").waitFor({timeout:30000});
      await page.getByTestId("consent-toggle").click();
      await page.getByTestId("wizard-next").click();
      await page.getByText("태어난 해는 언제인가요?",{exact:true}).waitFor();
      await page.getByTestId("wizard-unknown").click();
      await page.getByText("지금 사시는 곳은 어느 시·도인가요?",{exact:true}).waitFor();
      await page.getByTestId("opt-부산광역시").click();
      await page.getByTestId("wizard-input").fill("해운대구");
      await page.getByTestId("wizard-next").click();
      await page.getByText("가구 소득 수준은 어느 쪽에 가까운가요?",{exact:true}).waitFor();
      await page.getByTestId("opt-중위소득 100% 이하").click();
      await page.getByText("함께 사는 가구원은 몇 명인가요?",{exact:true}).waitFor();
      await page.getByTestId("opt-2인").click();
      await page.getByText("부양자녀는 몇 명인가요?",{exact:true}).waitFor();
      await page.getByTestId("wizard-input").fill("0");
      await page.getByTestId("wizard-next").click();
      await page.getByText("사시는 집은 어떤 형태인가요?",{exact:true}).waitFor();
      await page.getByTestId("opt-월세").click();
      await page.getByText("지금 하시는 일은 무엇인가요?",{exact:true}).waitFor();
      await page.getByTestId("opt-근로자").click();
      await page.getByTestId("opt-사업자").click();
      assert.equal(await page.getByTestId("opt-근로자").getAttribute("aria-pressed"),"true");
      assert.equal(await page.getByTestId("opt-사업자").getAttribute("aria-pressed"),"true");
      await page.screenshot({path:"../../generated-artifacts/iroun-onboarding-employment.jpg"});
      await page.getByTestId("wizard-next").click();
      await page.getByText("사업장 정보",{exact:true}).waitFor();
      let profile=(await call("/me")).body.profile;
      assert.equal(profile.personal.children,0);
      assert.deepEqual(profile.personal.employment,["근로자","사업자"]);
      assert(profile.unknownAnswers.includes("personal.birthYear"));
      assert(!profile.unknownAnswers.includes("personal.children"));

      const add=page.waitForResponse(r=>r.url().endsWith("/api/profile")&&r.request().method()==="PUT");
      await page.getByTestId("add-business").click();
      assert.equal((await add).status(),200);
      await page.getByText("사업장 이름을 알려주세요",{exact:true}).waitFor();
      await page.getByTestId("wizard-input").fill("개발 시험 사업장");
      const failPath="**/api/profile";
      await page.route(failPath,async route=>{
        if(route.request().method()==="PUT")await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"개발 시험 저장 장애"})});
        else await route.continue();
      });
      const failed=page.waitForResponse(r=>r.url().endsWith("/api/profile")&&r.request().method()==="PUT");
      await page.getByTestId("wizard-next").click();
      assert.equal((await failed).status(),503);
      await page.getByText(/서버에 저장하지 못해 다음으로 넘어가지 않았습니다/).waitFor();
      assert.equal(await page.getByTestId("wizard-input").inputValue(),"개발 시험 사업장");
      assert((await page.locator("body").innerText()).includes("사업장 이름을 알려주세요"));
      await page.screenshot({path:"../../generated-artifacts/iroun-onboarding-save-failed.jpg"});
      await page.unroute(failPath);
      await page.reload({waitUntil:"domcontentloaded"});
      try{await page.getByText("사업장 이름을 알려주세요",{exact:true}).waitFor({timeout:8000});}
      catch{console.log("reload diagnostic",new URL(page.url()).pathname,(await page.locator("body").innerText()).replaceAll(email,"[시험계정]").slice(-1200));}
      await go("/onboarding");
      await page.getByText(/사업장 이름을 알려주세요|사업장은 어느 시·도에 있나요/).waitFor({timeout:30000});
      await page.screenshot({path:"../../generated-artifacts/iroun-onboarding-after-reload.jpg"});
      const resumed=(await page.locator("body").innerText()).includes("사업장 이름을 알려주세요");
      console.log("onboarding draft resume:",resumed?"name question":"a later question");
      if(!resumed)await page.getByTestId("wizard-back").click();
      await page.getByText("사업장 이름을 알려주세요",{exact:true}).waitFor();
      await page.getByTestId("wizard-input").waitFor();
      assert.equal(await page.getByTestId("wizard-input").inputValue(),"개발 시험 사업장");
      const saved=page.waitForResponse(r=>r.url().endsWith("/api/profile")&&r.request().method()==="PUT");
      await page.getByTestId("wizard-next").click();
      assert.equal((await saved).status(),200);
      await page.getByText("사업장은 어느 시·도에 있나요?",{exact:true}).waitFor();
      profile=(await call("/me")).body.profile;
      assert.equal(profile.businesses[0].name,"개발 시험 사업장");
      assert.equal(profile.personal.children,0);
      assert.deepEqual(profile.personal.employment,["근로자","사업자"]);
      assert(profile.unknownAnswers.includes("personal.birthYear"));
      await page.screenshot({path:"../../generated-artifacts/iroun-onboarding-retry-saved.jpg"});
      console.log("PASS isolated account profile metadata and 503-save retry completed");
      if(!resumed)focusedIssues.push("서버 저장 실패 뒤 새로고침에서 다음 사업장 질문으로 이동했습니다.");
    });
    await check("실제 인증 홈: 체험 이용 상태·실제 회사 접수 요약",async()=>{
      const seeded={personal:{province:"부산광역시",district:"해운대구",birthYear:1960},businesses:[{id:"qa-a",province:"경상남도",district:"김해시",industry:"음식점"},{id:"qa-b",province:"부산광역시",district:"수영구"}],step:8};
      assert.equal((await call("/profile","PUT",seeded)).status,200);
      await go("/access");
      await page.getByTestId("svc-consent-service").waitFor({timeout:30000});
      const consent=page.waitForResponse(r=>r.url().endsWith("/api/service/consents")&&r.request().method()==="POST");
      await page.getByTestId("svc-consent-service").click();assert.equal((await consent).status(),200);
      const trial=page.waitForResponse(r=>r.url().endsWith("/api/service/trial")&&r.request().method()==="POST");
      await page.getByTestId("svc-start-trial").click();assert.equal((await trial).status(),200);
      assert((await call("/me")).body.entitlement.trialActive);
      const matches=await call("/service/matches");assert.equal(matches.status,200);
      const item=matches.body.items[0];assert(item?.matches?.length);
      const request=await call("/service/requests","POST",{benefitId:item.benefit.id,businessId:item.matches[0].businessId,kind:"자격 확인",confirmed:true});
      assert.equal(request.status,200);
      await go("/");
      await page.getByTestId("home-access").waitFor({timeout:30000});
      await page.getByText("72시간 체험 이용 중",{exact:false}).waitFor();
      await page.getByText("회사 진행 1건",{exact:false}).waitFor();
      await page.screenshot({path:"../../generated-artifacts/iroun-auth-home-request-summary.jpg"});
    });
    await check("맞춤 정렬은 유효 권한에만 표시·만료 후 일반목록 유지",async()=>{
      await go("/benefits");
      await page.getByTestId("sort-recommended").click();
      await page.getByText("조건 일치, 추가 확인 필요 순입니다.",{exact:false}).waitFor();
      assert.equal((await call("/service/matches")).status,200);
      await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 second' WHERE user_id=$1",[id]);
      await go("/account");
      await page.reload({waitUntil:"domcontentloaded"});
      await go("/benefits");
      await page.getByTestId("sort-recommended").waitFor({state:"hidden",timeout:30000});
      assert.equal((await call("/service/matches")).status,403);
      await page.getByTestId("search-input").waitFor();
    });
    if(focusedIssues.length){console.log("FOCUSED_FAILURES",focusedIssues);throw new Error(focusedIssues.join(" "));}
  }else if(focusedWebDelete){
    await check("웹 삭제 확인·취소·503 실패는 삭제 성공으로 보이지 않음",async()=>{
      await go("/");
      await page.getByTestId("footer-delete").click();
      await page.getByTestId("delete-confirm-input").waitFor({timeout:30000});
      const confirm=page.getByTestId("delete-confirm-input");
      const submit=page.getByTestId("delete-submit");
      assert.equal(await submit.isDisabled(),true);
      await confirm.fill("취소할 입력");
      assert.equal(await submit.isDisabled(),true);
      await confirm.fill("회원 탈퇴");
      assert.equal(await submit.isEnabled(),true);
      assert((await page.locator("body").innerText()).includes("스토어 구독은 자동으로 해지되지 않으므로 먼저 스토어에서 해지해 주세요."));
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/delete-request-confirmation.jpg"});
      await page.getByTestId("back-button").click();
      await page.waitForURL(u=>u.pathname==="/",{timeout:15000});
      assert.equal((await call("/me")).status,200);
      assert.equal((await pool.query("SELECT * FROM iroun_deletions WHERE user_id=$1",[id])).rowCount,0);
      await page.getByTestId("footer-delete").click();
      await page.getByTestId("delete-confirm-input").waitFor({timeout:30000});
      await page.getByTestId("delete-confirm-input").fill("회원 탈퇴");
      await page.route("**/api/account/deletion",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"검증용 일시 장애"})}));
      const failed=page.waitForResponse(r=>r.url().endsWith("/api/account/deletion")&&r.request().method()==="POST");
      await page.getByTestId("delete-submit").click();
      assert.equal((await failed).status(),503);
      await page.getByText("서비스 준비가 아직 끝나지 않았습니다. 출시 전 확인 중입니다.",{exact:true}).waitFor();
      assert.equal(await page.getByTestId("delete-confirm-input").inputValue(),"회원 탈퇴");
      assert.equal((await call("/me")).status,200);
      assert.equal((await pool.query("SELECT * FROM iroun_deletions WHERE user_id=$1",[id])).rowCount,0);
      assert.equal((await pool.query("SELECT deleted_at FROM iroun_accounts WHERE id=$1",[id])).rows[0].deleted_at,null);
      await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/delete-request-mock-503.jpg"});
      await page.unroute("**/api/account/deletion");
    });
  }else{
  await check("실제 인증 토큰으로 무료·관리자 접근 차단",async()=>{
    assert.equal((await call("/recommendations")).status,403);
    assert.equal((await call("/admin/dashboard")).status,403);
    const r=await call("/me?userId=not-my-account");
    assert.equal(r.body.id,id);assert(r.cache?.includes("no-store"));
  });
  await check("실제 로그인 계정 거주지·복수사업장 저장 및 재조회",async()=>{
    await call("/preferences","PUT",{largeText:true,privacyConsent:true,notifications:true,personalizedAlerts:false,accountConsent:true,termsConsent:true});
    const profile={personal:{province:"부산광역시",district:"해운대구",birthYear:1960,employment:["근로자","사업자"]},businesses:[{id:"a",province:"경상남도",district:"김해시",industry:"음식점"},{id:"b",province:"부산광역시",district:"수영구"}],step:9};
    assert.equal((await call("/profile","PUT",profile)).status,200);
    assert.deepEqual((await call("/me")).body.profile,profile);
    await go("/onboarding");
    await page.getByTestId("add-business").waitFor({timeout:25000});
    assert((await page.locator("body").innerText()).includes("김해시"));
  });
  await check("실제 세션 관심·서류 체크 저장과 복원",async()=>{
    const list=await call("/benefits"),benefit=list.body[0];
    const input={saved:true,stage:"신청 준비",checkedDocuments:benefit.documents.slice(0,1),deadlineReminder:true};
    assert.equal((await call(`/tracking/${benefit.id}`,"PUT",input)).status,200);
    const stored=await call("/tracking");assert.equal(stored.body[0].saved,true);
    assert.deepEqual(stored.body[0].checkedDocuments,input.checkedDocuments);
    await go("/progress");
    await page.getByText("소담스퀘어",{exact:false}).first().waitFor({timeout:15000});
  });
  await check("실제 인증 관리자 화면·무상권 부여·회수",async()=>{
    await pool.query("UPDATE iroun_accounts SET role='admin' WHERE id=$1",[id]);
    await go("/admin");
    await page.getByTestId("adm-new").waitFor({timeout:20000});
    assert.equal((await call("/admin/dashboard")).status,200);
    const grant={reason:"자동 검증용 무상권",expiresAt:new Date(Date.now()+3600000).toISOString(),revoke:false};
    assert.equal((await call(`/admin/grants/${id}`,"PUT",grant)).status,200);
    assert.equal((await call("/recommendations")).status,200);
    assert.equal((await call(`/admin/grants/${id}`,"PUT",{...grant,revoke:true})).status,200);
    assert.equal((await call("/recommendations")).status,403);
    await pool.query("UPDATE iroun_accounts SET role='customer' WHERE id=$1",[id]);
  });
  if(deletePath==="/delete-account"&&!process.argv.includes("--delete-only")&&!process.argv.some(s=>s.startsWith("--services-"))){
   if(!process.argv.includes("--resilience")){
    await check("관리자 전체 공고 폼·규칙·시험표시·수정·마감·공개거절",async()=>{
      await pool.query("UPDATE iroun_accounts SET role='admin' WHERE id=$1",[id]);
      await go("/admin");await page.getByTestId("adm-new").click();
      const title=`시험 자료 ${randomUUID().slice(0,8)}`;
      for(const [label,value] of [
        ["제목",title],["제공 기관","시험 기관"],["공식 출처 주소","https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi"],
        ["출처 식별 번호",`QA_${randomUUID()}`],["분류","장비 지원"],["지역","경상남도"],["요약","시험 자료, 운영자료 아님"],
        ["지원 내용","장비·교육 지원"],["산정 방식","현물 지원, 개인 금액 산정 없음"],["확인할 사항 (한 줄에 하나)","업종 확인\n중복수혜 확인"],
        ["필요 서류 (한 줄에 하나)","사업자등록증\n신청서"],["시작일 (YYYY-MM-DD)","2026-01-01"],["마감일 (YYYY-MM-DD)","2030-12-31"],
      ])await page.getByLabel(label,{exact:true}).fill(value);
      await page.getByRole("switch",{name:/시험용 항목/}).click();
      await page.getByRole("button",{name:"규칙 추가",exact:true}).click();
      await page.getByRole("button",{name:"시·도",exact:true}).click();
      await page.getByLabel("비교할 값 (목록은 쉼표로 구분)",{exact:true}).fill("경남");
      await page.getByLabel("사용자에게 보일 설명",{exact:true}).fill("사업장 소재지 경남");
      const response=page.waitForResponse(r=>r.url().endsWith("/api/admin/benefits")&&r.request().method()==="POST");
      await page.getByTestId("adm-save").click();const result=await response;assert.equal(result.status(),200);
      const posted=result.request().postDataJSON();notices.push(posted.id);
      assert.equal(posted.isTest,true);assert.equal(posted.rules[0].value,"경남");
      await page.getByTestId(`adm-edit-${posted.id}`).click();
      await page.getByRole("button",{name:"공개",exact:true}).click();
      const denied=page.waitForResponse(r=>r.url().endsWith(`/api/admin/benefits/${posted.id}`)&&r.request().method()==="PUT");
      await page.getByTestId("adm-save").click();assert.equal((await denied).status(),400);
      await page.getByRole("button",{name:"비공개",exact:true}).click();
      await page.getByRole("button",{name:"마감",exact:true}).click();
      const changed=page.waitForResponse(r=>r.url().endsWith(`/api/admin/benefits/${posted.id}`)&&r.request().method()==="PUT");
      await page.getByTestId("adm-save").click();assert.equal((await changed).status(),200);
      const entry=(await call("/admin/dashboard")).body.benefits.find((x:any)=>x.id===posted.id);
      assert.equal(entry.status,"마감");assert.equal(entry.reviewStatus,"비공개");
      assert.equal(entry.documents.length,2);assert.equal(entry.checks.length,2);
      assert(!(await call("/benefits")).body.some((x:any)=>x.id===posted.id));
    });
    await check("내 알림 전송 실패 안내·새로고침·권한회수 후 숨김",async()=>{
      const oldPrefs=(await pool.query("SELECT preferences FROM iroun_accounts WHERE id=$1",[id])).rows[0].preferences;
      const grant={reason:"알림 상태 화면 시험",expiresAt:new Date(Date.now()+3600000).toISOString(),revoke:false};
      const jobId=randomUUID();
      try{
        assert.equal((await call(`/admin/grants/${id}`,"PUT",grant)).status,200);
        await pool.query("UPDATE iroun_accounts SET preferences=preferences||'{\"notifications\":true,\"personalizedAlerts\":true}' WHERE id=$1",[id]);
        await pool.query("INSERT INTO iroun_push_jobs(id,user_id,benefit_id,deadline,status) VALUES($1,$2,$3,$4,'provider_error')",[jobId,id,notices[0],"qa-status"]);
        await go("/inbox");
        await page.getByText("휴대전화 알림 전송에 실패한 기록이 있습니다.",{exact:false}).waitFor();
        await page.getByTestId("svc-push-status-refresh").click();
        const response=await call("/service/state");
        assert.equal(response.body.pushDelivery.state,"failed");
        assert.deepEqual(Object.keys(response.body.pushDelivery).sort(),["enabled","message","state"]);
        assert.equal((await call(`/admin/grants/${id}`,"PUT",{...grant,revoke:true})).status,200);
        await page.getByText("알림 동의와 유효 이용권이 있을 때 전송 상태를 확인할 수 있습니다.",{exact:false}).waitFor();
      }finally{
        await pool.query("DELETE FROM iroun_push_jobs WHERE id=$1",[jobId]);
        await pool.query("UPDATE iroun_accounts SET preferences=$2 WHERE id=$1",[id,JSON.stringify(oldPrefs)]);
        await call(`/admin/grants/${id}`,"PUT",{...grant,revoke:true});
      }
    });
    await check("관리자 고객검색·무상권 폼 부여·기간변경·회수·감사·연동차단",async()=>{
      await go("/admin");
      await page.getByRole("button",{name:"고객·이용권",exact:true}).click();
      await page.getByTestId("adm-user-search").fill(email);
      await page.getByTestId(`grant-open-${id}`).click();
      await page.getByLabel("사유 (감사 기록에 남습니다)",{exact:true}).fill("시험 계정 무상권");
      await page.getByLabel("만료일 (YYYY-MM-DD)",{exact:true}).fill("2030-01-01");
      let response=page.waitForResponse(r=>r.url().endsWith(`/api/admin/grants/${id}`)&&r.request().method()==="PUT");
      await page.getByRole("button",{name:"부여",exact:true}).click();assert.equal((await response).status(),200);
      await page.getByText("무상 이용권을 부여했습니다.",{exact:true}).waitFor();
      assert.equal((await call("/me")).body.entitlement.grantActive,true);
      await page.getByLabel("사유 (감사 기록에 남습니다)",{exact:true}).fill("시험 기간 변경");
      await page.getByLabel("만료일 (YYYY-MM-DD)",{exact:true}).fill("2030-02-01");
      response=page.waitForResponse(r=>r.url().endsWith(`/api/admin/grants/${id}`)&&r.request().method()==="PUT");
      await page.getByRole("button",{name:"부여",exact:true}).click();assert.equal((await response).status(),200);
      await page.getByText("무상 이용권을 부여했습니다.",{exact:true}).waitFor();
      assert.equal((await call("/me")).body.entitlement.grantUntil,"2030-02-01T14:59:59.999Z");
      await page.getByLabel("사유 (감사 기록에 남습니다)",{exact:true}).fill("시험 권한 회수");
      page.once("dialog",d=>d.accept());
      response=page.waitForResponse(r=>r.url().endsWith(`/api/admin/grants/${id}`)&&r.request().method()==="PUT");
      await page.getByRole("button",{name:"회수",exact:true}).click();assert.equal((await response).status(),200);
      assert.equal((await call("/me")).body.entitlement.grantActive,false);
      assert((await call("/admin/dashboard")).body.audit.some((x:any)=>x.subject===id&&x.data.freeOfCharge===true));
      await page.getByRole("button",{name:"연결 상태",exact:true}).click();
      const collected=page.waitForResponse(r=>r.url().endsWith("/api/admin/feeds/bizinfo/run")&&r.request().method()==="POST");
      await page.getByTestId("adm-feed-run").click();const result=await collected;
      if(process.argv.includes("--api-connections"))for(const [source,label] of [
        ["gov24","정부24 공식 수집 확인"],["welfareCentral","복지로 중앙부처 수집 확인"],["welfareLocal","복지로 지자체 수집 확인"]]){
        await check(`이번 신규 실제 인증: ${source} 관리자 버튼·키없음 차단`,async()=>{
          const ready=page.waitForResponse(r=>r.url().endsWith("/api/admin/feeds/public/run")&&r.request().method()==="POST");
          await page.getByRole("button",{name:label,exact:true}).click();
          const r=await ready;assert.equal(r.status(),200);assert.equal((await r.json()).blocked,true);
          assert.equal((await call("/admin/dashboard")).status,200);
        });
      }
      assert.equal(result.status(),200);assert.equal((await result.json()).blocked,true);
      await pool.query("UPDATE iroun_accounts SET role='customer' WHERE id=$1",[id]);
      assert.equal((await call("/admin/feeds/bizinfo/run","POST")).status,403);
    });
    await check("관리자 삭제 요청 폼: 시험 고객 실제 인증 계정·DB 삭제",async()=>{
      const created=await clerkClient.users.createUser({emailAddress:[`iroun-admin-delete-${Date.now()}+fixture@example.invalid`],password:`Ir0un!${crypto.randomUUID()}`});
      secondary=created.id;
      await pool.query("INSERT INTO iroun_accounts(id) VALUES($1)",[secondary]);
      const requestId=`qa_admin_delete_${Date.now()}`;
      await pool.query("INSERT INTO iroun_deletions(id,user_id,status) VALUES($1,$2,'요청됨')",[requestId,secondary]);
      await pool.query("UPDATE iroun_accounts SET role='admin' WHERE id=$1",[id]);
      await go("/admin");
      await page.getByRole("button",{name:"삭제 요청",exact:true}).click();
      const response=page.waitForResponse(r=>r.url().includes(requestId)&&r.request().method()==="POST");
      page.once("dialog",dialog=>dialog.accept());
      await page.getByRole("button",{name:"삭제 요청 처리",exact:true}).click();
      assert.equal((await response).status(),200);
      assert((await pool.query("SELECT deleted_at FROM iroun_accounts WHERE id=$1",[secondary])).rows[0].deleted_at);
      try{await clerkClient.users.getUser(secondary);assert.fail("삭제된 시험 계정이 남았습니다.");}
      catch(e){assert.equal((e as {status?:number}).status,404);}
      await pool.query("UPDATE iroun_accounts SET role='customer' WHERE id=$1",[id]);
    });
   }
   if(!process.argv.includes("--admin-forms")){
    await check("열린 맞춤 화면: 무상권 회수·독립 구독·로컬 만료 후 개인 결과 제거",async()=>{
      const b=(await call("/benefits")).body.find((x:any)=>x.audience==="사업");
      const grant=async(end:string,revoked=false)=>pool.query("UPDATE iroun_grants SET expires_at=$2,revoked_at=$3 WHERE user_id=$1",[id,end,revoked?new Date():null]);
      await grant(new Date(Date.now()+60000).toISOString());
      await go(`/benefit/${b.id}`);
      await page.getByText("추가 확인 필요",{exact:true}).first().waitFor({timeout:15000});
      await grant(new Date(Date.now()+60000).toISOString(),true);
      assert.equal((await call("/recommendations")).status,403);
      await page.waitForFunction(()=>![...(globalThis as any).document.querySelectorAll("div")].some((e:any)=>e.children.length===0&&e.textContent==="추가 확인 필요"),{},{timeout:10000});
      assert.equal(await page.getByText("추가 확인 필요",{exact:true}).count(),0);
      // Test-only subscription on this QA identity, not a real store purchase.
      await pool.query("INSERT INTO iroun_subscriptions(user_id,expires_at,state,provider,provider_id) VALUES($1,$2,'active','test',$3)",[id,new Date(Date.now()+60000).toISOString(),`qa-${id}`]);
      assert.equal((await call("/recommendations")).status,200);
      await page.getByText("추가 확인 필요",{exact:true}).first().waitFor({timeout:15000});
      await pool.query("DELETE FROM iroun_subscriptions WHERE user_id=$1",[id]);
      await grant(new Date(Date.now()+12000).toISOString());
      await page.waitForTimeout(16000);
      assert.equal((await call("/recommendations")).status,403);
      assert.equal(await page.getByText("추가 확인 필요",{exact:true}).count(),0);
      const persisted=await page.evaluate(()=>Object.keys(localStorage).filter(k=>/recommendation/i.test(k)));assert.deepEqual(persisted,[]);
    });
    await check("권한확인 요청 멈춤: 회수된 열린 화면은 15초 이내 만료",async()=>{
      await pool.query("UPDATE iroun_grants SET expires_at=$2,revoked_at=NULL WHERE user_id=$1",[id,new Date(Date.now()+60000).toISOString()]);
      const benefit=(await call("/benefits")).body.find((x:any)=>x.audience==="사업");
      await go(`/benefit/${benefit.id}`);
      await page.getByText("추가 확인 필요",{exact:true}).first().waitFor();
      const held:import("playwright").Route[]=[];
      await page.route("**/api/me",route=>{held.push(route);});
      await pool.query("UPDATE iroun_grants SET revoked_at=now() WHERE user_id=$1",[id]);
      assert.equal((await call("/recommendations")).status,403);
      await page.waitForTimeout(16500);
      assert.equal(await page.getByText("추가 확인 필요",{exact:true}).count(),0);
      await page.unroute("**/api/me");
      for(const route of held)await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"시험 응답 지연"})}).catch(()=>{});
    });
    await check("로그인 큰글씨: 320·375 화면과 큰 버튼",async()=>{
      for(const width of [320,375]){
        await page.setViewportSize({width,height:812});
        for(const path of ["/","/benefits","/progress","/account","/onboarding"]){
          const meReady=page.waitForResponse(r=>r.url().endsWith("/api/me")&&r.status()===200,{timeout:45000});
          await go(path);await meReady;await page.waitForTimeout(700);
          const overflow=await page.evaluate(()=>(globalThis as any).document.documentElement.scrollWidth>(globalThis as any).innerWidth+2);
          assert.equal(overflow,false,`큰글씨 가로 잘림 ${width} ${path}`);
        }
      }
      await go("/account");
      const toggle=page.getByTestId("large-text-toggle");await toggle.waitFor();
      assert.equal(await toggle.getAttribute("aria-checked"),"true");
      const box=await toggle.boundingBox();assert(box&&box.height>=60);
      await page.screenshot({path:"../../generated-artifacts/iroun-signed-large.jpg",fullPage:false});
    });
    await check("저장 실패·재시도·서버저장·사업장 질문 이어하기",async()=>{
      await go("/onboarding");await page.getByTestId("add-business").click();
      await page.getByTestId("wizard-input").waitFor();
      await page.evaluate(()=>{
        (globalThis as any).__qaSetItem=Storage.prototype.setItem;
        Storage.prototype.setItem=function(k,v){if(k.startsWith("iroun.draft"))throw new DOMException("test quota","QuotaExceededError");return(globalThis as any).__qaSetItem.call(this,k,v);};
      });
      const matcher="**/api/profile";
      await page.route(matcher,async route=>{if(route.request().method()==="PUT")await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"시험 저장 장애"})});else await route.continue();});
      await page.getByTestId("wizard-input").fill("검증 사업장");
      await page.getByTestId("wizard-next").click();
      await page.getByText(/저장 공간 오류/).waitFor();
      assert.equal(await page.getByTestId("wizard-input").inputValue(),"검증 사업장");
      assert.equal(await page.getByText(/이 기기에 저장하지 못했습니다/).count()>0,true);
      await page.unroute(matcher);
      await page.evaluate(()=>{Storage.prototype.setItem=(globalThis as any).__qaSetItem;delete(globalThis as any).__qaSetItem;});
      await page.getByTestId("wizard-next").click();
      await page.getByText("사업장은 어느 시·도에 있나요?",{exact:true}).waitFor();
      await page.reload({waitUntil:"domcontentloaded"});await page.getByText("사업장은 어느 시·도에 있나요?",{exact:true}).waitFor({timeout:45000});
      assert((await call("/me")).body.profile.businesses.some((x:any)=>x.name==="검증 사업장"));
    });
   }
  }
}
  if(!recommendationOnly&&!focusedWebDelete&&!focusedCompanyQuality)await check("실제 복원 요청은 미설정 503, 성공 가장 없음",async()=>assert.equal((await call("/membership/restore","POST")).status,503));
  if(process.argv.some(s=>s.startsWith("--services-")))await verifyCompanyBrowser({page,id:id!,go,call,check,office:process.argv.includes("--services-office"),registerEmployee:async()=>{
   const staffEmail=`qa-staff-${randomUUID()}+fixture@example.invalid`;
   const u=await clerkClient.users.createUser({emailAddress:[staffEmail],password});secondary=u.id;
   await pool.query("INSERT INTO iroun_accounts(id) VALUES($1)",[secondary]);
   return{id:secondary,email:staffEmail,password};
   },focusedQuality:focusedCompanyQuality,credentials:{email,password}});
  if(!recommendationOnly&&!focusedCompanyQuality)await check(`실제 로그아웃·비밀번호 재로그인·${deletePath==="/delete-request"?"웹":"앱"} 탈퇴·기관 계정 삭제`,async()=>{
    await page.evaluate(()=>localStorage.setItem("iroun.lastSignIn.v1",String(Date.now()-86400000)));
    await go(deletePath);
    await page.getByTestId("delete-reauth").waitFor({timeout:15000});
     if(focusedWebDelete)await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/delete-request-reauth.jpg"});
    await page.getByTestId("delete-reauth").click();
    try{await page.getByTestId("email-input").waitFor({timeout:15000});}
    catch{throw new Error("재인증 로그아웃 뒤 화면: "+new URL(page.url()).pathname+" "+(await page.locator("body").innerText()).replaceAll(email,"[시험계정]").slice(-1600));}
    await page.getByTestId("email-input").fill(email);
    await page.getByTestId("password-input").fill(password);
    await page.getByTestId("auth-submit").click();
    await Promise.race([
      page.waitForURL(u=>u.pathname===deletePath,{timeout:20000,waitUntil:"domcontentloaded"}),
      page.getByTestId("code-input").waitFor({timeout:20000}),
    ]);
    if(await page.getByTestId("code-input").isVisible()){
      await page.getByTestId("code-input").fill("424242");
      await page.getByTestId("verify-submit").click();
    }
    await page.getByTestId("delete-confirm-input").waitFor({timeout:20000});
    await page.getByTestId("delete-confirm-input").fill("회원 탈퇴");
     let oldToken:string|undefined;
     if(focusedWebDelete){
       oldToken=await page.evaluate(async()=>await (globalThis as any).Clerk.session.getToken());
       assert(oldToken);
       assert.equal((await fetch(api+"/me",{headers:{Authorization:`Bearer ${oldToken}`} })).status,200);
     }
    const deletion=page.waitForResponse(r=>r.url().endsWith("/api/account/deletion")&&r.request().method()==="POST");
    await page.getByTestId("delete-submit").click();
    assert.equal((await deletion).status(),200);
    await page.waitForURL(u=>u.pathname==="/",{timeout:20000,waitUntil:"domcontentloaded"});
     if(focusedWebDelete){await page.getByTestId("tab-index").waitFor({timeout:30000});await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/delete-request-success-home.jpg"});}
    try{await clerkClient.users.getUser(id!);assert.fail("인증 계정이 남아 있습니다.");}
    catch(e){assert.equal((e as {status?:number}).status,404);}
    assert.equal((await pool.query("SELECT * FROM iroun_tracking WHERE user_id=$1",[id])).rowCount,0);
    assert((await pool.query("SELECT deleted_at FROM iroun_accounts WHERE id=$1",[id])).rows[0].deleted_at);
     if(focusedWebDelete){
       const privateStatuses=await Promise.all(["/me","/tracking"].map(async path=>(await fetch(api+path,{headers:{Authorization:`Bearer ${oldToken}`} })).status));
       console.log("deleted token private statuses:",privateStatuses);
       assert(privateStatuses.every(status=>[401,403,410].includes(status)));
       await go("/progress");
       await page.getByText("로그인이 필요합니다",{exact:true}).waitFor({timeout:20000});
       await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/delete-request-private-link-blocked.jpg"});
       const publicResponse=await fetch(api+"/benefits");
       assert.equal(publicResponse.status,200);
       const publicItems=await publicResponse.json() as any[];
       assert(publicItems.length>0&&publicItems.every(item=>item.reviewStatus==="공개"&&!item.isTest));
       await go("/benefits");
       await page.getByTestId("result-count").waitFor({timeout:30000});
       assert.equal(await page.getByTestId("sort-recommended").count(),0);
       await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/delete-request-public-list-maintained.jpg"});
     }
  });
  }
  console.log(JSON.stringify({passed:passed.length,tests:passed,storePurchaseChecked:false,nativeDeviceChecked:false},null,2));
}finally{
  if(secondary){
    await pool.query("UPDATE iroun_service_requests SET assigned_to=NULL WHERE assigned_to=$1",[secondary]);
    await clerkClient.users.deleteUser(secondary).catch(()=>{});
    await pool.query("DELETE FROM iroun_deletions WHERE user_id=$1",[secondary]);
    await pool.query("DELETE FROM iroun_audit WHERE subject=$1",[secondary]);
    await pool.query("DELETE FROM iroun_accounts WHERE id=$1",[secondary]);
  }
  // Clean only this test identity and test-owned records.
  const identities=await clerkClient.users.getUserList({emailAddress:[email]});
  for(const user of identities.data){id??=user.id;await clerkClient.users.deleteUser(user.id);}
  if(id){
    await pool.query("UPDATE iroun_service_requests SET assigned_to=NULL WHERE assigned_to=$1",[id]);
    await pool.query("DELETE FROM iroun_deletions WHERE user_id=$1",[id]);
    await pool.query("DELETE FROM iroun_audit WHERE actor=$1 OR subject=$1",[id]);
    await pool.query("DELETE FROM iroun_accounts WHERE id=$1",[id]);
  }
  for(const notice of notices){
    await pool.query("DELETE FROM iroun_audit WHERE subject=$1",[notice]);
    await pool.query("DELETE FROM iroun_benefits WHERE id=$1",[notice]);
  }
  if(process.env.SESSION_SECRET)await pool.query("DELETE FROM iroun_trial_ledger WHERE identity_hash=$1",[createHmac("sha256",process.env.SESSION_SECRET).update("trial-email:"+email.toLowerCase()).digest("hex")]);
  await browser.close();await pool.end();
}
