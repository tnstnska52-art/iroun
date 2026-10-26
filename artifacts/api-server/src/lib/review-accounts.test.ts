import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { account } from "./benefit-store";
import { reviewAccountIds, syncReviewAccounts } from "./review-accounts";

const a = "user_qaReview" + randomUUID().replace(/-/g, "").slice(0, 10), b = "user_qaOther" + randomUUID().replace(/-/g, "").slice(0, 10);
afterAll(async () => {
  await pool.query("DELETE FROM iroun_grants WHERE user_id=ANY($1)", [[a, b]]);
  await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1)", [[a, b]]);
});
describe("스토어 심사용 계정", () => {
  it("형식이 맞는 식별자만 받는다", () => {
    expect(reviewAccountIds(` ${a}, bad, ${a},user_x-y `)).toEqual([a]);
  });
  it("목록의 계정은 이용권이 생기고, 빼면 회수되며, 다른 무상권은 그대로", async () => {
    await pool.query("INSERT INTO iroun_accounts(id) VALUES($1) ON CONFLICT DO NOTHING", [b]);
    await pool.query("INSERT INTO iroun_grants(user_id,expires_at,reason,granted_by) VALUES($1,now()+interval '30 days','고객 무상권','admin')", [b]);
    await syncReviewAccounts([a, b]);
    expect((await account(a)).entitlement.active).toBe(true);
    expect((await pool.query("SELECT reason FROM iroun_grants WHERE user_id=$1", [b])).rows[0].reason).toBe("고객 무상권");
    await syncReviewAccounts([]);
    expect((await pool.query("SELECT revoked_at FROM iroun_grants WHERE user_id=$1", [a])).rows[0].revoked_at).not.toBeNull();
    expect((await pool.query("SELECT revoked_at FROM iroun_grants WHERE user_id=$1", [b])).rows[0].revoked_at).toBeNull();
  });
});
