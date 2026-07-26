import './config/load-env.js';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

export function buildOrmConfig(clientUrl: string | undefined): ReturnType<typeof defineConfig> {
  return defineConfig({
    clientUrl,
    // MikroORM drops query params from clientUrl, so sslmode=require must be
    // passed to the pg driver explicitly or Neon rejects the connection.
    driverOptions: clientUrl?.includes('sslmode=require')
      ? { connection: { ssl: true } }
      : undefined,
    entities: ['./dist/**/*.entity.js'],
    entitiesTs: ['./src/**/*.entity.ts'],
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
