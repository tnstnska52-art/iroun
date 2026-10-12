-- 기본 구조(lib/db/src/schema/iroun.ts에서 drizzle-kit generate로 만든 것). 새 DB에서 한 번만 실행된다.
CREATE TABLE "iroun_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"profile" jsonb DEFAULT '{"personal":{},"businesses":[],"step":0}'::jsonb NOT NULL,
	"preferences" jsonb DEFAULT '{"largeText":false,"notifications":false,"privacyConsent":false,"personalizedAlerts":false}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "iroun_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_benefits" (
	"id" text PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iroun_benefits_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "iroun_billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_billing_sync" (
	"user_id" text PRIMARY KEY NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_billing_transactions" (
	"provider_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_company_settings" (
	"id" text PRIMARY KEY DEFAULT 'company' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"kakao" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_consents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"content" text NOT NULL,
	"accepted" boolean NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"evidence" text NOT NULL,
	"actor" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_deletions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT '요청됨' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "iroun_feed_snapshots" (
	"source_id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_grants" (
	"user_id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"reason" text NOT NULL,
	"granted_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"benefit_id" text NOT NULL,
	"version_hash" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iroun_inbox_user_id_benefit_id_version_hash_key" UNIQUE("user_id","benefit_id","version_hash")
);
--> statement-breakpoint
CREATE TABLE "iroun_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"state" text DEFAULT '접수됨' NOT NULL,
	"replies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iroun_inquiries_user_id_request_key_key" UNIQUE("user_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "iroun_owner_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "iroun_push_devices" (
	"user_id" text NOT NULL,
	"token_hash" text PRIMARY KEY NOT NULL,
	"encrypted_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_push_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"benefit_id" text NOT NULL,
	"deadline" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ticket_ids" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iroun_push_jobs_user_id_benefit_id_deadline_key" UNIQUE("user_id","benefit_id","deadline")
);
--> statement-breakpoint
CREATE TABLE "iroun_service_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"benefit_id" text,
	"business_id" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT '회사 접수' NOT NULL,
	"assigned_to" text,
	"snapshot" jsonb NOT NULL,
	"customer_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"staff_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iroun_service_requests_user_id_benefit_id_business_id_kind_key" UNIQUE("user_id","benefit_id","business_id","kind")
);
--> statement-breakpoint
CREATE TABLE "iroun_staff" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"kakao" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	CONSTRAINT "iroun_subscriptions_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "iroun_tracking" (
	"user_id" text NOT NULL,
	"benefit_id" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "iroun_tracking_user_id_benefit_id_pk" PRIMARY KEY("user_id","benefit_id")
);
--> statement-breakpoint
CREATE TABLE "iroun_trial_ledger" (
	"identity_hash" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iroun_trials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iroun_billing_sync" ADD CONSTRAINT "iroun_billing_sync_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_billing_transactions" ADD CONSTRAINT "iroun_billing_transactions_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_consents" ADD CONSTRAINT "iroun_consents_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_contracts" ADD CONSTRAINT "iroun_contracts_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_grants" ADD CONSTRAINT "iroun_grants_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_inbox" ADD CONSTRAINT "iroun_inbox_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_inbox" ADD CONSTRAINT "iroun_inbox_benefit_id_iroun_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."iroun_benefits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_inquiries" ADD CONSTRAINT "iroun_inquiries_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_owner_codes" ADD CONSTRAINT "iroun_owner_codes_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_push_devices" ADD CONSTRAINT "iroun_push_devices_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_push_jobs" ADD CONSTRAINT "iroun_push_jobs_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_push_jobs" ADD CONSTRAINT "iroun_push_jobs_benefit_id_iroun_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."iroun_benefits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_service_requests" ADD CONSTRAINT "iroun_service_requests_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_service_requests" ADD CONSTRAINT "iroun_service_requests_benefit_id_iroun_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."iroun_benefits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_service_requests" ADD CONSTRAINT "iroun_service_requests_assigned_to_iroun_accounts_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."iroun_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_staff" ADD CONSTRAINT "iroun_staff_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_subscriptions" ADD CONSTRAINT "iroun_subscriptions_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_tracking" ADD CONSTRAINT "iroun_tracking_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_tracking" ADD CONSTRAINT "iroun_tracking_benefit_id_iroun_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."iroun_benefits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iroun_trials" ADD CONSTRAINT "iroun_trials_user_id_iroun_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."iroun_accounts"("id") ON DELETE cascade ON UPDATE no action;