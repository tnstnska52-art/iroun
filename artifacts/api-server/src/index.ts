import app from "./app";
import { logger } from "./lib/logger";
import { startServiceScheduler } from "./lib/service-scheduler";
import { runMigrations } from "./lib/migrate";
import { seedOfficial } from "./lib/official-seed";
import { syncReviewAccounts } from "./lib/review-accounts";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if(process.env.IROUN_AUTO_MIGRATE!=="false"){
  await runMigrations();
  // 새 DB(공고 0건)일 때만 공식 기본 자료를 넣는다.
  if(!(await pool.query("SELECT 1 FROM iroun_benefits LIMIT 1")).rowCount){
    const added=await seedOfficial();
    logger.info({added},"공식 기본 자료 등록");
  }
  // 스토어 심사용 계정 이용권(IROUN_REVIEW_ACCOUNTS). 실패해도 서버는 켠다.
  await syncReviewAccounts().then(r=>logger.info(r,"심사용 계정 확인")).catch(()=>logger.warn("심사용 계정 이용권 처리 실패"));
}

const server=app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  const stop=startServiceScheduler();
  for(const signal of ["SIGTERM","SIGINT"] as const)process.once(signal,()=>{
    logger.info({signal},"Development server shutdown requested");
    stop();
    server.close(()=>process.exit(0));
    setTimeout(()=>process.exit(1),5000).unref();
  });
});
