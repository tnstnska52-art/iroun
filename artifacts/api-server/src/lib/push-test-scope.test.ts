import { afterEach, describe, expect, it, vi } from "vitest";
import { pushTestScope } from "./push-test-scope";
import { deliverDeadlines, expoTransport } from "./push-delivery";

afterEach(()=>vi.unstubAllEnvs());
describe("physical-device push safety scope",()=>{
  it("missing/partial consent scope fails closed",()=>{
    expect(pushTestScope({})).toBeNull();
    expect(pushTestScope({IROUN_PUSH_TEST_USER_ID:"tester",IROUN_PUSH_TEST_BENEFIT_ID:"test-notice"})).toBeNull();
    expect(pushTestScope({IROUN_PUSH_TEST_CONSENT_CONFIRMED:"true",IROUN_PUSH_TEST_USER_ID:"tester"})).toBeNull();
  });
  it("accepts explicit test scope, not malformed values",()=>{
    const env={IROUN_PUSH_TEST_CONSENT_CONFIRMED:"true",IROUN_PUSH_TEST_USER_ID:"user_test",IROUN_PUSH_TEST_BENEFIT_ID:"qa-notice"};
    expect(pushTestScope(env)).toEqual({userId:"user_test",benefitId:"qa-notice"});
    expect(pushTestScope({...env,IROUN_PUSH_TEST_BENEFIT_ID:"../notice"})).toBeNull();
    expect(pushTestScope({...env,IROUN_PUSH_TEST_USER_ID:" "})).toBeNull();
  });
  it("send enabled alone cannot reach the DB or provider",async()=>{
    vi.stubEnv("IROUN_PUSH_SEND_ENABLED","true");
    vi.stubEnv("IROUN_PUSH_TEST_CONSENT_CONFIRMED","");
    expect(await deliverDeadlines()).toEqual({blocked:true,accepted:0});
    await expect(expoTransport.send([])).rejects.toThrow("범위 설정");
  });
  it("a different requested user is blocked before querying",async()=>{
    vi.stubEnv("IROUN_PUSH_SEND_ENABLED","true");
    vi.stubEnv("IROUN_PUSH_TEST_CONSENT_CONFIRMED","true");
    vi.stubEnv("IROUN_PUSH_TEST_USER_ID","user_test");
    vi.stubEnv("IROUN_PUSH_TEST_BENEFIT_ID","qa-notice");
    expect(await deliverDeadlines(expoTransport,"other")).toEqual({blocked:true,accepted:0});
  });
});
