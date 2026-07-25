import { Migration } from '@mikro-orm/migrations';

export class Migration20260725042206 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "user" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "firebase_uid" varchar(255) not null, "email" varchar(255) not null, "display_name" varchar(255) null, constraint "user_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "user" add constraint "user_firebase_uid_unique" unique ("firebase_uid");`,
    );
    this.addSql(`alter table "user" add constraint "user_email_unique" unique ("email");`);

    this.addSql(
      `create table "email_account" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "provider" text check ("provider" in ('gmail')) not null default 'gmail', "email_address" varchar(255) not null, "encrypted_refresh_token" text not null, "user_id" uuid not null, constraint "email_account_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "email_account" add constraint "email_account_user_id_email_address_unique" unique ("user_id", "email_address");`,
    );

    this.addSql(
      `alter table "email_account" add constraint "email_account_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "email_account" drop constraint "email_account_user_id_foreign";`);

    this.addSql(`drop table if exists "user" cascade;`);

    this.addSql(`drop table if exists "email_account" cascade;`);
  }
}
