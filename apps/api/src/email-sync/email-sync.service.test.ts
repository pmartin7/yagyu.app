import type { EntityManager } from '@mikro-orm/postgresql';
import type { ModuleRef } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailAccount } from '../email-accounts/entities/email-account.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  EmailSyncService,
  type GmailClientFactory,
  type WorkerEntityManagerProvider,
} from './email-sync.service.js';
import { EmailMessage } from './entities/email-message.entity.js';
import { SyncJob, type SyncJobKind } from './entities/sync-job.entity.js';
import { GmailHistoryExpiredError, type GmailClient, type GmailMessage } from './gmail-client.js';

function makeAccount(): EmailAccount {
  const user = new User();
  user.id = '10000000-0000-4000-8000-000000000001';
  const account = new EmailAccount();
  account.id = '20000000-0000-4000-8000-000000000002';
  account.user = user;
  account.encryptedRefreshToken = 'encrypted';
  account.syncCursor = '100';
  return account;
}

function makeJob(account: EmailAccount, kind: SyncJobKind): SyncJob {
  const job = new SyncJob();
  job.id = '30000000-0000-4000-8000-000000000003';
  job.emailAccount = account;
  job.kind = kind;
  job.dedupeKey = 'job';
  job.status = 'running';
  job.leasedUntil = new Date('2026-08-09T12:01:30.000Z');
  return job;
}

function makeService(
  em: Record<string, unknown>,
  gmail: Partial<GmailClient> = {},
  processor: { processJob: (job: SyncJob) => Promise<void> } = {
    processJob: vi.fn().mockResolvedValue(undefined),
  },
): EmailSyncService {
  const provider: WorkerEntityManagerProvider = {
    getWorkerEm: vi.fn().mockResolvedValue(em as unknown as EntityManager),
  };
  const factory = vi.fn(() => gmail as GmailClient) as unknown as GmailClientFactory;
  const moduleRef = {
    get: vi.fn(() => processor),
  } as unknown as ModuleRef;
  return new EmailSyncService(provider, factory, moduleRef);
}

describe('EmailSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims runnable jobs atomically without reclaiming a live lease', async () => {
    // Arrange
    const execute = vi.fn().mockResolvedValue([{ id: 'claimed-job' }]);
    const em = {
      execute,
      findOne: vi.fn().mockResolvedValue(null),
    };
    const service = makeService(em);

    // Act
    await service.drainBounded();

    // Assert
    const claimSql = String(execute.mock.calls[0]?.[0]).replace(/\s+/g, ' ');
    expect(claimSql).toContain('update sync_job');
    expect(claimSql).toContain("status = 'running'");
    expect(claimSql).toContain("status = 'pending' and run_after <= now()");
    expect(claimSql).toContain("status = 'running' and leased_until < now()");
    expect(claimSql).toContain('for update skip locked');
    expect(claimSql).toContain('returning id');
  });

  it('persists cursor, messages, and analyze enqueue in one transaction with bounded backfill', async () => {
    // Arrange
    const account = makeAccount();
    account.syncCursor = null;
    const job = makeJob(account, 'backfill');
    const message: GmailMessage = {
      providerMessageId: 'gmail-message',
      threadId: 'thread',
      historyId: '321',
      sender: 'sender@example.com',
      subject: 'Action needed',
      snippet: 'Please reply',
      bodyText: 'Please reply by tomorrow.',
      receivedAt: new Date('2026-08-09T09:00:00.000Z'),
    };
    const persisted = Object.assign(new EmailMessage(), message, {
      id: '40000000-0000-4000-8000-000000000004',
    });
    const tx = {
      findOneOrFail: vi.fn(async (entity: unknown) => (entity === EmailAccount ? account : job)),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(() => persisted),
      flush: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue([]),
    };
    const em = {
      execute: vi.fn().mockResolvedValue([{ id: job.id }]),
      findOne: vi.fn().mockResolvedValue(job),
      findOneOrFail: vi.fn().mockResolvedValue(account),
      flush: vi.fn().mockResolvedValue(undefined),
      transactional: vi.fn(async (work: (manager: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const gmail = {
      listMessages: vi.fn().mockResolvedValue({
        messageIds: [message.providerMessageId],
        nextPageToken: null,
      }),
      getMessage: vi.fn().mockResolvedValue(message),
    };
    const service = makeService(em, gmail);

    // Act
    await service.drainBounded();

    // Assert
    const after = vi.mocked(gmail.listMessages).mock.calls[0]?.[0] as Date;
    expect(after.toISOString()).toBe('2026-06-10T12:00:00.000Z');
    expect(account.syncCursor).toBe('321');
    expect(job.status).toBe('completed');
    expect(tx.flush.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.execute.mock.invocationCallOrder[0]!,
    );
    expect(String(tx.execute.mock.calls[0]?.[0])).toContain("'analyze'");
    expect(tx.execute.mock.calls[0]?.[1]).toEqual([
      account.id,
      expect.stringMatching(/^messages:/),
      JSON.stringify({ messageIds: [persisted.id], state: 'screen' }),
    ]);
  });

  it('completes expired incremental history and enqueues a bounded backfill', async () => {
    // Arrange
    const account = makeAccount();
    const job = makeJob(account, 'incremental');
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ id: job.id }])
      .mockResolvedValueOnce([]);
    const tx = {
      findOneOrFail: vi.fn(async (entity: unknown) => (entity === EmailAccount ? account : job)),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const em = {
      execute,
      findOne: vi.fn().mockResolvedValue(job),
      findOneOrFail: vi.fn().mockResolvedValue(account),
      flush: vi.fn().mockResolvedValue(undefined),
      transactional: vi.fn(async (work: (manager: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const gmail = {
      listHistory: vi.fn().mockRejectedValue(new GmailHistoryExpiredError()),
    };
    const service = makeService(em, gmail);

    // Act
    await service.drainBounded();

    // Assert
    expect(account.syncCursor).toBeNull();
    expect(job.status).toBe('completed');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(String(execute.mock.calls[1]?.[0])).toContain('insert into sync_job');
    expect(execute.mock.calls[1]?.[1]).toEqual([
      account.id,
      'backfill',
      expect.stringMatching(/^cursor-reset:/),
      '{}',
    ]);
  });

  it.each([
    { attempts: 2, expectedStatus: 'pending' },
    { attempts: 5, expectedStatus: 'dead' },
  ] as const)(
    'applies failure backoff and marks attempt $attempts as $expectedStatus',
    async ({ attempts, expectedStatus }) => {
      // Arrange
      const account = makeAccount();
      const job = makeJob(account, 'analyze');
      job.attempts = attempts;
      const em = {
        execute: vi.fn().mockResolvedValue([{ id: job.id }]),
        findOne: vi.fn().mockResolvedValue(job),
        flush: vi.fn().mockResolvedValue(undefined),
      };
      const processor = {
        processJob: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      };
      const service = makeService(em, {}, processor);

      // Act
      await service.drainBounded();

      // Assert
      expect(job.status).toBe(expectedStatus);
      expect(job.leasedUntil).toBeNull();
      expect(job.runAfter.getTime()).toBe(
        Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** attempts),
      );
      expect(account.syncStatus).toBe('error');
    },
  );
});
