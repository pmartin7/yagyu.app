import { createHash } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ModuleRef } from '@nestjs/core';
import { EmailAccount } from '../email-accounts/entities/email-account.entity.js';
import { GmailClient, GmailHistoryExpiredError, type GmailMessage } from './gmail-client.js';
import { EmailMessage } from './entities/email-message.entity.js';
import { SyncJob, type SyncJobCheckpoint, type SyncJobKind } from './entities/sync-job.entity.js';

const BACKFILL_DAYS = 60;
const MAX_JOBS_PER_DRAIN = 1;
const MAX_JOB_ATTEMPTS = 5;
const JOB_LEASE_SECONDS = 90;

export const WORKER_ENTITY_MANAGER = Symbol('WORKER_ENTITY_MANAGER');
export const GMAIL_CLIENT_FACTORY = Symbol('GMAIL_CLIENT_FACTORY');

export interface WorkerEntityManagerProvider {
  getWorkerEm(): Promise<EntityManager>;
}

export type GmailClientFactory = (encryptedRefreshToken: string) => GmailClient;

export interface DrainOptions {
  selfChainUrl?: string;
}

interface TriageJobProcessor {
  processJob(job: SyncJob): Promise<void>;
}

@Injectable()
export class EmailSyncService {
  private readonly logger = new Logger(EmailSyncService.name);

  constructor(
    @Inject(WORKER_ENTITY_MANAGER)
    private readonly workerProvider: WorkerEntityManagerProvider,
    @Inject(GMAIL_CLIENT_FACTORY)
    private readonly createGmailClient: GmailClientFactory,
    private readonly moduleRef: ModuleRef,
  ) {}

  async enqueue(
    emailAccountId: string,
    kind: SyncJobKind,
    dedupeKey: string,
    checkpoint: SyncJobCheckpoint = {},
  ): Promise<void> {
    const em = await this.workerProvider.getWorkerEm();
    await em.execute(
      `insert into sync_job
        (id, created_at, updated_at, email_account_id, kind, status, dedupe_key, attempts, run_after, checkpoint)
       values (gen_random_uuid(), now(), now(), ?, ?, 'pending', ?, 0, now(), ?::jsonb)
       on conflict (email_account_id, kind, dedupe_key) do nothing`,
      [emailAccountId, kind, dedupeKey, JSON.stringify(checkpoint)],
    );
  }

  async enqueueIncrementalByEmail(emailAddress: string, historyId: string): Promise<boolean> {
    const em = await this.workerProvider.getWorkerEm();
    const account = await em.findOne(EmailAccount, { emailAddress: emailAddress.toLowerCase() });
    if (!account) return false;
    await this.enqueue(account.id, 'incremental', `push:${historyId}`, {
      notificationHistoryId: historyId,
    });
    return true;
  }

  async enqueueScheduledSyncs(): Promise<number> {
    const em = await this.workerProvider.getWorkerEm();
    const accounts = await em.findAll(EmailAccount);
    const pollWindow = Math.floor(Date.now() / 600_000);
    await Promise.all(
      accounts.map((account) =>
        this.enqueue(
          account.id,
          account.initialSyncCompletedAt ? 'incremental' : 'backfill',
          account.initialSyncCompletedAt ? `poll:${pollWindow}` : 'initial',
        ),
      ),
    );
    return accounts.length;
  }

