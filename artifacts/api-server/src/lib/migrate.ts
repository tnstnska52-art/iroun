// 서버가 켜질 때 DB 구조를 자동으로 맞춘다. 이미 적용한 파일은 다시 실행하지 않는다.
// 여러 서버가 동시에 켜져도 한 곳만 실행하도록 잠근다.
import { pool } from "@workspace/db";
import { migrationSql } from "./migration";
import { logger } from "./logger";

export const MIGRATIONS = ["001-base.sql", "002-prepared-services.sql", "003-company-services.sql", "004-fund-leads.sql", "005-documents.sql", "006-crm-contracts.sql"];

export async function runMigrations() {
  const c = await pool.connect();
  try {
    await c.query("SELECT pg_advisory_lock(727001)");
    await c.query("CREATE TABLE IF NOT EXISTS iroun_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await c.query("SELECT name FROM iroun_schema_migrations")).rows.map((r) => r.name as string));
    // 예전 방식(drizzle push)으로 이미 기본 구조가 있는 DB는 001을 건너뛴다.
    if (!done.has(MIGRATIONS[0]!) && (await c.query("SELECT to_regclass('public.iroun_accounts') AS t")).rows[0].t) {
      await c.query("INSERT INTO iroun_schema_migrations(name) VALUES($1)", [MIGRATIONS[0]]);
      done.add(MIGRATIONS[0]!);
    }
    const applied: string[] = [];
    for (const name of MIGRATIONS) {
      if (done.has(name)) continue;
      await c.query(migrationSql(name));
      await c.query("INSERT INTO iroun_schema_migrations(name) VALUES($1)", [name]);
      applied.push(name);
    }
    if (applied.length) logger.info({ applied }, "DB 구조 적용");
    return applied;
  } finally {
    await c.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    c.release();
  }
}
