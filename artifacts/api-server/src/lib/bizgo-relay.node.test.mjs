import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createBizgoRelay} from './bizgo-relay.ts';

const secret='ab'.repeat(32), apiKey='fixture-provider-key', now=1795137250000;
const profile={environment:'production',method:'GET',path:'/api/comm/v1/account/kakao/sender?uuid=%40fixture',apiKey};
function signed(value=profile,overrides={}){
 const raw=Buffer.from(JSON.stringify(value)),timestamp=String(now),nonce=randomUUID();
 return {raw,timestamp,nonce,signature:createHmac('sha256',secret).update(timestamp+'.'+nonce+'.').update(raw).digest('hex'),...overrides};
}
function setup(mode='ok'){
 const calls=[];const relay=createBizgoRelay({secret:()=>secret,now:()=>now,fetch:async (url,init)=>{
  calls.push({url,init});assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,apiKey);
  assert.deepEqual(Object.keys(init.headers).sort(),init.method==='POST'?['Accept','Authorization','Content-Type']:['Accept','Authorization']);
  if(mode==='throw')throw Error('do-not-disclose '+apiKey);
  if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://untrusted.invalid/'}});
  if(mode==='large')return new Response('x'.repeat(65537));
  if(mode==='denied')return Response.json({common:{authCode:'A403',authResult:"ACL Not Allowed. Please register: '74.220.52.12'"}},{status:403});
  return Response.json({common:{authCode:'A000'},data:{code:'A000'}});
 }});return {relay,calls};
}
test('authenticated queries retain environment and allowed parameters',async()=>{
 const {relay,calls}=setup();
 for(const value of [profile,{...profile,environment:'sandbox'},{...profile,path:'/api/comm/v1/center/alimtalk/template?senderKey=fixture&templateCode=APPROVED'},{...profile,path:'/api/comm/v1/report/inquiry/MSG%3A001'}])assert.equal((await relay(signed(value))).status,200);
 assert.equal(calls.length,4);assert.equal(calls[1].url,'https://sandbox-mars.ibapi.kr'+profile.path);
});
test('rejects invalid authentication, stale requests and replay before provider contact',async()=>{
 const {relay,calls}=setup();
 for(const input of [signed(profile,{signature:'0'.repeat(64)}),signed(profile,{timestamp:String(now-61000)}),signed(profile,{raw:Buffer.from(JSON.stringify({...profile,apiKey:'tampered'}))}),signed(profile,{nonce:'wrong'})])assert.equal((await relay(input)).status,401);
 assert.equal(calls.length,0);const input=signed();assert.equal((await relay(input)).status,200);assert.equal((await relay(input)).status,409);assert.equal(calls.length,1);
 assert.equal((await createBizgoRelay({secret:()=>''})(input)).status,503);
});
test('rejects arbitrary targets, disallowed paths, methods, duplicate parameters and injected headers',async()=>{
 const {relay,calls}=setup();
 for(const value of [{...profile,path:'https://evil.invalid/'},{...profile,path:'//evil.invalid/api/comm/v1/account/kakao/sender?uuid=x'},{...profile,path:'/api/comm/v1/account/kakao/sender?uuid=x&uuid=y'},{...profile,path:'/api/comm/v1/account/kakao/../sender?uuid=x'},{...profile,path:'/api/comm/v1/report/inquiry/MSG%2F001'},{...profile,method:'DELETE'},{...profile,apiKey:'key\r\nCookie: private'},{...profile,body:'{}'}])assert.equal((await relay(signed(value))).status,400,JSON.stringify(value));
 assert.equal(calls.length,0);
});
test('Alimtalk forwards the identical single-recipient payload and idempotency key once',async()=>{
 const {relay,calls}=setup();
 const body=JSON.stringify({destinations:[{to:'01000000000'}],messageFlow:[{alimtalk:{senderKey:'fixture',templateCode:'approved',text:'mock only'}}],idempotencyKey:'bp-today-abcdef012345',idempotencyTtl:86400});
 const value={...profile,method:'POST',path:'/api/comm/v1/send/omni',body};
 assert.equal((await relay(signed(value))).status,200);assert.equal(calls[0].init.body,body);
 assert.equal((await relay(signed({...value,environment:'sandbox'}))).status,400);
 assert.equal((await relay(signed({...value,body:JSON.stringify({...JSON.parse(body),idempotencyKey:undefined})}))).status,400);
 assert.equal(calls.length,1);
});
test('redirect, malformed and uncertain responses never trigger retries or expose errors',async()=>{
 for(const mode of ['throw','redirect','large']){const {relay,calls}=setup(mode);const result=await relay(signed());assert.equal(result.status,502);assert.equal(calls.length,1);assert.ok(!result.body.includes(apiKey));}
 const {relay}=setup('denied');const result=await relay(signed());assert.equal(result.status,403);assert.match(result.body,/74\.220\.52\.12/);
});
