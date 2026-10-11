import {pool} from "@workspace/db";

export function summarizePushStatus(status?:string) {
  if(status==="provider_rejected"||status==="provider_error"||status==="receipt_error")
    return {state:"failed",message:"휴대전화 알림 전송에 실패한 기록이 있습니다. 기기 알림을 다시 등록하고, 받은 알림은 앱 안 알림함에서 확인해 주세요."};
  if(status==="delivery_unknown"||status==="sending")
    return {state:"unknown",message:"최근 알림 전송 결과를 확인하지 못했습니다. 중복 발송을 막기 위해 자동으로 다시 보내지 않습니다. 앱 안 알림함을 확인해 주세요."};
  if(status==="provider_accepted"||status==="provider_confirmed")
    return {state:"provider_received",message:"알림 제공자가 요청을 접수했습니다. 휴대전화 표시나 읽음이 확인된 것은 아닙니다. 알림이 없으면 기기 설정과 앱 안 알림함을 확인해 주세요."};
  return {state:"none",message:"아직 확인할 전송 기록이 없습니다."};
}

export async function customerPushStatus(userId:string,allowed:boolean){
  const enabled=process.env.IROUN_PUSH_SEND_ENABLED==="true";
  if(!allowed)return {enabled,state:"unavailable",message:"알림 동의와 유효 이용권이 있을 때 전송 상태를 확인할 수 있습니다."};
  // Return no benefit, ticket, token, internal reason, or other account metadata.
  const {rows}=await pool.query(
    "SELECT status FROM iroun_push_jobs WHERE user_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 1",[userId]);
  return {enabled,...summarizePushStatus(rows[0]?.status)};
}
