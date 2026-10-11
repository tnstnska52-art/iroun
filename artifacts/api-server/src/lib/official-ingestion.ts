import { pool } from "@workspace/db";
import { audit } from "./benefit-store";
import { benefitSchema, excludedCategory, normalizeSourceKey, officialUrl } from "./benefit-domain";

/**
 * Store provider notices for operator review. Provider changes are proposals:
 * they must not overwrite curated fields or publish without a human review.
 */
export async function stageOfficialNotice(
  input: unknown,
  operator: string,
  options: { sourceRecord?: unknown; baselineOnly?: boolean; contentHash?: string } = {},
) {
  const b=benefitSchema.parse(input);
  if(!officialUrl(b.sourceUrl)||excludedCategory(b)) throw new Error("수집 대상이 아닌 출처 또는 제외 사업입니다.");
  b.reviewStatus="검토대기";
  const key=normalizeSourceKey(b),client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[b.sourceUrl]);
    const found=(await client.query(
      "SELECT data,source_key FROM iroun_benefits WHERE source_key=$1 OR ((data->>'isTest')::boolean=$5 AND (data->>'sourceUrl'=$3 OR ($4::boolean AND data->>'sourceId'=$2 AND data->>'sourceUrl' LIKE 'https://www.bizinfo.go.kr/%'))) FOR UPDATE",
      [key,b.sourceId,b.sourceUrl,b.sourceUrl.startsWith("https://www.bizinfo.go.kr/"),b.isTest],
    )).rows;
    if(found.length>1) throw new Error("동일 공식 식별자의 중복 자료를 운영자가 검토해야 합니다.");
    const prior=found[0]?.data;
    if(prior&&prior.isTest!==b.isTest)throw new Error("시험자료와 운영자료의 식별자가 충돌합니다. 분리 등록해야 합니다.");
    const saveSnapshot=async()=>{
      if(!options.contentHash) return;
      await client.query(
        "INSERT INTO iroun_feed_snapshots(source_id,content_hash,checked_at) VALUES($1,$2,$3) ON CONFLICT(source_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,checked_at=EXCLUDED.checked_at",
        [b.sourceId,options.contentHash,b.checkedAt],
      );
    };
    if(prior && options.baselineOnly){
      // The first feed observation may be a manually curated seed. Establish a
      // comparison point without changing its content or publication status.
      await audit(operator,"공식 원문 최초 기준점·기존 자료 보존",prior.id,{
        before:prior,after:prior,proposed:b,sourceRecord:options.sourceRecord??input,
      },client);
      await saveSnapshot();
      await client.query("COMMIT");
      return {id:prior.id,reviewStatus:prior.reviewStatus,automaticallyPublished:false,preserved:true,reused:true};
    }
    if(prior){
      b.id=prior.id;
      // Keep every curated field intact but remove the notice from public view
      // until an operator accepts or rejects this new official version.
      const reviewCopy: typeof b={
        ...prior,
        checkedAt:b.checkedAt,
        status:"확인 필요",
        budgetStatus:"확인 필요",
        reviewStatus:"검토대기",
      };
      await client.query("UPDATE iroun_benefits SET data=$2,updated_at=now() WHERE id=$1",[prior.id,JSON.stringify(reviewCopy)]);
      await audit(operator,"공식 자료 변경 검토대기",prior.id,{
        before:prior,after:reviewCopy,proposed:b,sourceRecord:options.sourceRecord??input,
      },client);
      await saveSnapshot();
      await client.query("COMMIT");
      return {id:prior.id,reviewStatus:reviewCopy.reviewStatus,automaticallyPublished:false,preserved:true,reused:true};
    }
    const inserted=await client.query("INSERT INTO iroun_benefits(id,source_key,data) VALUES($1,$2,$3) ON CONFLICT(source_key) DO NOTHING RETURNING id",[b.id,key,JSON.stringify(b)]);
    if(!inserted.rowCount) throw new Error("동일 기관·식별자의 공고가 이미 있습니다.");
    await audit(operator,"공식 자료 신규 검토대기",b.id,{
      before:null,after:b,proposed:b,sourceRecord:options.sourceRecord??input,
    },client);
    await saveSnapshot();
    await client.query("COMMIT");
    return {id:b.id,reviewStatus:b.reviewStatus,automaticallyPublished:false,preserved:false,reused:false};
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}

/** Refresh only verification time when the official payload is unchanged. */
export async function refreshOfficialCheck(sourceId: string, checkedAt: string, sourceUrl?: string, isTest?: boolean) {
  const sourceClause=sourceUrl
    ? " AND data->>'sourceUrl'=$3 AND (data->>'isTest')::boolean=$4"
    : " AND data->>'sourceUrl' LIKE 'https://www.bizinfo.go.kr/%'";
  await pool.query(
    `UPDATE iroun_benefits
     SET data=jsonb_set(data,'{checkedAt}',to_jsonb($2::text),true)
     WHERE data->>'sourceId'=$1${sourceClause}`,
    sourceUrl?[sourceId,checkedAt,sourceUrl,isTest===true]:[sourceId,checkedAt],
  );
  await pool.query("UPDATE iroun_feed_snapshots SET checked_at=$2 WHERE source_id=$1",[sourceId,checkedAt]);
}
