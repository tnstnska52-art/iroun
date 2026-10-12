-- 회사 전산(CRM)의 패키지 앱 이용 계약 ↔ 앱 계정 연결.
-- 전화번호는 원문을 두지 않고 해시만 둔다(가입 전 고객을 나중에 찾기 위한 용도).
CREATE TABLE IF NOT EXISTS iroun_crm_links (
 crm_contract_id text PRIMARY KEY,
 crm_customer_id text NOT NULL,
 user_id text REFERENCES iroun_accounts(id) ON DELETE SET NULL,
 app_contract_id text,
 version integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended','revoked')),
 state text NOT NULL DEFAULT 'new' CHECK(state IN('new','linked','pending_signup','review_required','stopped')),
 review_reason text,
 phone_hash text,
 starts_at timestamptz, ends_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iroun_crm_links_pending ON iroun_crm_links(phone_hash) WHERE state='pending_signup';
CREATE INDEX IF NOT EXISTS iroun_crm_links_user ON iroun_crm_links(user_id);
CREATE TABLE IF NOT EXISTS iroun_crm_events (
 event_id text PRIMARY KEY,
 crm_contract_id text NOT NULL,
 version integer NOT NULL,
 type text NOT NULL,
 receipt text NOT NULL CHECK(receipt IN('applied','pending_signup','review_required')),
 received_at timestamptz NOT NULL DEFAULT now()
);
