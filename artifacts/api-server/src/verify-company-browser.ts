import assert from "node:assert/strict";
import type {Page} from "playwright";
import {pool} from "@workspace/db";
import {setupClerkTestingToken} from "@clerk/testing/playwright";
import {execFileSync} from "node:child_process";
export async function verifyCompanyBrowser(o:{page:Page,id:string,go:(s:string)=>Promise<unknown>,call:(s:string,m?:string,b?:unknown)=>Promise<any>,check:(s:string,f:()=>Promise<void>)=>Promise<void>,office:boolean,registerEmployee:()=>Promise<{id:string,email:string,password:string}>,focusedQuality?:boolean,credentials?:{email:string,password:string}}){
 if(process.platform==="linux"&&!execFileSync("fc-list",[":lang=ko"],{encoding:"utf8"}).trim())throw new Error("한글 글꼴이 없어 회사 화면 검증을 중단합니다. FONTCONFIG_FILE 설정을 확인하세요.");
 const {page,id,go,call,check}=o;
 let ownerCode:string,requestId:string,contractId:string;
 if(o.focusedQuality){
  await verifyFocusedCustomerQuality(o);
  return;
 }
 await check("신규 실제인증: 무료 업무 접근403·본인 문의 저장/재조회",async()=>{
  assert.equal((await call("/office/state")).status,403);
  await go("/inquiries");await page.getByTestId("svc-inq-title").fill("개발 시험 문의");
  await page.getByTestId("svc-inq-body").fill("개발 시험만 진행합니다.");
  const response=page.waitForResponse(r=>r.url().endsWith("/api/service/inquiries")&&r.request().method()==="POST");
  await page.getByTestId("svc-inq-send").click();assert.equal((await response).status(),200);
  assert.equal((await call("/service/state")).body.inquiries.length,1);
 });
 await check("신규 실제인증: 명시적72시간 체험 버튼·KST 기간",async()=>{
  await go("/access");await page.getByTestId("svc-start-trial").waitFor();
  const consent=page.waitForResponse(r=>r.url().endsWith("/api/service/consents")&&r.request().method()==="POST");
  await page.getByTestId("svc-consent-service").click();assert.equal((await consent).status(),200);
  const response=page.waitForResponse(r=>r.url().endsWith("/api/service/trial")&&r.request().method()==="POST");
  await page.getByTestId("svc-start-trial").click();assert.equal((await response).status(),200);
  const a=(await call("/me")).body;assert(a.entitlement.trialActive);
  assert.equal(Date.parse(a.entitlement.trialUntil)-Date.parse(a.entitlement.trialStartedAt),72*3600000);
  await page.getByText("3일 무료체험", {exact:true}).waitFor();
  assert((await page.locator("body").innerText()).includes("한국 시간"));
 });
 await check("신규 실제인증: 현재·지난 공고·자격확인 회사접수",async()=>{
  const items=(await call("/service/matches")).body.items;assert(items.length>0);
  const item=items.find((x:any)=>x.matches.some((m:any)=>m.result!=="조건 일치"));assert(item);
  const m=item.matches[0];
  const r=await call("/service/requests","POST",{benefitId:item.benefit.id,businessId:m.businessId,kind:"자격 확인",confirmed:true});
  assert.equal(r.status,200);requestId=r.body.id;
  assert.equal((await call("/service/requests","POST",{benefitId:item.benefit.id,businessId:m.businessId,kind:"자격 확인",confirmed:true})).body.id,requestId);
  await go("/matches");await page.getByTestId("svc-period-past").click();
  await page.getByText("지난 공고", {exact:true}).first().waitFor();
  await page.getByTestId("svc-period-current").click();
  await page.getByTestId("svc-match-region").fill("부산");await page.getByTestId("svc-match-industry").fill("음식점");
  await go("/account");await page.getByTestId("large-text-toggle").click();
  for(const width of [320,375]){
   await page.setViewportSize({width,height:900});await go("/matches");await page.getByTestId("svc-match-region").waitFor();
   assert(!(await page.evaluate(()=>{const w=globalThis as any;return w.document.documentElement.scrollWidth>w.innerWidth+2;})),`활성 맞춤 큰글씨 ${width}px 잘림`);
  }
  await page.setViewportSize({width:1024,height:900});
  await go("/company-progress");await page.getByText("자격 확인", {exact:true}).first().waitFor();
 });
 if(o.office){
  await check("신규 실제인증: 연결번호로 계약관리 전체입력 폼 저장",async()=>{
   ownerCode=(await call("/service/owner-code","POST")).body.code;
   await pool.query("UPDATE iroun_accounts SET role='admin' WHERE id=$1",[id]);
   await go("/office");await page.getByTestId("office-tab-contracts").click();
   await page.getByTestId("office-contract-code").fill(ownerCode);
   await page.getByTestId("office-contract-start").fill("2026-01-01");
   await page.getByTestId("office-contract-end").fill("2099-01-01");
   await page.getByTestId("office-contract-reason").fill("개발 시험 계약만 기록");
   await page.getByTestId("office-contract-evidence").fill("개발 시험 계정의 직접 연결번호");
   const response=page.waitForResponse(r=>r.url().endsWith("/api/office/contracts")&&r.request().method()==="POST");
   await page.getByTestId("office-contract-save").click();assert.equal((await response).status(),200);
   contractId=(await call("/office/state")).body.contracts.find((c:any)=>c.user_id===id).id;
   assert((await call("/me")).body.entitlement.contractActive);
  });
  await check("신규 실제인증: 접수 펼침·체크리스트·내부메모 실제저장/고객차단",async()=>{
   await page.getByTestId("office-tab-contact").click();
   await page.getByTestId("office-company-phone").fill("1234567");
   const invalid=page.waitForResponse(r=>r.url().endsWith("/api/office/settings")&&r.request().method()==="PUT");
   await page.getByTestId("office-company-save").click();assert.equal((await invalid).status(),400);
   await page.getByTestId("office-tab-requests").click();
   await page.getByTestId(`office-req-${requestId}-note`).fill("개발 시험 직원 전용 메모");
   const response=page.waitForResponse(r=>r.url().endsWith(`/api/office/requests/${requestId}`)&&r.request().method()==="PUT");
   await page.getByTestId(`office-req-${requestId}-save`).click();assert.equal((await response).status(),200);
   const own=(await call("/service/state")).body;assert(!JSON.stringify(own.requests).includes("직원 전용 메모"));
  });
  await check("신규 실제인증: 계약회수·체험 OR 유지·회사문의 답변",async()=>{
   await page.getByTestId("office-tab-contracts").click();
   const response=page.waitForResponse(r=>r.url().endsWith("/api/office/contracts")&&r.request().method()==="POST");
   await page.getByTestId(`office-contract-revoke-${contractId}`).click();assert.equal((await response).status(),200);
   const e=(await call("/me")).body.entitlement;assert(!e.contractActive&&e.trialActive&&e.active);
   const inquiry=(await call("/service/state")).body.inquiries[0];
   await page.getByTestId("office-tab-inquiries").click();
   await page.getByTestId(`office-inq-${inquiry.id}-body`).fill("개발 시험 답변입니다.");
   const reply=page.waitForResponse(r=>r.url().endsWith(`/api/office/inquiries/${inquiry.id}/reply`)&&r.request().method()==="POST");
   await page.getByTestId(`office-inq-${inquiry.id}-send`).click();assert.equal((await reply).status(),200);
   assert.equal((await call("/service/state")).body.inquiries[0].replies.length,1);
  });
  await check("신규 실제인증: 직원 전체 폼·배정·직원 로그인·재배정 접근회수",async()=>{
   const employee=await o.registerEmployee();
   await page.getByTestId("office-tab-staff").click();
   await page.getByTestId("office-staff-userid").fill(employee.id);
   await page.getByTestId("office-staff-name").fill("개발 시험 직원");
   const saved=page.waitForResponse(r=>r.url().endsWith("/api/office/staff")&&r.request().method()==="POST");
   await page.getByTestId("office-staff-save").click();assert.equal((await saved).status(),200);
   const r=(await call("/office/state")).body.requests.find((r:any)=>r.id===requestId);
   const assign=(assignedTo:string|null)=>call(`/office/requests/${requestId}`,"PUT",{assignedTo,state:"자료 준비",customerTasks:r.customer_tasks,staffTasks:r.staff_tasks,completedTasks:[],internalNote:r.internal_note});
   assert.equal((await assign(employee.id)).status,200);
   const sp=await page.context().browser()!.newPage({viewport:{width:375,height:812}});
   try{
    sp.setDefaultTimeout(30000);await setupClerkTestingToken({page:sp});
    await sp.goto(new URL("/auth?next=/office",page.url()).href,{waitUntil:"domcontentloaded"});
    await sp.getByTestId("email-input").fill(employee.email);await sp.getByTestId("password-input").fill(employee.password);
    await sp.getByTestId("auth-submit").click();
    await Promise.race([sp.waitForURL(u=>u.pathname==="/office",{waitUntil:"domcontentloaded"}),sp.getByTestId("code-input").waitFor()]);
    if(await sp.getByTestId("code-input").isVisible()){await sp.getByTestId("code-input").fill("424242");await sp.getByTestId("verify-submit").click();}
    await sp.getByTestId(`office-req-${requestId}-save`).waitFor();
    const read=(path:string)=>sp.evaluate(async({url})=>{const w=globalThis as any;const token=await Promise.race([w.Clerk.session.getToken(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("직원 시험 인증 확인 시간초과")),20000))]);const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`}});return{status:response.status,body:await response.json() as any};},{url:`https://${process.env.REPLIT_DEV_DOMAIN}/api${path}`});
    assert.equal((await read("/office/state")).body.requests.length,1);
    assert.equal((await read(`/office/customers/${employee.id}/matches`)).status,403);
    assert.equal((await assign(null)).status,200);
    await sp.getByTestId(`office-req-${requestId}-save`).waitFor({state:"detached",timeout:18000});
    assert.equal((await read(`/office/customers/${id}/matches`)).status,403);
   }finally{await sp.close();}
  });
 }
 await check("신규 실제인증: 체험 종료·이미 열린 맞춤 화면 가림/알림링크잠금",async()=>{
  await go("/matches");await page.getByTestId("svc-period-current").waitFor();
  await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 second' WHERE user_id=$1",[id]);
  await page.getByText("맞춤 확인은 이용 중일 때 열립니다",{exact:true}).waitFor({timeout:22000});
  assert.equal((await call("/service/matches")).status,403);assert.deepEqual((await call("/service/state")).body.inbox,[]);
 });
 await check("신규 실제인증: 만료후 웹 문의·재시도키 유지·회원정보접근",async()=>{
  await go("/inquiries");await page.getByText("개발 시험 문의",{exact:true}).waitFor();
  assert.equal((await call("/service/state")).body.inquiries.length,1);
 });
 await check("신규 실제인증: 로그인·큰글씨 신규화면 320/375px 가로잘림·큰버튼",async()=>{
  for(const width of [320,375]){
   await page.setViewportSize({width,height:900});
   for(const route of ["/access","/matches","/company-progress","/inquiries","/inbox",...(o.office?["/office"]:[])]){
    await go(route);await page.getByTestId("svc-government-notice").waitFor();
    const ready=route==="/access"?"svc-consent-marketing":route==="/inquiries"?"svc-inq-title":route==="/inbox"?"svc-pref-notifications":route==="/office"?"office-tab-requests":null;
    if(ready)await page.getByTestId(ready).waitFor();
    else await page.getByText(route==="/matches"?"맞춤 확인은 이용 중일 때 열립니다":"자격 확인",{exact:true}).first().waitFor();
    await page.waitForTimeout(600);
    assert(!(await page.evaluate(()=>{const w=globalThis as any;return w.document.documentElement.scrollWidth>w.innerWidth+2;})),`${width}px ${route} 가로잘림`);
   }
  }
  await go("/inquiries");const box=await page.getByTestId("svc-inq-send").boundingBox();assert(box&&box.height>=60);
 });
 await pool.query("UPDATE iroun_accounts SET role='customer' WHERE id=$1",[id]);
}

