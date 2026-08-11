import { Migration } from '@mikro-orm/migrations';

export class Migration20260809211700 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "email_account"
       add column "sync_cursor" varchar(255) null,
       add column "last_synced_at" timestamptz null,
       add column "initial_sync_completed_at" timestamptz null,
       add column "watch_expires_at" timestamptz null,
       add column "sync_status" text check ("sync_status" in ('idle', 'syncing', 'error', 'reauth_required')) not null default 'idle';`,
    );

    this.addSql(
      `create table "email_message" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "user_id" uuid not null,
        "email_account_id" uuid not null,
        "provider_message_id" varchar(255) not null,
        "thread_id" varchar(255) not null,
        "sender" varchar(255) not null,
        "subject" varchar(255) not null,
        "snippet" text not null,
        "body_text" text not null,
        "received_at" timestamptz not null,
        "analysis_status" text check ("analysis_status" in ('pending', 'skipped', 'analyzed', 'error')) not null default 'pending',
        constraint "email_message_pkey" primary key ("id"),
        constraint "email_message_email_account_id_provider_message_id_unique" unique ("email_account_id", "provider_message_id"),
        constraint "email_message_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade,
        constraint "email_message_email_account_id_foreign" foreign key ("email_account_id") references "email_account" ("id") on update cascade on delete cascade
      );`,
    );

    this.addSql(
      `create table "sync_job" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "email_account_id" uuid not null,
        "kind" text check ("kind" in ('backfill', 'incremental', 'analyze', 'reanalyze')) not null,
        "status" text check ("status" in ('pending', 'running', 'completed', 'dead')) not null default 'pending',
        "dedupe_key" varchar(255) not null,
        "attempts" int not null default 0,
        "run_after" timestamptz not null,
        "leased_until" timestamptz null,
        "checkpoint" jsonb not null default '{}'::jsonb,
        "last_error" text null,
        constraint "sync_job_pkey" primary key ("id"),
        constraint "sync_job_email_account_id_kind_dedupe_key_unique" unique ("email_account_id", "kind", "dedupe_key"),
        constraint "sync_job_email_account_id_foreign" foreign key ("email_account_id") references "email_account" ("id") on update cascade on delete cascade
      );`,
    );
    this.addSql(
      `create index "sync_job_status_run_after_index" on "sync_job" ("status", "run_after");`,
    );

    this.addSql(
      `create table "category" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "user_id" uuid not null,
        "name" varchar(255) not null,
        "summary" text not null,
        "managed_by" text check ("managed_by" in ('ai', 'user')) not null default 'ai',
        "ranking_mode" text check ("ranking_mode" in ('ai', 'manual')) not null default 'ai',
        "sort_order" int not null default 0,
        constraint "category_pkey" primary key ("id"),
        constraint "category_user_id_name_unique" unique ("user_id", "name"),
        constraint "category_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade
      );`,
    );

    this.addSql(
      `create table "task" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "user_id" uuid not null,
        "category_id" uuid not null,
        "title" varchar(255) not null,
        "status" text check ("status" in ('open', 'done')) not null default 'open',
        "due_date" date null,
        "priority" text check ("priority" in ('low', 'medium', 'high', 'urgent')) not null default 'medium',
        "stack_rank" double precision not null default 0,
        "managed_by" text check ("managed_by" in ('ai', 'user')) not null default 'ai',
        "ai_context" text null,
        "ai_recommended_action" text null,
        constraint "task_pkey" primary key ("id"),
        constraint "task_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade,
        constraint "task_category_id_foreign" foreign key ("category_id") references "category" ("id") on update cascade on delete cascade
      );`,
    );
    this.addSql(
      `create index "task_user_id_status_category_id_stack_rank_index" on "task" ("user_id", "status", "category_id", "stack_rank");`,
    );

    this.addSql(
      `create table "task_next_step" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "task_id" uuid not null,
        "title" varchar(255) not null,
        "completed_at" timestamptz null,
        "sort_order" int not null default 0,
        constraint "task_next_step_pkey" primary key ("id"),
        constraint "task_next_step_task_id_foreign" foreign key ("task_id") references "task" ("id") on update cascade on delete cascade
      );`,
    );

    this.addSql(
      `create table "task_note" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "task_id" uuid not null,
        "user_id" uuid not null,
        "body" text not null,
        constraint "task_note_pkey" primary key ("id"),
        constraint "task_note_task_id_foreign" foreign key ("task_id") references "task" ("id") on update cascade on delete cascade,
        constraint "task_note_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade
      );`,
    );

    this.addSql(
      `create table "task_email" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "task_id" uuid not null,
        "email_id" uuid not null,
        "linked_by" text check ("linked_by" in ('ai', 'user')) not null default 'ai',
        constraint "task_email_pkey" primary key ("id"),
        constraint "task_email_task_id_email_id_unique" unique ("task_id", "email_id"),
        constraint "task_email_task_id_foreign" foreign key ("task_id") references "task" ("id") on update cascade on delete cascade,
        constraint "task_email_email_id_foreign" foreign key ("email_id") references "email_message" ("id") on update cascade on delete cascade
      );`,
    );

    this.addSql(
      `create table "automation_run" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "user_id" uuid not null,
        "stage" text check ("stage" in ('screen', 'route', 'write')) not null,
        "email_id" uuid null,
        "task_id" uuid null,
        "prompt_version" varchar(255) not null,
        "model" varchar(255) not null,
        "applied_changes" jsonb not null,
        "generation_config" jsonb not null default '{}'::jsonb,
        "tokens_in" int not null default 0,
        "tokens_out" int not null default 0,
        "latency_ms" int not null default 0,
        constraint "automation_run_pkey" primary key ("id"),
        constraint "automation_run_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade,
        constraint "automation_run_email_id_foreign" foreign key ("email_id") references "email_message" ("id") on update cascade on delete set null,
        constraint "automation_run_task_id_foreign" foreign key ("task_id") references "task" ("id") on update cascade on delete set null
      );`,
    );

    this.addSql(
      `do $$
       begin
         if not exists (select from pg_roles where rolname = 'worker_user') then
           create role worker_user nologin nobypassrls;
         end if;
       end
       $$;`,
    );
    this.addSql(`grant usage on schema public to worker_user;`);
    this.addSql(`grant select on "user" to worker_user;`);
    this.addSql(`grant select, update on "email_account" to worker_user;`);
    this.addSql(
      `grant select, insert, update, delete on "email_message", "sync_job", "category", "task", "task_next_step", "task_email" to worker_user;`,
    );
    this.addSql(`grant select, insert on "automation_run", "task_note" to worker_user;`);
    this.addSql(`revoke update, delete on "automation_run", "task_note" from app_user;`);

    for (const table of [
      'email_message',
      'sync_job',
      'automation_run',
      'category',
      'task',
      'task_next_step',
      'task_note',
      'task_email',
    ]) {
      this.addSql(`alter table "${table}" enable row level security;`);
      this.addSql(`alter table "${table}" force row level security;`);
    }

    const currentUserId = `(select id from "user" where firebase_uid = current_setting('app.firebase_uid', true))`;
    for (const table of ['email_message', 'automation_run', 'category', 'task']) {
      this.addSql(
        `create policy ${table}_isolation on "${table}" for all
         using (user_id = ${currentUserId})
         with check (user_id = ${currentUserId});`,
      );
    }
    this.addSql(
      `create policy task_note_select_isolation on "task_note" for select
       using (user_id = ${currentUserId}
         and task_id in (select id from "task" where user_id = ${currentUserId}));`,
    );
    this.addSql(
      `create policy task_note_insert_isolation on "task_note" for insert
       with check (user_id = ${currentUserId}
         and task_id in (select id from "task" where user_id = ${currentUserId}));`,
    );
    this.addSql(
      `create policy sync_job_isolation on "sync_job" for all
       using (email_account_id in (select id from "email_account" where user_id = ${currentUserId}))
       with check (email_account_id in (select id from "email_account" where user_id = ${currentUserId}));`,
    );
    this.addSql(
      `create policy task_next_step_isolation on "task_next_step" for all
       using (task_id in (select id from "task" where user_id = ${currentUserId}))
       with check (task_id in (select id from "task" where user_id = ${currentUserId}));`,
    );
    this.addSql(
      `create policy task_email_isolation on "task_email" for all
       using (task_id in (select id from "task" where user_id = ${currentUserId})
         and email_id in (select id from "email_message" where user_id = ${currentUserId}))
       with check (task_id in (select id from "task" where user_id = ${currentUserId})
         and email_id in (select id from "email_message" where user_id = ${currentUserId}));`,
    );

    for (const table of [
      'user',
      'email_account',
      'email_message',
      'sync_job',
      'automation_run',
      'category',
      'task',
      'task_next_step',
      'task_note',
      'task_email',
    ]) {
      this.addSql(
        `create policy ${table}_worker_access on "${table}" for all to worker_user
         using (true) with check (true);`,
      );
    }
  }

  override async down(): Promise<void> {
    for (const table of [
      'user',
      'email_account',
      'email_message',
      'sync_job',
      'automation_run',
      'category',
      'task',
      'task_next_step',
      'task_note',
      'task_email',
    ]) {
      this.addSql(`drop policy if exists ${table}_worker_access on "${table}";`);
    }
    for (const table of [
      'email_message',
      'sync_job',
      'automation_run',
      'category',
      'task',
      'task_next_step',
      'task_email',
    ]) {
      this.addSql(`drop policy if exists ${table}_isolation on "${table}";`);
      this.addSql(`alter table "${table}" no force row level security;`);
      this.addSql(`alter table "${table}" disable row level security;`);
    }
    this.addSql(`drop policy if exists task_note_select_isolation on "task_note";`);
    this.addSql(`drop policy if exists task_note_insert_isolation on "task_note";`);
    this.addSql(`alter table "task_note" no force row level security;`);
    this.addSql(`alter table "task_note" disable row level security;`);

    this.addSql(
      `revoke select, insert, update, delete on "email_message", "sync_job", "automation_run", "category", "task", "task_next_step", "task_note", "task_email" from worker_user;`,
    );
    this.addSql(`revoke select, update on "email_account" from worker_user;`);
    this.addSql(`revoke select on "user" from worker_user;`);
    this.addSql(`revoke usage on schema public from worker_user;`);
    this.addSql(`drop role if exists worker_user;`);

    this.addSql(`drop table if exists "automation_run" cascade;`);
    this.addSql(`drop table if exists "task_email" cascade;`);
    this.addSql(`drop table if exists "task_note" cascade;`);
    this.addSql(`drop table if exists "task_next_step" cascade;`);
    this.addSql(`drop table if exists "task" cascade;`);
    this.addSql(`drop table if exists "category" cascade;`);
    this.addSql(`drop table if exists "sync_job" cascade;`);
    this.addSql(`drop table if exists "email_message" cascade;`);
    this.addSql(
      `alter table "email_account"
       drop column "sync_cursor",
       drop column "last_synced_at",
       drop column "initial_sync_completed_at",
       drop column "watch_expires_at",
       drop column "sync_status";`,
    );
  }
}
