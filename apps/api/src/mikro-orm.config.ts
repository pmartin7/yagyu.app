import './config/load-env.js';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { User } from './users/entities/user.entity.js';
import { EmailAccount } from './email-accounts/entities/email-account.entity.js';
import { EmailMessage } from './email-sync/entities/email-message.entity.js';
import { SyncJob } from './email-sync/entities/sync-job.entity.js';
import { AutomationRun } from './triage/entities/automation-run.entity.js';
import { Category } from './tasks/entities/category.entity.js';
import { Task } from './tasks/entities/task.entity.js';
import { TaskEmail } from './tasks/entities/task-email.entity.js';
import { TaskNextStep } from './tasks/entities/task-next-step.entity.js';
import { TaskNote } from './tasks/entities/task-note.entity.js';

export function buildOrmConfig(
  clientUrl: string | undefined,
  poolMax?: number,
): ReturnType<typeof defineConfig> {
  return defineConfig({
    clientUrl,
    // MikroORM drops query params from clientUrl, so sslmode=require must be
    // passed to the pg driver explicitly or Neon rejects the connection.
    driverOptions: {
      ...(clientUrl?.includes('sslmode=require') ? { connection: { ssl: true } } : {}),
      // Knex/Tarn defaults min to 2; setting only max:1 throws
      // "opt.max is smaller than opt.min" before any query. Serverless
      // worker connections use pool-max-1 with min:0 so no idle client is held.
      ...(poolMax ? { pool: { min: 0, max: poolMax } } : {}),
    },
    // Entities are registered statically (no filesystem glob discovery):
    // Vercel's bundler only includes files reachable through imports, so a
    // glob would find nothing inside the deployed function.
    entities: [
      User,
      EmailAccount,
      EmailMessage,
      SyncJob,
      AutomationRun,
      Category,
      Task,
      TaskNextStep,
      TaskNote,
      TaskEmail,
    ],
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
