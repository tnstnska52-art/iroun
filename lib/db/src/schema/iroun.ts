import { pgTable, text, jsonb, timestamp, bigserial, primaryKey, unique, boolean } from "drizzle-orm/pg-core";

export const irounAccounts = pgTable("iroun_accounts",{
  id:text("id").primaryKey(), role:text("role").notNull().default("customer"),
  profile:jsonb("profile").notNull().default({personal:{},businesses:[],step:0}),
  preferences:jsonb("preferences").notNull().default({largeText:false,notifications:false,privacyConsent:false,personalizedAlerts:false}),
  deletedAt:timestamp("deleted_at",{withTimezone:true}),
});
export const irounBenefits = pgTable("iroun_benefits",{
  id:text("id").primaryKey(),sourceKey:text("source_key").unique().notNull(),data:jsonb("data").notNull(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounTracking = pgTable("iroun_tracking",{
  userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
  benefitId:text("benefit_id").notNull().references(()=>irounBenefits.id),data:jsonb("data").notNull(),
},t=>[primaryKey({columns:[t.userId,t.benefitId]})]);
export const irounGrants = pgTable("iroun_grants",{
  userId:text("user_id").primaryKey().references(()=>irounAccounts.id,{onDelete:"cascade"}),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),revokedAt:timestamp("revoked_at",{withTimezone:true}),
  reason:text("reason").notNull(),grantedBy:text("granted_by").notNull(),
});
export const irounSubscriptions = pgTable("iroun_subscriptions",{
  userId:text("user_id").primaryKey().references(()=>irounAccounts.id,{onDelete:"cascade"}),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),state:text("state").notNull(),
  provider:text("provider").notNull(),providerId:text("provider_id").unique().notNull(),
});
export const irounAudit = pgTable("iroun_audit",{
  id:bigserial("id",{mode:"number"}).primaryKey(),actor:text("actor").notNull(),action:text("action").notNull(),
  subject:text("subject").notNull(),data:jsonb("data").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounDeletions = pgTable("iroun_deletions",{
  id:text("id").primaryKey(),userId:text("user_id").notNull(),status:text("status").notNull().default("요청됨"),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),completedAt:timestamp("completed_at",{withTimezone:true}),
});
export const irounBillingSync=pgTable("iroun_billing_sync",{
  userId:text("user_id").primaryKey().references(()=>irounAccounts.id,{onDelete:"cascade"}),
  snapshotAt:timestamp("snapshot_at",{withTimezone:true}).notNull(),
});
export const irounBillingTransactions=pgTable("iroun_billing_transactions",{
  providerId:text("provider_id").primaryKey(),
  userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
});
export const irounBillingEvents=pgTable("iroun_billing_events",{
  id:text("id").primaryKey(),status:text("status").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounPushDevices=pgTable("iroun_push_devices",{
  userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
  tokenHash:text("token_hash").primaryKey(),encryptedToken:text("encrypted_token").notNull(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounPushJobs=pgTable("iroun_push_jobs",{
  id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
  benefitId:text("benefit_id").notNull().references(()=>irounBenefits.id,{onDelete:"cascade"}),
  deadline:text("deadline").notNull(),status:text("status").notNull().default("pending"),ticketIds:jsonb("ticket_ids"),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique("iroun_push_jobs_user_id_benefit_id_deadline_key").on(t.userId,t.benefitId,t.deadline)]);
export const irounFeedSnapshots=pgTable("iroun_feed_snapshots",{
  sourceId:text("source_id").primaryKey(),contentHash:text("content_hash").notNull(),
  checkedAt:timestamp("checked_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounTrials=pgTable("iroun_trials",{
 userId:text("user_id").primaryKey().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 startedAt:timestamp("started_at",{withTimezone:true}).notNull().defaultNow(),endsAt:timestamp("ends_at",{withTimezone:true}).notNull(),
});
export const irounTrialLedger=pgTable("iroun_trial_ledger",{
 identityHash:text("identity_hash").primaryKey(),startedAt:timestamp("started_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounContracts=pgTable("iroun_contracts",{
 id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 startsAt:timestamp("starts_at",{withTimezone:true}).notNull(),endsAt:timestamp("ends_at",{withTimezone:true}).notNull(),
 reason:text("reason").notNull(),evidence:text("evidence").notNull(),actor:text("actor").notNull(),
 revokedAt:timestamp("revoked_at",{withTimezone:true}),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounOwnerCodes=pgTable("iroun_owner_codes",{
 codeHash:text("code_hash").primaryKey(),userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),usedAt:timestamp("used_at",{withTimezone:true}),
});
export const irounConsents=pgTable("iroun_consents",{
 id:bigserial("id",{mode:"number"}).primaryKey(),userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 kind:text("kind").notNull(),version:text("version").notNull(),content:text("content").notNull(),accepted:boolean("accepted").notNull(),
 recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
});
export const irounStaff=pgTable("iroun_staff",{
 userId:text("user_id").primaryKey().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 name:text("name").notNull(),phone:text("phone").notNull().default(""),kakao:text("kakao").notNull().default(""),enabled:boolean("enabled").notNull().default(true),
});
export const irounCompanySettings=pgTable("iroun_company_settings",{
 id:text("id").primaryKey().default("company"),phone:text("phone").notNull().default(""),kakao:text("kakao").notNull().default(""),website:text("website").notNull().default(""),
});
export const irounServiceRequests=pgTable("iroun_service_requests",{
 id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 benefitId:text("benefit_id").references(()=>irounBenefits.id),businessId:text("business_id").notNull().default(""),kind:text("kind").notNull(),state:text("state").notNull().default("회사 접수"),
 assignedTo:text("assigned_to").references(()=>irounAccounts.id),snapshot:jsonb("snapshot").notNull(),
 customerTasks:jsonb("customer_tasks").notNull().default([]),staffTasks:jsonb("staff_tasks").notNull().default([]),completedTasks:jsonb("completed_tasks").notNull().default([]),
 internalNote:text("internal_note").notNull().default(""),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique("iroun_service_requests_user_id_benefit_id_business_id_kind_key").on(t.userId,t.benefitId,t.businessId,t.kind)]);
export const irounInquiries=pgTable("iroun_inquiries",{
 id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 title:text("title").notNull(),body:text("body").notNull(),state:text("state").notNull().default("접수됨"),replies:jsonb("replies").notNull().default([]),
 requestKey:text("request_key").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique("iroun_inquiries_user_id_request_key_key").on(t.userId,t.requestKey)]);
export const irounInbox=pgTable("iroun_inbox",{
 id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>irounAccounts.id,{onDelete:"cascade"}),
 benefitId:text("benefit_id").notNull().references(()=>irounBenefits.id),versionHash:text("version_hash").notNull(),readAt:timestamp("read_at",{withTimezone:true}),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique("iroun_inbox_user_id_benefit_id_version_hash_key").on(t.userId,t.benefitId,t.versionHash)]);
