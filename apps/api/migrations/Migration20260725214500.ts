import { Migration } from '@mikro-orm/migrations';

// Dedicated RLS-bound runtime role. neondb_owner has BYPASSRLS (set by Neon,
// not removable without superuser), so the API must connect as a non-owner
// role for the policies to apply. The role is created without LOGIN or a
// password; per environment, ops enables it once with
//   alter role app_user with login password '<generated>';
// and sets NEON_APP_DATABASE_URL accordingly (see ARCHITECTURE.md).
export class Migration20260725214500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `do $$
       begin
         if not exists (select from pg_roles where rolname = 'app_user') then
           create role app_user nologin nobypassrls;
         end if;
       end
       $$;`,
    );
    this.addSql(`grant usage on schema public to app_user;`);
    this.addSql(`grant select, insert, update, delete on all tables in schema public to app_user;`);
    // Future tables created by neondb_owner (all migrations) are covered
    // automatically; new user-owned tables still need ENABLE RLS + a policy.
    this.addSql(
      `alter default privileges in schema public grant select, insert, update, delete on tables to app_user;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter default privileges in schema public revoke select, insert, update, delete on tables from app_user;`,
    );
    this.addSql(
      `revoke select, insert, update, delete on all tables in schema public from app_user;`,
    );
    this.addSql(`revoke usage on schema public from app_user;`);
    this.addSql(`drop role if exists app_user;`);
  }
}
