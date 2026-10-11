import { pool } from "@workspace/db";
import { entitlement } from "./benefit-domain";

export const defaultProfile = {personal: {}, businesses: [], step: 0};
export const defaultPreferences = {largeText:false, notifications:false, privacyConsent:false, personalizedAlerts:false};
export async function account(id: string,allowDeleting=false) {
  await pool.query("INSERT INTO iroun_accounts(id) VALUES($1) ON CONFLICT DO NOTHING", [id]);
  const {rows:[a]} = await pool.query("SELECT * FROM iroun_accounts WHERE id=$1", [id]);
  if (a.deleted_at) throw Object.assign(new Error("삭제된 계정입니다."), {status:410});
  if(!allowDeleting && (await pool.query("SELECT id FROM iroun_deletions WHERE user_id=$1 AND status<>'삭제 완료'",[id])).rowCount) throw Object.assign(new Error("계정 삭제 요청 처리 중입니다."),{status:410});
  const {rows:[s]} = await pool.query("SELECT * FROM iroun_subscriptions WHERE user_id=$1", [id]);
  const {rows:[g]} = await pool.query("SELECT * FROM iroun_grants WHERE user_id=$1", [id]);
  const {rows:[clock]}=await pool.query("SELECT now() AS now");
  const now=clock.now.getTime();
  const access = entitlement(s && {expiresAt: s.expires_at.toISOString(), state:s.state}, g && {expiresAt:g.expires_at.toISOString(), revoked:!!g.revoked_at},now);
  const {rows:[trial]}=await pool.query("SELECT * FROM iroun_trials WHERE user_id=$1",[id]);
  const {rows:[contract]}=await pool.query("SELECT max(ends_at) AS until FROM iroun_contracts WHERE user_id=$1 AND revoked_at IS NULL AND starts_at<=now() AND ends_at>now()",[id]);
  const trialActive=!!trial&&trial.ends_at.getTime()>now;
  const contractActive=!!contract?.until;
  const {rows:[consent]}=await pool.query("SELECT accepted FROM iroun_consents WHERE user_id=$1 AND kind='service' ORDER BY id DESC LIMIT 1",[id]);
  const combined={...access,active:(access.active||trialActive||contractActive)&&consent?.accepted!==false,trialActive,contractActive,
    trialStartedAt:trial?.started_at?.toISOString(),trialUntil:trial?.ends_at?.toISOString(),contractUntil:contract?.until?.toISOString()};
  return {id:a.id, role:a.role, profile:a.profile, serverNow:clock.now.toISOString(), preferences:{...a.preferences, personalizedAlerts:combined.active && a.preferences.personalizedAlerts}, entitlement:combined};
}
export async function audit(actor: string, action: string, subject: string, data: unknown, client: Pick<typeof pool, "query"> = pool) {
  await client.query("INSERT INTO iroun_audit(actor,action,subject,data) VALUES($1,$2,$3,$4)", [actor,action,subject,JSON.stringify(data)]);
}
export const connections = [
  {name:"정부24",status:"미연동",reason:"공공데이터 API 승인·키 및 이용조건 확인 필요"},
  {name:"기업마당",status:"미연동",reason:"API 인증키와 수집 주기 설정 필요"},
  {name:"소상공인24·지자체",status:"미연동",reason:"허용 공개 경로·이용조건 검토 필요"},
  {name:"Apple / Google 구독",status:"미연동",reason:"개발자 계정·상품·가격·RevenueCat 검증 연결 필요"},
  {name:"푸시",status:"설정 대기",reason:"Expo 푸시 발송 코드는 준비됨. EAS/APNs/FCM 자격증명·운영 설정과 실기기 수신 확인 필요"},
  {name:"환급금 자동조회",status:"미연동",reason:"기관 조회 연동 없음. 종류와 공식 조회 경로만 안내"},
];
