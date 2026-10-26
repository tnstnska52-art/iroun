/**
 * 스토어 심사용 계정: 운영자가 서버 환경변수 IROUN_REVIEW_ACCOUNTS 에 Clerk 사용자 식별자(user_...)를
 * 쉼표로 넣으면, 서버가 켜질 때 그 계정에 1년짜리 무상 이용권을 준다(Google·Apple 심사자는 무료 체험을 쓸 수 없음).
 * 목록에서 빼면 다음 시작 때 그 계정의 심사용 이용권을 회수한다. 다른 무상권은 건드리지 않는다.
 */
import { pool } from "@workspace/db";
import { audit } from "./benefit-store";

export const REVIEW_REASON = "스토어 심사용 계정";
export const reviewAccountIds = (raw = process.env.IROUN_REVIEW_ACCOUNTS ?? "") =>
  [...new Set(raw.split(/[\s,]+/).filter((s) => /^user_[A-Za-z0-9]+$/.test(s)))];

export async function syncReviewAccounts(ids = reviewAccountIds(), client: Pick<typeof pool, "query"> = pool) {
  for (const id of ids) {
    await client.query("INSERT INTO iroun_accounts(id) VALUES($1) ON CONFLICT DO NOTHING", [id]);
    const r = await client.query(
      "INSERT INTO iroun_grants(user_id,expires_at,reason,granted_by) VALUES($1,now()+interval '1 year',$2,'operator-env') " +
        "ON CONFLICT(user_id) DO UPDATE SET expires_at=GREATEST(iroun_grants.expires_at,EXCLUDED.expires_at),revoked_at=NULL,reason=EXCLUDED.reason,granted_by=EXCLUDED.granted_by " +
        "WHERE iroun_grants.reason=$2 OR iroun_grants.revoked_at IS NOT NULL OR iroun_grants.expires_at<now()",
      [id, REVIEW_REASON],
    );
    if (r.rowCount) await audit("operator-env", "심사용 계정 이용권", id, { days: 365 }, client);
  }
  const revoked = await client.query(
    "UPDATE iroun_grants SET revoked_at=now() WHERE reason=$1 AND revoked_at IS NULL AND NOT (user_id = ANY($2::text[])) RETURNING user_id",
    [REVIEW_REASON, ids],
  );
  for (const row of revoked.rows) await audit("operator-env", "심사용 계정 이용권 회수", row.user_id, {}, client);
  return { granted: ids.length, revoked: revoked.rowCount ?? 0 };
}
