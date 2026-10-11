/**
 * Server-only store verification boundary.
 * An expiry/state from the customer is NEVER evidence of a purchase.
 * Implement an Apple/Google/RevenueCat verifier only after credentials exist.
 * There is intentionally no HTTP route that accepts a "verified" flag.
 */
import { pool } from "@workspace/db";
import { audit } from "./benefit-store";
import { z } from "zod";
export interface VerifiedSubscription {
  customerId:string;
  platform:"apple"|"google";
  transactionId:string;
  expiresAt:string;
  state:"active"|"cancelled"|"expired"|"refunded"|"revoked";
  verifiedAt?:string;
}
export interface StoreVerifier {
  // Must authenticate notification/provider receipt and bind it to app + product + user.
  verify(event:unknown):Promise<VerifiedSubscription>;
}
export async function applyStoreEvent(verifier:StoreVerifier,event:unknown) {
  const s=z.object({
    customerId:z.string().min(1),platform:z.enum(["apple","google"]),transactionId:z.string().min(1),
    expiresAt:z.string().datetime(),state:z.enum(["active","cancelled","expired","refunded","revoked"]),
    verifiedAt:z.string().datetime().optional(),
  }).parse(await verifier.verify(event));
  const snapshot=s.verifiedAt ?? new Date().toISOString();
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const a=(await client.query("SELECT id FROM iroun_accounts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[s.customerId])).rows[0];
    if(!a) throw new Error("이 거래의 고객 계정을 확인할 수 없습니다.");
    if((await client.query("SELECT id FROM iroun_deletions WHERE user_id=$1 AND status <> '삭제 완료'",[s.customerId])).rowCount) throw new Error("삭제 요청 중인 계정입니다.");
    const last=(await client.query("SELECT snapshot_at FROM iroun_billing_sync WHERE user_id=$1",[s.customerId])).rows[0];
    if(last && last.snapshot_at.getTime()>=Date.parse(snapshot)) {await client.query("COMMIT");return {applied:false,reason:"중복 또는 이전 상태"};}
    const transactionKey=`${s.platform}:${s.transactionId}`;
    const existing=(await client.query("SELECT user_id FROM iroun_billing_transactions WHERE provider_id=$1",[transactionKey])).rows[0];
    if(existing&&existing.user_id!==s.customerId) throw new Error("다른 고객 계정의 거래입니다.");
    const claim=await client.query("INSERT INTO iroun_billing_transactions(provider_id,user_id) VALUES($1,$2) ON CONFLICT(provider_id) DO UPDATE SET provider_id=EXCLUDED.provider_id WHERE iroun_billing_transactions.user_id=EXCLUDED.user_id RETURNING user_id",[transactionKey,s.customerId]);
    if(!claim.rowCount) throw new Error("다른 고객에게 연결된 거래입니다.");
    await client.query("INSERT INTO iroun_subscriptions(user_id,expires_at,state,provider,provider_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,state=EXCLUDED.state,provider=EXCLUDED.provider,provider_id=EXCLUDED.provider_id",[s.customerId,s.expiresAt,s.state,s.platform,transactionKey]);
    await client.query("INSERT INTO iroun_billing_sync(user_id,snapshot_at) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET snapshot_at=EXCLUDED.snapshot_at",[s.customerId,snapshot]);
    await audit("verified-store-adapter","기관 검증 구독 상태 반영",s.customerId,{platform:s.platform,state:s.state,expiresAt:s.expiresAt},client);
    await client.query("COMMIT");
    return {applied:true};
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
