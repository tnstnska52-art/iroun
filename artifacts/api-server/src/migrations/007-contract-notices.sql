-- 계약서 제6조: 맞춤 사업 안내, 알림 발송·열람, 고객이 누른 버튼을 날짜·시간과 함께 기록하고 고객에게 보여준다.
-- 고객 본인과 회사 관리자·담당 직원만 본다. 계정을 지우면 함께 지워진다.
CREATE TABLE IF NOT EXISTS iroun_activity (
 id bigserial PRIMARY KEY,
 user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 kind text NOT NULL,
 benefit_id text,
 business_id text NOT NULL DEFAULT '',
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iroun_activity_user_idx ON iroun_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS iroun_activity_benefit_idx ON iroun_activity(user_id, benefit_id, kind);

-- 고객이 고른 버튼([신청할게요] / [조건 불일치]). 사업장마다 마지막 선택 하나. 이전 선택은 iroun_activity 에 남는다.
CREATE TABLE IF NOT EXISTS iroun_choices (
 user_id text NOT NULL REFERENCES iroun_accounts(id) ON DELETE CASCADE,
 benefit_id text NOT NULL,
 business_id text NOT NULL DEFAULT '',
 choice text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, benefit_id, business_id)
);

-- 알림함 종류: '새 사업'(처음 안내), '마감 7일 전', '마감 재알림'. 예전 알림은 '새 혜택'.
ALTER TABLE iroun_inbox ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT '새 혜택';
ALTER TABLE iroun_inbox ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
