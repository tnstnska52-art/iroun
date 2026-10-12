import { pool } from "@workspace/db";
import { seedOfficial } from "./lib/official-seed";

await seedOfficial();
process.stdout.write("공식 자료 4개를 검토하여 초기 등록했습니다. 기존 운영자 수정은 덮어쓰지 않았습니다.\n");
await pool.end();
