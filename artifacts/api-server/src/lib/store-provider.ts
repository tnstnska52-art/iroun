import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { account } from "./benefit-store";
import { applyStoreEvent, type VerifiedSubscription } from "./subscription-verification";

export function billingConfig() {
  const mode=process.env.IROUN_BILLING_MODE ?? "disabled";
  const products={apple:process.env.IROUN_APPLE_MONTHLY_PRODUCT ?? "",google:process.env.IROUN_GOOGLE_MONTHLY_PRODUCT ?? ""};
  const configured=["sandbox","production"].includes(mode) && !!process.env.REVENUECAT_SECRET_API_KEY &&
    !!process.env.REVENUECAT_WEBHOOK_SECRET && !!process.env.IROUN_REVENUECAT_ENTITLEMENT &&
    !!(products.apple || products.google);
  return {configured,mode:configured?mode:"disabled",products};
}
const unavailable=()=>Object.assign(new Error("스토어 상품·검증 제공자·웹훅 설정이 필요합니다. 구매 및 복원 완료로 처리하지 않았습니다."),{status:503});
const sub=z.object({
  expires_date:z.string().nullable(),grace_period_expires_date:z.string().nullable().optional(),
  refunded_at:z.string().nullable().optional(),unsubscribe_detected_at:z.string().nullable().optional(),
  is_sandbox:z.boolean(),store:z.string(),store_transaction_id:z.union([z.string(),z.number()]),
});
const info=z.object({
  request_date_ms:z.number(),
  subscriber:z.object({
    original_app_user_id:z.string(),
    entitlements:z.record(z.string(),z.object({product_identifier:z.string(),expires_date:z.string().nullable()})),
    subscriptions:z.record(z.string(),sub),
  }),
});
/** Official REST v1 customer-info model. Never trusts client CustomerInfo. */
export async function verifyCustomer(id:string, fetcher:typeof fetch=fetch):Promise<VerifiedSubscription> {
  const c=billingConfig();
  if(!c.configured) throw unavailable();
  const response=await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`,{
    headers:{Authorization:`Bearer ${process.env.REVENUECAT_SECRET_API_KEY}`,Accept:"application/json"},
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok) throw Object.assign(new Error("스토어 검증기관에 확인하지 못했습니다. 이용권을 새로 부여하지 않았습니다."),{status:503});
  const body=info.parse(await response.json()), s=body.subscriber;
  if(s.original_app_user_id!==id) throw Object.assign(new Error("다른 계정의 거래이거나 계정 이전 확인이 필요합니다."),{status:403});
  const e=s.entitlements[process.env.IROUN_REVENUECAT_ENTITLEMENT!];
  if(!e) return {customerId:id,platform:"apple",transactionId:`none-${id}`,expiresAt:new Date(0).toISOString(),state:"expired",verifiedAt:new Date(body.request_date_ms).toISOString()};
  const p=s.subscriptions[e.product_identifier];
  const platform=p?.store==="app_store"?"apple":p?.store==="play_store"?"google":null;
  if(!p || !platform || e.product_identifier!==c.products[platform]) throw new Error("정식 월구독 상품이 아닙니다. 테스트 스토어·웹 결제·프로모션은 구독으로 인정하지 않습니다.");
  if(p.is_sandbox!==(c.mode==="sandbox")) throw new Error("시험 거래와 운영 거래 환경이 일치하지 않습니다.");
  const expiry=p.grace_period_expires_date || p.expires_date;
  if(!expiry || !Number.isFinite(Date.parse(expiry))) throw new Error("월구독 만료일을 확인하지 못했습니다.");
  return {
    customerId:id,platform,transactionId:String(p.store_transaction_id),
    expiresAt:new Date(expiry).toISOString(),verifiedAt:new Date(body.request_date_ms).toISOString(),
    state:p.refunded_at?"refunded":Date.parse(expiry)<=Date.now()?"expired":p.unsubscribe_detected_at?"cancelled":"active",
  };
}
export async function syncCustomer(id:string,fetcher:typeof fetch=fetch){
  await applyStoreEvent({verify:()=>verifyCustomer(id,fetcher)},null);
  return (await account(id)).entitlement;
}
export function validWebhookAuthorization(header:string|undefined){
  const secret=process.env.REVENUECAT_WEBHOOK_SECRET;
  if(!billingConfig().configured || !secret || !header) return false;
  const a=Buffer.from(header),b=Buffer.from(`Bearer ${secret}`);
  return a.length===b.length && timingSafeEqual(a,b);
}
