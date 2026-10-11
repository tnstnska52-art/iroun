-- 정책자금 진단 요청. 신용점수·대출·연체 이력이 들어 있는 민감한 자료다. 관리자와 담당 직원만 본다.
CREATE TABLE IF NOT EXISTS iroun_fund_leads (
 id text PRIMARY KEY, user_id text, phone text NOT NULL, name text NOT NULL, business_name text NOT NULL,
 answers jsonb NOT NULL, state text NOT NULL DEFAULT '접수됨', memo text NOT NULL DEFAULT '',
 request_key text NOT NULL UNIQUE, consent_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iroun_fund_leads_created ON iroun_fund_leads(created_at DESC);
