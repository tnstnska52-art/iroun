-- 고객이 올린 서류. 사업자등록증명 등 개인정보가 들어 있다. 본인과 회사 관리자·담당 직원만 본다.
-- 계정을 지우면 함께 지워진다.
CREATE TABLE IF NOT EXISTS iroun_documents (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 name text NOT NULL, filename text NOT NULL, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,name)
);
