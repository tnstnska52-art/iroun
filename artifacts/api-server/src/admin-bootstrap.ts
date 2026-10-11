import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import { audit } from "./lib/benefit-store";

// Operator-only command; never mounted as an HTTP endpoint.
const args=process.argv.slice(2).filter(x=>x!=="--");
const id=args[0];
if(args.length!==1 || !id || !/^user_[a-zA-Z0-9]+$/.test(id)) throw new Error("실제 Clerk 사용자 식별자 하나를 인수로 지정해야 합니다.");
await clerkClient.users.getUser(id);
const client=await pool.connect();
try {
  await client.query("BEGIN");
  const assigned=await client.query("INSERT INTO iroun_accounts(id,role) VALUES($1,'admin') ON CONFLICT(id) DO UPDATE SET role='admin' WHERE iroun_accounts.deleted_at IS NULL",[id]);
  if(!assigned.rowCount) throw new Error("탈퇴한 계정에는 관리자 권한을 지정할 수 없습니다.");
  await audit("operator-cli","운영자가 최초 관리자 지정",id,{method:"server-only CLI"},client);
  await client.query("COMMIT");
  process.stdout.write("지정한 인증 계정에 관리자 권한을 부여했습니다.\n");
}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();await pool.end();}
