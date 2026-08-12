import { Module } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import type { EntityManager } from '@mikro-orm/postgresql';
import { decryptToken } from '../email-accounts/token-cipher.js';
import { EmailAccount } from '../email-accounts/entities/email-account.entity.js';
import { buildOrmConfig } from '../mikro-orm.config.js';
import { EmailSyncController } from './email-sync.controller.js';
import {
  EmailSyncService,
  GMAIL_CLIENT_FACTORY,
  WORKER_ENTITY_MANAGER,
  type GmailClientFactory,
  type WorkerEntityManagerProvider,
} from './email-sync.service.js';
import { EmailMessage } from './entities/email-message.entity.js';
import { SyncJob } from './entities/sync-job.entity.js';
import { GmailClient } from './gmail-client.js';
import { CronSecretGuard } from './guards/cron-secret.guard.js';
import { PubsubOidcGuard } from './guards/pubsub-oidc.guard.js';

let workerOrmPromise: Promise<MikroORM> | undefined;

const workerEntityManagerProvider: WorkerEntityManagerProvider = {
  async getWorkerEm(): Promise<EntityManager> {
    // contextName must not be 'default' — Nest's RequestContext binds the
    // app EM under that name, and orm.em.fork() would then inherit the
    // app_user driver (RLS, zero rows) instead of worker_user.
    workerOrmPromise ??= MikroORM.init({
      ...buildOrmConfig(process.env['NEON_WORKER_DATABASE_URL'], 1),
      contextName: 'worker',
    });
    const orm = await workerOrmPromise;
    return orm.em.fork({ disableContextResolution: true }) as EntityManager;
  },
};

function createGmailClientFactory(): GmailClientFactory {
  return (encryptedRefreshToken: string): GmailClient => {
    const key = process.env['TOKEN_ENCRYPTION_KEY'];
    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
    if (!key || !clientId || !clientSecret) {
      throw new Error('Gmail sync credentials are not configured');
    }
    return new GmailClient(decryptToken(encryptedRefreshToken, key), clientId, clientSecret);
  };
}

@Module({
  imports: [MikroOrmModule.forFeature([EmailAccount, EmailMessage, SyncJob])],
  controllers: [EmailSyncController],
  providers: [
    EmailSyncService,
    CronSecretGuard,
    PubsubOidcGuard,
    { provide: WORKER_ENTITY_MANAGER, useValue: workerEntityManagerProvider },
    { provide: GMAIL_CLIENT_FACTORY, useFactory: createGmailClientFactory },
  ],
  exports: [EmailSyncService, WORKER_ENTITY_MANAGER],
})
export class EmailSyncModule {}
