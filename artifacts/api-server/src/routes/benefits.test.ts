import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { benefitsRouter } from "./benefits";
import { registerDevice } from "../lib/push-delivery";

// Test-only identity transport. Never imported into the application or workflow.
// Clerk token verification and real mobile sign-in are not certified by these tests.
const provider = vi.hoisted(()=>({deleteUser:vi.fn(), createdAt:Date.now()}));
vi.mock("@clerk/express",()=>({
  getAuth:(req:express.Request)=>({userId:req.headers["x-test-identity"]??null,sessionId:req.headers["x-test-identity"]?"test-session":null}),
  clerkClient:{sessions:{getSession:async()=>({createdAt:provider.createdAt})},users:{deleteUser:provider.deleteUser}},
}));
const app=express();
app.use(express.json());
app.use((req,_res,next)=>{req.log={error:()=>undefined} as unknown as typeof req.log; next();});
app.use("/api",benefitsRouter);
const suffix=randomUUID(), a=`qa-a-${suffix}`,b=`qa-b-${suffix}`,admin=`qa-admin-${suffix}`;
const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
const pref={largeText:true,notifications:true,privacyConsent:true,personalizedAlerts:false};
const headers=(id:string)=>({"x-test-identity":id});
const data={saved:true,stage:"신청 준비",checkedDocuments:[],deadlineReminder:true};
const draftId=`qa-notice-${suffix}`,closingId=`qa-closing-${suffix}`;
beforeAll(async()=>{
  for(const id of [a,b,admin]) await pool.query("INSERT INTO iroun_accounts(id,role) VALUES($1,$2)",[id,id===admin?"admin":"customer"]);
});
afterAll(async()=>{
  await pool.query("DELETE FROM iroun_audit WHERE subject=$1",[closingId]);
  await pool.query("DELETE FROM iroun_audit WHERE actor=ANY($1::text[]) OR subject=ANY($1::text[])",[[a,b,admin]]);
  await pool.query("DELETE FROM iroun_deletions WHERE user_id=ANY($1::text[])",[[a,b,admin]]);
  await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1::text[])",[[a,b,admin]]);
  await pool.query("DELETE FROM iroun_benefits WHERE id=ANY($1::text[])",[[draftId,closingId]]);
  await pool.end();
});
describe("실제 PostgreSQL 기반 API (인증 제공자만 테스트 대체)",()=>{
  it("비회원 일반목록 200, 실제자료만",async()=>{
    const r=await request(app).get("/api/benefits");
    expect(r.status).toBe(200);expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((x:{isTest:boolean;sourceUrl:string;checkedAt:string})=>!x.isTest&&x.checkedAt&&x.sourceUrl.startsWith("https://"))).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain("personalAmount");
  });
  it("비회원 맞춤 401",async()=>expect((await request(app).get("/api/recommendations")).status).toBe(401));
  it("무료 고객 맞춤 403 + no-store",async()=>{
    const r=await request(app).get("/api/recommendations").set(headers(a));
    expect(r.status).toBe(403);expect(r.headers["cache-control"]).toBe("no-store");expect(r.body.benefitId).toBeUndefined();
  });
  it("일반 고객 관리자 접근 403",async()=>expect((await request(app).get("/api/admin/dashboard").set(headers(a))).status).toBe(403));
  it("비회원 관리자 접근 401",async()=>expect((await request(app).get("/api/admin/dashboard")).status).toBe(401));
  it("프로필로 권한 상승 400",async()=>{
    await request(app).put("/api/preferences").set(headers(a)).send(pref);
    expect((await request(app).put("/api/profile").set(headers(a)).send({personal:{},businesses:[],step:0,role:"admin",entitlement:{active:true}})).status).toBe(400);
  });
  it("본인정보 저장, 다른 고객 정보 분리",async()=>{
    const p={personal:{province:"부산광역시",district:"해운대구",employment:["근로자","사업자"],children:0},unknownAnswers:["personal.income"],businesses:[{id:"one",province:"경상남도",district:"김해시"}],step:3};
    expect((await request(app).put("/api/profile").set(headers(a)).send(p)).status).toBe(200);
    expect((await request(app).get("/api/me").set(headers(a))).body.profile).toEqual(p);
    expect((await request(app).get("/api/me").set(headers(b)).query({userId:a})).body.profile.personal.province).toBeUndefined();
    expect((await request(app).get(`/api/users/${a}/profile`).set(headers(b))).status).toBe(404);
  });
  it("관심·체크리스트·알림 설정 재조회 유지, 타인 내역 없음",async()=>{
    const benefit=(await request(app).get("/api/benefits")).body[0];
    const input={...data,checkedDocuments:benefit.documents.slice(0,1)};
    const r=await request(app).put(`/api/tracking/${benefit.id}`).set(headers(a)).send(input);
    expect(r.status).toBe(200);
    const own=(await request(app).get("/api/tracking").set(headers(a))).body;
    expect(own[0].checkedDocuments).toEqual(input.checkedDocuments);expect(own[0].saved).toBe(true);
    expect(own[0].verification).toContain("고객이 직접 기록");
    expect((await request(app).get("/api/tracking").set(headers(b)).query({userId:a})).body).toEqual([]);
  });
  it("타인 식별자를 body에 넣어 기록 불가",async()=>{
    const benefit=(await request(app).get("/api/benefits")).body[0];
    expect((await request(app).put(`/api/tracking/${benefit.id}`).set(headers(b)).send({...data,userId:a})).status).toBe(400);
  });
  it("큰글씨 설정 서버 저장",async()=>expect((await request(app).get("/api/me").set(headers(a))).body.preferences.largeText).toBe(true));
  it("알림 동의 철회는 같은 저장 작업에서 등록된 기기 토큰도 삭제",async()=>{
    await request(app).put("/api/preferences").set(headers(a)).send(pref);
    await registerDevice(a,`ExpoPushToken[consent_${suffix}]`);
    expect(Number((await pool.query("SELECT count(*) FROM iroun_push_devices WHERE user_id=$1",[a])).rows[0].count)).toBe(1);
    const r=await request(app).put("/api/preferences").set(headers(a)).send({...pref,notifications:false,personalizedAlerts:false});
    expect(r.status).toBe(200);
    expect(Number((await pool.query("SELECT count(*) FROM iroun_push_devices WHERE user_id=$1",[a])).rows[0].count)).toBe(0);
    expect((await request(app).get("/api/me").set(headers(a))).body.preferences.notifications).toBe(false);
    await request(app).put("/api/preferences").set(headers(a)).send(pref);
  });
  it("무료 맞춤알림 차단",async()=>expect((await request(app).put("/api/preferences").set(headers(a)).send({...pref,personalizedAlerts:true})).status).toBe(403));
  it("관리자 무상권 부여 후 맞춤 허용",async()=>{
    const r=await request(app).put(`/api/admin/grants/${a}`).set(headers(admin)).send({reason:"QA 무상 제공 검증",expiresAt:future,revoke:false});
    expect(r.status).toBe(200);
    const matched=await request(app).get("/api/recommendations").set(headers(a));
    expect(matched.status).toBe(200);expect(matched.body[0].result).toBe("추가 확인 필요");
  });
  it("무료권 회수 후 403",async()=>{
    await request(app).put(`/api/admin/grants/${a}`).set(headers(admin)).send({reason:"QA 무상권 회수 검증",expiresAt:future,revoke:true});
    expect((await request(app).get("/api/recommendations").set(headers(a))).status).toBe(403);
  });
  it("유효 구독만 있어도 허용 (스토어 거래 아닌 서버 fixture)",async()=>{
    await pool.query("INSERT INTO iroun_subscriptions(user_id,expires_at,state,provider,provider_id) VALUES($1,$2,'active','qa-only',$1)",[a,future]);
    expect((await request(app).get("/api/recommendations").set(headers(a))).status).toBe(200);
  });
  it("구독 만료만 있을 때 차단",async()=>{
    await pool.query("UPDATE iroun_subscriptions SET expires_at=$2,state='expired' WHERE user_id=$1",[a,past]);
    expect((await request(app).get("/api/recommendations").set(headers(a))).status).toBe(403);
  });
  it("구독 만료·무상권 유효 OR 허용",async()=>{
    await request(app).put(`/api/admin/grants/${a}`).set(headers(admin)).send({reason:"QA 중복 권한 검증",expiresAt:future,revoke:false});
    expect((await request(app).get("/api/recommendations").set(headers(a))).status).toBe(200);
  });
  it("양쪽 모두 만료 차단",async()=>{
    await pool.query("UPDATE iroun_grants SET expires_at=$2 WHERE user_id=$1",[a,past]);
    expect((await request(app).get("/api/recommendations").set(headers(a))).status).toBe(403);
  });
  it("감사이력 부여·회수·수정 보존",async()=>{
    const r=await request(app).get("/api/admin/dashboard").set(headers(admin));
    expect(r.status).toBe(200);expect(r.body.audit.some((x:{action:string})=>x.action==="무상 이용권 회수")).toBe(true);
    expect(r.body.connections.every((x:{name:string;status:string})=>x.name==="푸시"?x.status==="설정 대기":x.status==="미연동")).toBe(true);
  });
  it("관리자 테스트 공고 등록·수정·마감·비공개와 공개차단",async()=>{
    const real=(await request(app).get("/api/benefits")).body[0];
    const draft={...real,id:draftId,title:"검증 전용 자료 - 고객 공개 금지",sourceId:draftId,isTest:true,reviewStatus:"검토대기"};
    expect((await request(app).post("/api/admin/benefits").set(headers(admin)).send(draft)).status).toBe(200);
    expect((await request(app).get(`/api/benefits/${draftId}`)).status).toBe(404);
    expect((await request(app).put(`/api/admin/benefits/${draftId}`).set(headers(admin)).send({...draft,reviewStatus:"공개"})).status).toBe(400);
    expect((await request(app).put(`/api/admin/benefits/${draftId}`).set(headers(admin)).send({...draft,status:"마감",reviewStatus:"비공개"})).status).toBe(200);
    expect((await request(app).post("/api/admin/benefits").set(headers(admin)).send({...draft,id:"duplicate-test"})).status).toBe(409);
  });
  it("검토 후 공개된 공고는 마감·비공개 처리 뒤 일반 목록에서 사라짐",async()=>{
    const real=(await request(app).get("/api/benefits")).body[0];
    const draft={...real,id:closingId,sourceId:closingId,title:`검증 전용 종료 공고 ${suffix}`,agency:`검증기관 ${suffix}`,sourceUrl:`https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=${closingId}`,isTest:false,reviewStatus:"검토대기"};
    expect((await request(app).post("/api/admin/benefits").set(headers(admin)).send(draft)).status).toBe(200);
    expect((await request(app).put(`/api/admin/benefits/${closingId}`).set(headers(admin)).send({...draft,reviewStatus:"공개"})).status).toBe(200);
    expect((await request(app).get("/api/benefits")).body.some((item:{id:string})=>item.id===closingId)).toBe(true);
    expect((await request(app).put(`/api/admin/benefits/${closingId}`).set(headers(admin)).send({...draft,status:"마감",reviewStatus:"비공개"})).status).toBe(200);
    expect((await request(app).get("/api/benefits")).body.some((item:{id:string})=>item.id===closingId)).toBe(false);
    expect((await request(app).get("/api/admin/dashboard").set(headers(admin))).body.benefits.find((item:{id:string})=>item.id===closingId).status).toBe("마감");
  });
  it("제외 대출과 비공식 출처 등록차단",async()=>{
    const real=(await request(app).get("/api/benefits")).body[0];
    const draft={...real,id:draftId,isTest:true,reviewStatus:"검토대기"};
    expect((await request(app).post("/api/admin/benefits").set(headers(admin)).send({...draft,title:"신규 대출 지원"})).status).toBe(400);
    expect((await request(app).post("/api/admin/benefits").set(headers(admin)).send({...draft,sourceUrl:"https://example.com"})).status).toBe(400);
  });
  it("무료 고객 이용권 부여 API도 403",async()=>expect((await request(app).put(`/api/admin/grants/${b}`).set(headers(b)).send({reason:"권한 올리기",expiresAt:future,revoke:false})).status).toBe(403));
  it("구매 복원은 503, 완료 가장 없음",async()=>expect((await request(app).post("/api/membership/restore").set(headers(a))).status).toBe(503));
  it("가격 미설정, 구매불가 명시",async()=>{
    const r=await request(app).get("/api/membership");
    expect(r.body.configured).toBe(false);expect(r.body.price).toBeUndefined();
  });
  it("재인증 없는 탈퇴 차단",async()=>{
    provider.createdAt=Date.now()-11*60*1000;
    expect((await request(app).post("/api/account/deletion").set(headers(a)).send({confirmation:"회원 탈퇴"})).status).toBe(403);
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });
  it("재인증 후 탈퇴·저장/권한/개인정보 삭제 (Clerk 삭제 호출은 mock)",async()=>{
    provider.createdAt=Date.now();
    const r=await request(app).post("/api/account/deletion").set(headers(a)).send({confirmation:"회원 탈퇴"});
    expect(r.status).toBe(200);expect(provider.deleteUser).toHaveBeenCalledWith(a);
    expect((await request(app).get("/api/me").set(headers(a))).status).toBe(410);
    expect((await pool.query("SELECT * FROM iroun_tracking WHERE user_id=$1",[a])).rows).toEqual([]);
    expect((await pool.query("SELECT profile FROM iroun_accounts WHERE id=$1",[a])).rows[0].profile.personal).toEqual({});
  });
});
