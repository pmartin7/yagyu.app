import type { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailAccount } from '../email-accounts/entities/email-account.entity.js';
import { SyncJob } from '../email-sync/entities/sync-job.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Category } from './entities/category.entity.js';
import { TaskEmail } from './entities/task-email.entity.js';
import { TaskNote } from './entities/task-note.entity.js';
import { Task } from './entities/task.entity.js';
import { TasksService } from './tasks.service.js';

function makeUser(): User {
  const user = new User();
  user.id = '10000000-0000-4000-8000-000000000001';
  user.firebaseUid = 'firebase-user';
  user.email = 'user@example.com';
  return user;
}

function makeTask(user: User): Task {
  const category = new Category();
  category.id = '20000000-0000-4000-8000-000000000002';
  category.user = user;
  category.name = 'Client work';
  category.summary = 'Client follow-ups';

  const task = new Task();
  task.id = '30000000-0000-4000-8000-000000000003';
  task.user = user;
  task.category = category;
  task.title = 'Reply to client';
  task.createdAt = new Date('2026-08-09T10:00:00.000Z');
  task.updatedAt = new Date('2026-08-09T10:00:00.000Z');
  return task;
}

describe('TasksService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes done tasks from the default list query', async () => {
    // Arrange
    const user = makeUser();
    const find = vi.fn().mockResolvedValue([]);
    const service = new TasksService({ find } as unknown as EntityManager);

    // Act
    await service.list(user, {});

    // Assert
    expect(find).toHaveBeenCalledWith(
      Task,
      { user, status: 'open' },
      expect.objectContaining({ populate: expect.any(Array) }),
    );
  });

  it.each(['done', 'open'] as const)('updates a task status to %s', async (status) => {
    // Arrange
    const user = makeUser();
    const task = makeTask(user);
    task.status = status === 'done' ? 'open' : 'done';
    const em = {
      findOne: vi.fn().mockResolvedValue(task),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const service = new TasksService(em as unknown as EntityManager);

    // Act
    const response = await service.update(user, task.id, { status });

    // Assert
    expect(task.status).toBe(status);
    expect(response.status).toBe(status);
    expect(em.flush).toHaveBeenCalledOnce();
  });

  it('switches the category to manual ranking on the first manual rank update', async () => {
    // Arrange
    const user = makeUser();
    const task = makeTask(user);
    task.category.rankingMode = 'ai';
    const em = {
      findOne: vi.fn().mockResolvedValue(task),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const service = new TasksService(em as unknown as EntityManager);

    // Act
    await service.update(user, task.id, { stackRank: 7 });

    // Assert
    expect(task.stackRank).toBe(7);
    expect(task.category.rankingMode).toBe('manual');
  });

  it('scopes a note to the user task and queues targeted reanalysis', async () => {
    // Arrange
    const user = makeUser();
    const task = makeTask(user);
    const account = new EmailAccount();
    account.id = '40000000-0000-4000-8000-000000000004';
    account.user = user;
    const link = new TaskEmail();
    link.task = task;
    link.email = {
      emailAccount: account,
    } as TaskEmail['email'];
    const createdJobs: SyncJob[] = [];
    const notes: TaskNote[] = [];
    task.notes = {
      getItems: () => notes,
    } as unknown as Task['notes'];

    const em = {
      findOne: vi.fn(async (entity: unknown) => {
        if (entity === Task) return task;
        if (entity === TaskEmail) return link;
        return null;
      }),
      create: vi.fn((entity: unknown, data: Record<string, unknown>) => {
        if (entity === TaskNote) {
          const note = Object.assign(new TaskNote(), data, {
            id: '50000000-0000-4000-8000-000000000005',
            createdAt: new Date('2026-08-09T11:00:00.000Z'),
            updatedAt: new Date('2026-08-09T11:00:00.000Z'),
          });
          notes.push(note);
          return note;
        }
        const job = Object.assign(new SyncJob(), data);
        createdJobs.push(job);
        return job;
      }),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const service = new TasksService(em as unknown as EntityManager);

    // Act
    const response = await service.appendNote(user, task.id, { body: 'Use the revised contract.' });

    // Assert
    expect(em.findOne).toHaveBeenCalledWith(Task, { id: task.id, user });
    expect(createdJobs).toHaveLength(1);
    expect(createdJobs[0]).toMatchObject({
      emailAccount: account,
      kind: 'reanalyze',
      checkpoint: { taskId: task.id, noteId: '50000000-0000-4000-8000-000000000005' },
    });
    expect(response.notes[0]).toMatchObject({
      body: 'Use the revised contract.',
      analysisQueued: true,
    });
  });
});