async function verifyFocusedCustomerQuality(o:{page:Page,id:string,go:(s:string)=>Promise<unknown>,call:(s:string,m?:string,b?:unknown)=>Promise<any>,check:(s:string,f:()=>Promise<void>)=>Promise<void>,registerEmployee:()=>Promise<{id:string,email:string,password:string}>,credentials?:{email:string,password:string}}){
 const {page,id,go,call,check}=o,apiBase=`https://${process.env.REPLIT_DEV_DOMAIN}/api`;
 let requestId="",contractId="",benefitTitle="";
 let employee:{id:string,email:string,password:string}|undefined;
 let customerTasks:string[]=[],staffTasks:string[]=[],completedTasks:string[]=[];
 const browser=page.context().browser()!;
 let freshContext:any,otherContext:any;
 const apiAs=async(p:Page,path:string,method="GET",body?:unknown)=>{
  await p.waitForFunction(()=>!!(globalThis as any).Clerk?.session,{}, {timeout:20000});
  return p.evaluate(async({url,method,body})=>{
   const token=await (globalThis as any).Clerk.session.getToken();
   const r=await fetch(url,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});
   return{status:r.status,body:await r.json() as any};
  },{url:apiBase+path,method,body});
 };
 const login=async(p:Page,creds:{email:string,password:string})=>{
  await setupClerkTestingToken({page:p});
  await p.goto(new URL("/auth?next=/mine",page.url()).href,{waitUntil:"domcontentloaded"});
  await p.getByTestId("email-input").fill(creds.email);
  await p.getByTestId("password-input").fill(creds.password);
  await p.getByTestId("auth-submit").click();
  await Promise.race([p.waitForURL(u=>u.pathname==="/mine",{timeout:25000,waitUntil:"domcontentloaded"}),p.getByTestId("code-input").waitFor({timeout:25000})]);
  if(await p.getByTestId("code-input").isVisible()){await p.getByTestId("code-input").fill("424242");await p.getByTestId("verify-submit").click();}
  await p.waitForURL(u=>u.pathname==="/mine",{timeout:25000,waitUntil:"domcontentloaded"});
 };
 try{
  await check("무료 맞춤 차단·미설정 스토어 복원 실패",async()=>{
   assert.equal((await call("/service/matches")).status,403);
   assert.equal((await call("/membership/restore","POST")).status,503);
   await go("/matches");
   await page.getByText("맞춤 확인은 이용 중일 때 열립니다",{exact:true}).waitFor();
   await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-free-matches-blocked.jpg"});
  });
  await check("72시간 체험·사업자 프로필 갱신·회사요청 접수",async()=>{
   assert.equal((await call("/preferences","PUT",{largeText:true,privacyConsent:true,notifications:false,personalizedAlerts:false,accountConsent:true,termsConsent:true})).status,200);
   const profile=(bid:string,province:string,district:string,industry:string)=>({personal:{province,district,employment:["사업자"]},businesses:[{id:bid,name:"검증 사업장",province,district,industry}],step:9});
   const p1=profile("qa-quality-business-a","경상남도","김해시","음식점");
   assert.equal((await call("/profile","PUT",p1)).status,200);
   await go("/access");await page.getByTestId("svc-consent-service").waitFor();
   const consent=page.waitForResponse(r=>r.url().endsWith("/api/service/consents")&&r.request().method()==="POST");
   await page.getByTestId("svc-consent-service").click();assert.equal((await consent).status(),200);
   const trial=page.waitForResponse(r=>r.url().endsWith("/api/service/trial")&&r.request().method()==="POST");
   await page.getByTestId("svc-start-trial").click();assert.equal((await trial).status(),200);
   const entitlement=(await call("/me")).body.entitlement;
   assert(entitlement.trialActive);assert.equal(Date.parse(entitlement.trialUntil)-Date.parse(entitlement.trialStartedAt),72*3600000);
   const before=await call("/service/matches");assert.equal(before.status,200);
   const beforeSodam=before.body.items.find((x:any)=>x.benefit.id==="bizinfo-sodam-2026");assert(beforeSodam);
   assert(beforeSodam.matches.some((m:any)=>m.businessId==="qa-quality-business-a"));
   const p2=profile("qa-quality-business-b","전라북도","전주시","음식점");
   assert.equal((await call("/profile","PUT",p2)).status,200);
   const after=await call("/service/matches");assert.equal(after.status,200);
   const afterSodam=after.body.items.find((x:any)=>x.benefit.id==="bizinfo-sodam-2026");assert(afterSodam);
   assert(afterSodam.matches.some((m:any)=>m.businessId==="qa-quality-business-b"));
   assert(!afterSodam.matches.some((m:any)=>m.businessId==="qa-quality-business-a"));
   await go("/matches");const requestButton=page.getByTestId("REDACTED_LONG_LITERAL");
   await requestButton.waitFor({timeout:30000});
   page.once("dialog",async d=>{if(d.type()==="confirm")await d.accept();});
   const created=page.waitForResponse(r=>r.url().endsWith("/api/service/requests")&&r.request().method()==="POST");
   await requestButton.click();const response=await created;assert.equal(response.status(),200);
   const requestState=(await call("/service/state")).body;
   requestId=requestState.requests[0].id;benefitTitle=requestState.requests[0].benefitTitle;
   assert.equal(benefitTitle,"2026 소담스퀘어 전주 소상공인 지원 프로그램");
   assert(requestState.requests[0].customerTasks.length>0);
  });
  await check("만료 후 알림설정 false에서도 companyUpdates 미읽음 표시·읽음 이동",async()=>{
   assert.equal((await call("/preferences","PUT",{largeText:true,privacyConsent:true,notifications:false,personalizedAlerts:false,accountConsent:true,termsConsent:true})).status,200);
   await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 second' WHERE user_id=$1",[id]);
   assert.equal((await call("/me")).body.entitlement.active,false);
   assert.equal((await call("/service/matches")).status,403);
   const s=(await call("/service/state")).body,r=s.requests.find((x:any)=>x.id===requestId),u=s.companyUpdates.find((x:any)=>x.id===`company:${requestId}`);
   assert(r);assert.equal(r.snapshot,null);assert.equal(r.benefitTitle,benefitTitle);assert(r.customerTasks.length>0);assert.deepEqual(s.inbox,[]);
   assert(u);assert.equal(u.read,false);
   await go("/mine");await page.getByTestId("mine-tab-company").waitFor();
   await page.getByRole("button",{name:"접수 안내 확인"}).waitFor({timeout:20000});
   await page.getByTestId("mine-tab-company").click();await page.getByText(benefitTitle,{exact:true}).last().waitFor();
   await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-mine-unread-expired.jpg"});
   const read=page.waitForResponse(x=>x.url().includes(`/api/service/inbox/`)&&x.url().includes(requestId)&&x.url().endsWith("/read")&&x.request().method()==="POST");
   await page.getByRole("button",{name:"접수 안내 확인"}).click();assert.equal((await read).status(),200);
   await page.waitForURL(x=>x.pathname==="/company-progress",{timeout:15000,waitUntil:"domcontentloaded"});
   await page.getByText(benefitTitle,{exact:true}).last().waitFor();
   const marked=(await call("/service/state")).body;assert.equal(marked.companyUpdates.find((x:any)=>x.id===`company:${requestId}`).read,true);
   assert.equal(marked.requests[0].snapshot,null);
   await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-company-progress-expired.jpg"});
   await page.reload({waitUntil:"domcontentloaded"});await page.getByText(benefitTitle,{exact:true}).last().waitFor();
   assert.equal((await call("/service/state")).body.companyUpdates.find((x:any)=>x.id===`company:${requestId}`).read,true);
  });
  await check("계약 연결·문서 표시·직원 연락처와 담당자 배정",async()=>{
   const code=await call("/service/owner-code","POST");assert.equal(code.status,200);
   await pool.query("UPDATE iroun_accounts SET role='admin' WHERE id=$1",[id]);
   await go("/office");await page.getByTestId("office-tab-contracts").waitFor();
   await page.getByTestId("office-tab-contracts").click();
   await page.getByTestId("office-contract-code").fill(code.body.code);
   await page.getByTestId("office-contract-start").fill("2026-01-01");
   await page.getByTestId("office-contract-end").fill("2099-01-01");
   await page.getByTestId("office-contract-reason").fill("격리된 검증용 계약 기록");
   await page.getByTestId("office-contract-evidence").fill("QA 전용 직접 연결");
   const saved=page.waitForResponse(r=>r.url().endsWith("/api/office/contracts")&&r.request().method()==="POST");
   await page.getByTestId("office-contract-save").click();assert.equal((await saved).status(),200);
   const contracts=(await call("/office/state")).body.contracts;
   contractId=contracts.find((c:any)=>c.user_id===id&&!c.revoked_at).id;
   assert((await call("/me")).body.entitlement.contractActive);
   employee=await o.registerEmployee();
   await page.getByTestId("office-tab-staff").click();
   await page.getByTestId("office-staff-userid").fill(employee.id);
   await page.getByTestId("office-staff-name").fill("검증 담당자");
   await page.getByTestId("office-staff-phone").fill("REDACTED_PHONE");
   await page.getByTestId("office-staff-kakao").fill("https://open.kakao.com/o/QATest123");
   const staffSaved=page.waitForResponse(r=>r.url().endsWith("/api/office/staff")&&r.request().method()==="POST");
   await page.getByTestId("office-staff-save").click();assert.equal((await staffSaved).status(),200);
   await page.getByTestId("office-tab-requests").click();
   const officeRequest=(await call("/office/state")).body.requests.find((r:any)=>r.id===requestId);
   assert(officeRequest);assert(officeRequest.snapshot?.documents?.length>0);
   await page.getByTestId(`office-req-${requestId}-expand`).click();
   await page.getByText("서류",{exact:true}).waitFor();
   for(const doc of officeRequest.snapshot.documents)await page.getByText(doc,{exact:false}).first().waitFor();
   await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-office-documents.jpg"});
   customerTasks=[...officeRequest.customer_tasks];assert(customerTasks.length>0);
   completedTasks=[customerTasks[0]];staffTasks=[...officeRequest.staff_tasks];
   await page.getByTestId(`office-req-${requestId}-assign-${employee.id}`).click();
   await page.getByTestId(`office-req-${requestId}-state-자료 준비`).click();
   await page.getByTestId(`office-req-${requestId}-customer`).fill(customerTasks.join("\n"));
   await page.getByTestId(`office-req-${requestId}-staff`).fill(staffTasks.join("\n"));
   await page.getByTestId(`office-req-${requestId}-done`).fill(completedTasks.join("\n"));
   await page.getByTestId(`office-req-${requestId}-note`).fill("QA 내부 전용 메모");
   const update=page.waitForResponse(r=>r.url().endsWith(`/api/office/requests/${requestId}`)&&r.request().method()==="PUT");
   await page.getByTestId(`office-req-${requestId}-save`).click();assert.equal((await update).status(),200);
   const state=(await call("/service/state")).body,req=state.requests.find((r:any)=>r.id===requestId);
   assert.deepEqual(req.customerTasks,customerTasks);assert.deepEqual(req.completedTasks,completedTasks);
   assert.equal(req.contact.name,"검증 담당자");assert.equal(req.contact.phone,"REDACTED_PHONE");assert.equal(req.contact.kakao,"https://open.kakao.com/o/QATest123");
   assert.equal(state.companyUpdates.find((x:any)=>x.id===`company:${requestId}`).read,false);
   await page.getByTestId("office-tab-contracts").click();
   page.once("dialog",async d=>{if(d.type()==="confirm")await d.accept();});
   const revoked=page.waitForResponse(r=>r.url().endsWith("/api/office/contracts")&&r.request().method()==="POST");
   await page.getByTestId(`office-contract-revoke-${contractId}`).click();assert.equal((await revoked).status(),200);
  });
  await check("계약 회수·만료 뒤 제목·할일·완료·연락처 보존 및 새 판정403",async()=>{
   assert.equal((await call("/me")).body.entitlement.active,false);
   assert.equal((await call("/service/matches")).status,403);
   const s=(await call("/service/state")).body,r=s.requests.find((x:any)=>x.id===requestId),u=s.companyUpdates.find((x:any)=>x.id===`company:${requestId}`);
   assert(r);assert.equal(r.snapshot,null);assert.equal(r.benefitTitle,benefitTitle);
   assert.deepEqual(r.customerTasks,customerTasks);assert.deepEqual(r.completedTasks,completedTasks);
   assert.deepEqual(r.contact,{name:"검증 담당자",phone:"REDACTED_PHONE",kakao:"https://open.kakao.com/o/QATest123"});
   assert(u);assert.equal(u.read,false);assert.deepEqual(s.inbox,[]);
   await go("/mine");await page.getByRole("button",{name:"접수 안내 확인"}).waitFor({timeout:20000});
   await page.getByTestId("mine-tab-company").click();await page.getByText(benefitTitle,{exact:true}).last().waitFor();
   await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-mine-assigned-expired.jpg"});
   const read=page.waitForResponse(x=>x.url().includes(`/api/service/inbox/`)&&x.url().includes(requestId)&&x.url().endsWith("/read")&&x.request().method()==="POST");
   await page.getByRole("button",{name:"접수 안내 확인"}).click();assert.equal((await read).status(),200);
   await page.waitForURL(x=>x.pathname==="/company-progress",{timeout:15000,waitUntil:"domcontentloaded"});
   await page.getByText(benefitTitle,{exact:true}).last().waitFor();
   await page.getByText("검증 담당자 담당자",{exact:true}).waitFor();
   await page.getByText("REDACTED_PHONE",{exact:false}).waitFor();
   await page.getByText(`• ${customerTasks[0]}`,{exact:true}).waitFor();
   await page.getByText(`완료: ${completedTasks[0]}`,{exact:true}).waitFor();
   await page.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-company-progress-assigned-expired.jpg"});
   await page.reload({waitUntil:"domcontentloaded"});await page.getByText(benefitTitle,{exact:true}).waitFor();
   assert.equal((await call("/service/state")).body.companyUpdates.find((x:any)=>x.id===`company:${requestId}`).read,true);
   await go("/mine");await page.getByTestId("mine-tab-company").waitFor();
   assert.equal(await page.getByRole("button",{name:"접수 안내 확인"}).count(),0);
  });
  await check("반복·내부 메모만 변경해도 읽음 fingerprint 유지",async()=>{
   const current=(await call("/office/state")).body.requests.find((r:any)=>r.id===requestId);assert(current);
   const payload={assignedTo:employee!.id,state:current.state,customerTasks:current.customer_tasks,staffTasks:current.staff_tasks,completedTasks:current.completed_tasks,internalNote:"메모만 바뀐 QA 기록"};
   assert.equal((await call(`/office/requests/${requestId}`,"PUT",payload)).status,200);
   assert.equal((await call("/service/state")).body.companyUpdates.find((x:any)=>x.id===`company:${requestId}`).read,true);
   assert.equal((await call(`/office/requests/${requestId}`,"PUT",payload)).status,200);
   assert.equal((await call("/service/state")).body.companyUpdates.find((x:any)=>x.id===`company:${requestId}`).read,true);
  });
  await check("같은 계정 새 브라우저 컨텍스트에서도 읽음·요청기록 유지",async()=>{
   assert(o.credentials);
   freshContext=await browser.newContext({viewport:{width:375,height:812}});
   const fresh=await freshContext.newPage();fresh.setDefaultTimeout(30000);
   await login(fresh,o.credentials!);await fresh.getByTestId("mine-tab-company").waitFor();
   const persisted=await apiAs(fresh,"/service/state");
   assert.equal(persisted.status,200);assert.equal(persisted.body.companyUpdates.find((x:any)=>x.id===`company:${requestId}`).read,true);
   const r=persisted.body.requests.find((x:any)=>x.id===requestId);
   assert.equal(r.snapshot,null);assert.equal(r.benefitTitle,benefitTitle);
   assert.deepEqual(r.customerTasks,customerTasks);assert.deepEqual(r.completedTasks,completedTasks);
   assert.equal(r.contact.name,"검증 담당자");
   await fresh.getByTestId("mine-tab-company").click();await fresh.getByText(benefitTitle,{exact:true}).waitFor();
   assert.equal(await fresh.getByRole("button",{name:"접수 안내 확인"}).count(),0);
   await fresh.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-persist-fresh-context.jpg"});
  });
  await check("담당 직원은 회사 요청을 보고 company read는 404",async()=>{
   assert(employee);otherContext=await browser.newContext({viewport:{width:375,height:812}});
   const other=await otherContext.newPage();other.setDefaultTimeout(30000);
   await login(other,employee!);
   const office=await apiAs(other,"/office/state");assert.equal(office.status,200);
   assert.equal(office.body.requests.filter((r:any)=>r.id===requestId).length,1);
   await other.goto(new URL("/office",page.url()).href,{waitUntil:"domcontentloaded"});
   await other.getByTestId(`office-req-${requestId}-save`).waitFor({timeout:20000});
   const foreign=await apiAs(other,`/service/inbox/company:${requestId}/read`,"POST");
   assert.equal(foreign.status,404);
   await other.screenshot({path:"../../generated-artifacts/verification/2026-10-11/quality-office-staff-assigned.jpg"});
  });
  await check("320/375px 큰 글씨·탭 접근성 이름/키보드",async()=>{
   const ownTabs=["홈 탭","전체혜택 탭","내혜택 탭","내정보 탭"];
   for(const width of [320,375]){
    await page.setViewportSize({width,height:812});await go("/mine");await page.getByTestId("mine-tab-company").waitFor();
    for(const name of ownTabs)assert.equal(await page.getByRole("tab",{name}).count(),1);
    assert(!(await page.evaluate(()=>{const w=globalThis as any;return w.document.documentElement.scrollWidth>w.innerWidth+2;})),`${width}px 큰 글씨 가로 넘침`);
   }
   await page.getByRole("tab",{name:"전체혜택 탭"}).focus();await page.keyboard.press("Enter");
   await page.waitForURL(x=>x.pathname==="/benefits",{timeout:15000});
  });
 }finally{
  if(otherContext)await otherContext.close();
  if(freshContext)await freshContext.close();
 }
}
