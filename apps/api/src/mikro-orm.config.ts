import './config/load-env.js';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { User } from './users/entities/user.entity.js';
import { EmailAccount } from './email-accounts/entities/email-account.entity.js';

export function buildOrmConfig(clientUrl: string | undefined): ReturnType<typeof defineConfig> {
  return defineConfig({
    clientUrl,
    // MikroORM drops query params from clientUrl, so sslmode=require must be
    // passed to the pg driver explicitly or Neon rejects the connection.
    driverOptions: clientUrl?.includes('sslmode=require')
      ? { connection: { ssl: true } }
      : undefined,
    // Entities are registered statically (no filesystem glob discovery):
    // Vercel's bundler only includes files reachable through imports, so a
    // glob would find nothing inside the deployed function.
    entities: [User, EmailAccount],
    extensions: [Migrator],
    migrations: {
      path: './migrations',
      pathTs: './migrations',
    },
    debug: process.env['NODE_ENV'] !== 'production',
  });
}

// Runtime connects as the RLS-bound app_user role (no BYPASSRLS); migrations
// use src/mikro-orm.migrations.config.ts with the owner credential instead.
export default buildOrmConfig(process.env['NEON_APP_DATABASE_URL']);