  async renewExpiringWatches(): Promise<void> {
    const topic = process.env['GOOGLE_PUBSUB_TOPIC'];
    if (!topic) {
      this.logger.warn('Gmail Pub/Sub is unset; email sync is polling-only');
      return;
    }

    const em = await this.workerProvider.getWorkerEm();
    const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const accounts = await em.find(EmailAccount, {
      $or: [{ watchExpiresAt: null }, { watchExpiresAt: { $lt: threshold } }],
    });
    for (const account of accounts) {
      try {
        const watch = await this.createGmailClient(account.encryptedRefreshToken).watch(topic);
        account.watchExpiresAt = watch.expiresAt;
        await em.flush();
        if (!account.syncCursor) {
          await this.enqueue(account.id, 'backfill', 'initial');
        } else if (BigInt(watch.historyId) > BigInt(account.syncCursor)) {
          await this.enqueue(account.id, 'incremental', `watch:${watch.historyId}`);
        }
      } catch (error) {
        this.logger.warn(
          {
            accountId: account.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to renew Gmail watch',
        );
      }
    }
  }

  async drainBounded(options: DrainOptions = {}): Promise<number> {
    const em = await this.workerProvider.getWorkerEm();
    const claimedIds = await this.claimJobs(em, MAX_JOBS_PER_DRAIN);
    for (const id of claimedIds) {
      const job = await em.findOne(
        SyncJob,
        { id },
        { populate: ['emailAccount', 'emailAccount.user'] },
      );
      if (!job) continue;
      try {
        if (job.kind === 'analyze' || job.kind === 'reanalyze') {
          await this.moduleRef
            .get<TriageJobProcessor>('TRIAGE_JOB_PROCESSOR', { strict: false })
            .processJob(job);
        } else {
          await this.processSyncJob(job);
        }
      } catch (error) {
        await this.requeueFailedJob(job, error);
      }
    }

    if (options.selfChainUrl && (await this.hasRunnableJobs(em))) {
      await this.selfChain(options.selfChainUrl);
    }
    return claimedIds.length;
  }

  private async claimJobs(em: EntityManager, limit: number): Promise<string[]> {
    const rows = (await em.execute(
      `update sync_job
       set status = 'running',
           attempts = attempts + 1,
           leased_until = now() + interval '${JOB_LEASE_SECONDS} seconds',
           updated_at = now()
       where id in (
         select id
         from sync_job
         where ((status = 'pending' and run_after <= now())
            or (status = 'running' and leased_until < now()))
         order by run_after, created_at
         limit ?
         for update skip locked
       )
       returning id`,
      [limit],
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private async processSyncJob(job: SyncJob): Promise<void> {
    const account = job.emailAccount;
    const em = await this.workerProvider.getWorkerEm();
    const managedAccount = await em.findOneOrFail(EmailAccount, { id: account.id });
    managedAccount.syncStatus = 'syncing';
    await em.flush();
    const gmail = this.createGmailClient(account.encryptedRefreshToken);

    if (job.kind === 'backfill') {
      await this.processBackfill(job, gmail);
      return;
    }
    await this.processIncremental(job, gmail);
  }

  private async processBackfill(job: SyncJob, gmail: GmailClient): Promise<void> {
    const pageToken =
      typeof job.checkpoint['pageToken'] === 'string' ? job.checkpoint['pageToken'] : null;
    const after = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
    const page = await gmail.listMessages(after, pageToken);
    const messages = await Promise.all(page.messageIds.map((id) => gmail.getMessage(id)));
    const cursor = this.latestHistoryId(messages, job.emailAccount.syncCursor);
    await this.persistMessageBatch(job, messages, cursor, page.nextPageToken);
  }

  private async processIncremental(job: SyncJob, gmail: GmailClient): Promise<void> {
    const cursor = job.emailAccount.syncCursor;
    if (!cursor) {
      await this.completeAndFallbackToBackfill(job);
      return;
    }

    const pageToken =
      typeof job.checkpoint['pageToken'] === 'string' ? job.checkpoint['pageToken'] : null;
    try {
      const startCursor =
        typeof job.checkpoint['startCursor'] === 'string' ? job.checkpoint['startCursor'] : cursor;
      const page = await gmail.listHistory(startCursor, pageToken);
      const messages = await Promise.all(page.messageIds.map((id) => gmail.getMessage(id)));
      await this.persistMessageBatch(
        job,
        messages,
        page.nextPageToken ? cursor : page.historyId,
        page.nextPageToken,
        page.nextPageToken ? { startCursor } : {},
      );
    } catch (error) {
      if (!(error instanceof GmailHistoryExpiredError)) throw error;
      await this.completeAndFallbackToBackfill(job);
    }
  }

  private async persistMessageBatch(
    job: SyncJob,
    messages: GmailMessage[],
    cursor: string | null,
    nextPageToken: string | null,
    checkpoint: SyncJobCheckpoint = {},
  ): Promise<string[]> {
    const workerEm = await this.workerProvider.getWorkerEm();
    return workerEm.transactional(async (em) => {
      const account = await em.findOneOrFail(EmailAccount, { id: job.emailAccount.id });
      const managedJob = await em.findOneOrFail(SyncJob, { id: job.id });
      const persisted: EmailMessage[] = [];

      for (const message of messages) {
        let entity = await em.findOne(EmailMessage, {
          emailAccount: account,
          providerMessageId: message.providerMessageId,
        });
        if (!entity) {
          entity = em.create(EmailMessage, {
            user: account.user,
            emailAccount: account,
            providerMessageId: message.providerMessageId,
            threadId: message.threadId,
            sender: message.sender,
            subject: message.subject,
            snippet: message.snippet,
            bodyText: message.bodyText,
            receivedAt: message.receivedAt,
            analysisStatus: 'pending',
          });
        } else {
          entity.threadId = message.threadId;
          entity.sender = message.sender;
          entity.subject = message.subject;
          entity.snippet = message.snippet;
          entity.bodyText = message.bodyText;
          entity.receivedAt = message.receivedAt;
        }
        persisted.push(entity);
      }

      account.syncCursor = cursor;
      account.lastSyncedAt = new Date();
      account.syncStatus = 'idle';
      managedJob.leasedUntil = null;
      managedJob.lastError = null;
      managedJob.attempts = 0;
      if (nextPageToken) {
        managedJob.status = 'pending';
        managedJob.runAfter = new Date();
        managedJob.checkpoint = {
          ...managedJob.checkpoint,
          ...checkpoint,
          pageToken: nextPageToken,
        };
      } else {
        managedJob.status = 'completed';
        managedJob.checkpoint = {};
        if (managedJob.kind === 'backfill') account.initialSyncCompletedAt ??= new Date();
      }
      await em.flush();
      const persistedIds = persisted.map((message) => message.id);
      if (persistedIds.length > 0) {
        const stableIds = [...new Set(persistedIds)].sort();
        const digest = createHash('sha256').update(stableIds.join(',')).digest('hex');
        await em.execute(
          `insert into sync_job
            (id, created_at, updated_at, email_account_id, kind, status, dedupe_key, attempts, run_after, checkpoint)
           values (gen_random_uuid(), now(), now(), ?, 'analyze', 'pending', ?, 0, now(), ?::jsonb)
           on conflict (email_account_id, kind, dedupe_key) do nothing`,
          [
            account.id,
            `messages:${digest}`,
            JSON.stringify({ messageIds: stableIds, state: 'screen' }),
          ],
        );
      }
      return persistedIds;
    });
  }

  private async completeAndFallbackToBackfill(job: SyncJob): Promise<void> {
    const em = await this.workerProvider.getWorkerEm();
    await em.transactional(async (tx) => {
      const account = await tx.findOneOrFail(EmailAccount, { id: job.emailAccount.id });
      const managedJob = await tx.findOneOrFail(SyncJob, { id: job.id });
      account.syncCursor = null;
      managedJob.status = 'completed';
      managedJob.leasedUntil = null;
      await tx.flush();
    });
    await this.enqueue(job.emailAccount.id, 'backfill', `cursor-reset:${Date.now()}`);
  }

  private async requeueFailedJob(job: SyncJob, error: unknown): Promise<void> {
    const em = await this.workerProvider.getWorkerEm();
    const managedJob = await em.findOne(SyncJob, { id: job.id }, { populate: ['emailAccount'] });
    if (!managedJob) return;
    const message = error instanceof Error ? error.message : String(error);
    managedJob.lastError = message.slice(0, 1000);
    managedJob.leasedUntil = null;
    managedJob.status = managedJob.attempts >= MAX_JOB_ATTEMPTS ? 'dead' : 'pending';
    managedJob.runAfter = new Date(
      Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** managedJob.attempts),
    );
    managedJob.emailAccount.syncStatus = /401|invalid_grant/i.test(message)
      ? 'reauth_required'
      : 'error';
    await em.flush();
    this.logger.error(
      { jobId: job.id, accountId: job.emailAccount.id, error: message },
      'Email pipeline job failed',
    );
  }

  private latestHistoryId(messages: GmailMessage[], current: string | null): string | null {
    return messages.reduce<string | null>((latest, message) => {
      if (!latest) return message.historyId;
      return BigInt(message.historyId) > BigInt(latest) ? message.historyId : latest;
    }, current);
  }

  private async hasRunnableJobs(em: EntityManager): Promise<boolean> {
    const rows = (await em.execute(
      `select exists(
         select 1 from sync_job
         where (status = 'pending' and run_after <= now())
            or (status = 'running' and leased_until < now())
       ) as remaining`,
    )) as Array<{ remaining: boolean }>;
    return rows[0]?.remaining === true;
  }

  private async selfChain(url: string): Promise<void> {
    const secret = process.env['CRON_SECRET'];
    if (!secret) return;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!response.ok) throw new Error(`Self-chain returned status ${response.status}`);
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to self-chain email sync drain',
      );
    }
  }
}
