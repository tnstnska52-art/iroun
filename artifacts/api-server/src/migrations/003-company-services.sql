BEGIN;
CREATE TABLE IF NOT EXISTS iroun_trials (
 user_id text PRIMARY KEY REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS iroun_trial_ledger (
 identity_hash text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iroun_contracts (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, reason text NOT NULL,
 evidence text NOT NULL, actor text NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS iroun_owner_codes (
 code_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE IF NOT EXISTS iroun_consents (
 id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 kind text NOT NULL, version text NOT NULL, content text NOT NULL, accepted boolean NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iroun_staff (
 user_id text PRIMARY KEY REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 name text NOT NULL, phone text NOT NULL DEFAULT '', kakao text NOT NULL DEFAULT '',
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS iroun_company_settings (
 id text PRIMARY KEY DEFAULT 'company', phone text NOT NULL DEFAULT '', kakao text NOT NULL DEFAULT '', website text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS iroun_service_requests (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 benefit_id text REFERENCES iroun_benefits(id), business_id text NOT NULL DEFAULT '',
 kind text NOT NULL, state text NOT NULL DEFAULT '회사 접수', assigned_to text REFERENCES iroun_accounts(id),
 snapshot jsonb NOT NULL, customer_tasks jsonb NOT NULL DEFAULT '[]',
 staff_tasks jsonb NOT NULL DEFAULT '[]', completed_tasks jsonb NOT NULL DEFAULT '[]',
 internal_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,benefit_id,business_id,kind)
);
CREATE TABLE IF NOT EXISTS iroun_inquiries (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 title text NOT NULL, body text NOT NULL, state text NOT NULL DEFAULT '접수됨',
 replies jsonb NOT NULL DEFAULT '[]', request_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS iroun_inbox (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 benefit_id text NOT NULL REFERENCES iroun_benefits(id), version_hash text NOT NULL,
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,benefit_id,version_hash)
);
CREATE INDEX IF NOT EXISTS iroun_requests_assignee_idx ON iroun_service_requests(assigned_to);
COMMIT;
