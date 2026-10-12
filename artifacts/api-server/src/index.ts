import app from "./app";
import { logger } from "./lib/logger";
import { startServiceScheduler } from "./lib/service-scheduler";
import { runMigrations } from "./lib/migrate";

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

if(process.env.IROUN_AUTO_MIGRATE!=="false")await runMigrations();

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
