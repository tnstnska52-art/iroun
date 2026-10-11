import {describe,it,expect,vi} from "vitest";
const query=vi.hoisted(()=>vi.fn());
vi.mock("@workspace/db",()=>({pool:{query}}));
import {customerPushStatus,summarizePushStatus} from "./push-customer-status";
describe("고객 푸시 결과 안내",()=>{
  it.each(["provider_rejected","provider_error","receipt_error"])("%s 실패 안내",status=>{
    expect(summarizePushStatus(status).state).toBe("failed");
  });
  it.each(["sending","delivery_unknown"])("%s 성공으로 표시하지 않음",status=>{
    expect(summarizePushStatus(status).state).toBe("unknown");
  });
  it.each(["provider_accepted","provider_confirmed"])("%s 수신/읽음 보장하지 않음",status=>{
    expect(summarizePushStatus(status).message).toContain("확인된 것은 아닙니다");
  });
  it("동의/권한 없으면 이전 전송 기록을 조회하지 않음",async()=>{
    query.mockClear();
    expect((await customerPushStatus("test-owner",false)).state).toBe("unavailable");
    expect(query).not.toHaveBeenCalled();
  });
  it("본인 계정 필터와 최소 응답",async()=>{
    query.mockResolvedValueOnce({rows:[{status:"receipt_error",ticket_ids:"private",benefit_id:"private"}]});
    const result=await customerPushStatus("test-owner",true);
    expect(query.mock.lastCall?.[0]).toContain("WHERE user_id=$1");
    expect(query.mock.lastCall?.[1]).toEqual(["test-owner"]);
    expect(Object.keys(result).sort()).toEqual(["enabled","message","state"]);
  });
  it("기록 없음",()=>expect(summarizePushStatus().state).toBe("none"));
});
