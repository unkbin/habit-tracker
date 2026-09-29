-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FrequencyType" AS ENUM ('DAILY', 'WEEKDAYS', 'TIMES_PER_WEEK');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "week_start_day" INTEGER NOT NULL DEFAULT 1,
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "frequency" "FrequencyType" NOT NULL,
    "target_weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "times_per_week" INTEGER,
    "target_value" INTEGER,
    "unit" TEXT,
    "start_date" DATE NOT NULL,
    "reminder_time" TEXT,
    "last_reminded_on" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_pauses" (
    "id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completions" (
    "id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "value" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "habits_user_id_sort_order_idx" ON "habits"("user_id", "sort_order");

-- CreateIndex
CREATE INDEX "habit_pauses_habit_id_start_date_idx" ON "habit_pauses"("habit_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "completions_habit_id_date_key" ON "completions"("habit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_pauses" ADD CONSTRAINT "habit_pauses_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completions" ADD CONSTRAINT "completions_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written check constraints (Prisma can't express these in the schema).
-- ---------------------------------------------------------------------------

-- Emails are stored lowercased so the unique index is effectively case-insensitive.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_week_start_day_range" CHECK ("week_start_day" BETWEEN 0 AND 6);

-- Weekdays are 0 (Sunday) to 6 (Saturday).
ALTER TABLE "habits" ADD CONSTRAINT "habits_target_weekdays_range"
  CHECK ("target_weekdays" <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "habits" ADD CONSTRAINT "habits_times_per_week_range"
  CHECK ("times_per_week" IS NULL OR "times_per_week" BETWEEN 1 AND 7);
-- Each frequency type must carry exactly the settings it uses.
ALTER TABLE "habits" ADD CONSTRAINT "habits_frequency_settings" CHECK (
  ("frequency" = 'DAILY'          AND cardinality("target_weekdays") = 0 AND "times_per_week" IS NULL) OR
  ("frequency" = 'WEEKDAYS'       AND cardinality("target_weekdays") > 0 AND "times_per_week" IS NULL) OR
  ("frequency" = 'TIMES_PER_WEEK' AND cardinality("target_weekdays") = 0 AND "times_per_week" IS NOT NULL)
);
ALTER TABLE "habits" ADD CONSTRAINT "habits_target_value_positive"
  CHECK ("target_value" IS NULL OR "target_value" > 0);
ALTER TABLE "habits" ADD CONSTRAINT "habits_unit_requires_target"
  CHECK ("unit" IS NULL OR "target_value" IS NOT NULL);
-- Local wall-clock time, 24h "HH:MM".
ALTER TABLE "habits" ADD CONSTRAINT "habits_reminder_time_format"
  CHECK ("reminder_time" IS NULL OR "reminder_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "habit_pauses" ADD CONSTRAINT "habit_pauses_dates_ordered"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
-- At most one open pause (i.e. one "archived" state) per habit.
CREATE UNIQUE INDEX "habit_pauses_one_open_per_habit" ON "habit_pauses" ("habit_id") WHERE "end_date" IS NULL;

ALTER TABLE "completions" ADD CONSTRAINT "completions_value_non_negative"
  CHECK ("value" IS NULL OR "value" >= 0);
