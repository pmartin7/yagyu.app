import { Migration } from '@mikro-orm/migrations';

// Row-level security: per-user isolation enforced at the Postgres level.
// Policies bind the app_user runtime role (created in the next migration);
// neondb_owner has BYPASSRLS, so migrations/backfills are unaffected. FORCE
// is kept as future-proofing should the owner ever lose BYPASSRLS. Identity
// arrives as the transaction-local setting 'app.firebase_uid' (set by
// RlsContextInterceptor); when the setting is absent,
// current_setting(..., true) yields NULL/'' and the policies match nothing
// (fail-closed).
export class Migration20260725211800 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "user" enable row level security;`);
    this.addSql(`alter table "user" force row level security;`);
    this.addSql(
      `create policy user_isolation on "user" for all
        using (firebase_uid = current_setting('app.firebase_uid', true))
        with check (firebase_uid = current_setting('app.firebase_uid', true));`,
    );

    this.addSql(`alter table "email_account" enable row level security;`);
    this.addSql(`alter table "email_account" force row level security;`);
    // The subquery runs under the "user" policy, so it can only ever resolve
    // the caller's own row — correct by construction.
    this.addSql(
      `create policy email_account_isolation on "email_account" for all
        using (user_id = (select id from "user" where firebase_uid = current_setting('app.firebase_uid', true)))
        with check (user_id = (select id from "user" where firebase_uid = current_setting('app.firebase_uid', true)));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop policy email_account_isolation on "email_account";`);
    this.addSql(`alter table "email_account" no force row level security;`);
    this.addSql(`alter table "email_account" disable row level security;`);

    this.addSql(`drop policy user_isolation on "user";`);
    this.addSql(`alter table "user" no force row level security;`);
    this.addSql(`alter table "user" disable row level security;`);
  }
}
