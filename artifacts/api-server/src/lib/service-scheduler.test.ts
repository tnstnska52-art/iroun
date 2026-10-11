import {afterEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({ready:vi.fn(),run:vi.fn().mockResolvedValue({}),biz:vi.fn().mockReturnValue({ready:false}),push:vi.fn()}));
vi.mock("./public-feeds",()=>({publicFeedScheduleReady:mocks.ready,runPublicFeed:mocks.run}));
vi.mock("./official-feed",()=>({bizinfoFeedConfiguration:mocks.biz,runBizinfoFeed:vi.fn()}));
vi.mock("./push-delivery",()=>({deliverDeadlines:mocks.push,checkPushReceipts:vi.fn()}));
vi.mock("./logger",()=>({logger:{warn:vi.fn()}}));
import {startServiceScheduler} from "./service-scheduler";
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.clearAllMocks();});
describe("개발 주기수집 정지와 준비 차단",()=>{
 it("준비 없는 공급자와 실제 푸시를 시작하지 않음",async()=>{
  vi.useFakeTimers();vi.stubEnv("IROUN_OFFICIAL_FEEDS_ENABLED","true");vi.stubEnv("IROUN_PUSH_SEND_ENABLED","false");mocks.ready.mockReturnValue(false);
  const stop=startServiceScheduler();await vi.advanceTimersByTimeAsync(7200000);stop();
  expect(mocks.run).not.toHaveBeenCalled();expect(mocks.push).not.toHaveBeenCalled();
 });
 it("준비된 공급자만 실행하고 정리 후 새 수집 없음",async()=>{
  vi.useFakeTimers();vi.stubEnv("IROUN_OFFICIAL_FEEDS_ENABLED","true");vi.stubEnv("IROUN_PUSH_SEND_ENABLED","false");vi.stubEnv("IROUN_FEED_INTERVAL_MINUTES","60");
  mocks.ready.mockImplementation(s=>s==="gov24");
  const stop=startServiceScheduler();await vi.advanceTimersByTimeAsync(3600000);
  expect(mocks.run).toHaveBeenCalledTimes(1);expect(mocks.run).toHaveBeenCalledWith("gov24");
  stop();await vi.advanceTimersByTimeAsync(7200000);expect(mocks.run).toHaveBeenCalledTimes(1);
 });
});
