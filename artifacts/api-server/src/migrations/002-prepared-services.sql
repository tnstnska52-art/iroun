CREATE TABLE IF NOT EXISTS iroun_billing_sync (
 user_id text PRIMARY KEY REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 snapshot_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS iroun_billing_transactions (
 provider_id text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS iroun_billing_events (
 id text PRIMARY KEY, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iroun_push_devices (
 user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 token_hash text PRIMARY KEY, encrypted_token text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iroun_push_jobs (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 benefit_id text NOT NULL REFERENCES iroun_benefits(id) ON DELETE CASCADE,
 deadline text NOT NULL, status text NOT NULL DEFAULT 'pending', ticket_ids jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,benefit_id,deadline)
);
CREATE TABLE IF NOT EXISTS iroun_feed_snapshots (
 source_id text PRIMARY KEY, content_hash text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now()
);
