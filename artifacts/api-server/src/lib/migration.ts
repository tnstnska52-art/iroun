import { existsSync, readFileSync } from "node:fs";
// 개발·시험(src/lib)에서는 ../migrations, 빌드본(dist/index.mjs)에서는 ../src/migrations.
export function migrationSql(name: string) {
  for (const rel of ["../migrations/", "../src/migrations/"]) {
    const url = new URL(rel + name, import.meta.url);
    if (existsSync(url)) return readFileSync(url, "utf8");
  }
  throw new Error("migration not found: " + name);
}
