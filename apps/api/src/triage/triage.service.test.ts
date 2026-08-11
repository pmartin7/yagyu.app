import type { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiService, StructuredGeneration } from '../ai/ai.service.js';
import type { WorkerEntityManagerProvider } from '../email-sync/email-sync.service.js';
import { EmailMessage } from '../email-sync/entities/email-message.entity.js';
import { SyncJob } from '../email-sync/entities/sync-job.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Category } from '../tasks/entities/category.entity.js';
import { TaskEmail } from '../tasks/entities/task-email.entity.js';
import { TaskNextStep } from '../tasks/entities/task-next-step.entity.js';
import { TaskNote } from '../tasks/entities/task-note.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { AutomationRun } from './entities/automation-run.entity.js';
import type { RoutePromptInput } from './prompts/route.prompt.js';
import { TriageService } from './triage.service.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const TASK_ID = '20000000-0000-4000-8000-000000000002';
const CATEGORY_ID = '30000000-0000-4000-8000-000000000003';
const EMAIL_ID = '40000000-0000-4000-8000-000000000004';
const ROGUE_TASK_ID = '50000000-0000-4000-8000-000000000005';
const ROGUE_EMAIL_ID = '60000000-0000-4000-8000-000000000006';

function generation<T>(object: T): StructuredGeneration<T> {
  return {
    object,
    model: 'test:model',
    tokensIn: 1,
    tokensOut: 1,
    latencyMs: 1,
    generationConfig: {},
  };
}

function makeGraph() {
  const user = new User();
  user.id = USER_ID;
  const category = new Category();
  category.id = CATEGORY_ID;
  category.user = user;
  category.name = 'Client work';
  category.summary = 'Client follow-ups';
  category.rankingMode = 'manual';
  const task = new Task();
  task.id = TASK_ID;
  task.user = user;
  task.category = category;
  task.title = 'Original title';
  task.aiContext = 'Original context';
  task.aiRecommendedAction = 'Original action';
  task.updatedAt = new Date('2026-08-09T10:00:00.000Z');
  const job = new SyncJob();
  job.id = '70000000-0000-4000-8000-000000000007';
  job.emailAccount = {
    id: '80000000-0000-4000-8000-000000000008',
    user,
  } as SyncJob['emailAccount'];
  job.kind = 'analyze';
  job.dedupeKey = 'messages:digest';
  job.status = 'running';
  job.checkpoint = {
    state: 'routed',
    taskIds: [task.id],
    messageIds: [],
    remainingMessageIds: [],
  };
  return { user, category, task, job };
}

function writerHarness(task: Task, job: SyncJob, steps: TaskNextStep[]) {
  const createdSteps: TaskNextStep[] = [];
  const removed: unknown[] = [];
  const readEm = {
    findOne: vi.fn().mockResolvedValue(task),
    find: vi.fn(async (entity: unknown) => {
      if (entity === TaskNextStep) return steps;
      if (entity === TaskNote || entity === TaskEmail) return [];
      return [];
    }),
  };
  const tx = {
    findOneOrFail: vi.fn(async (entity: unknown) => (entity === Task ? task : job)),
    findOne: vi.fn(async (entity: unknown) => (entity === Category ? task.category : null)),
    find: vi.fn(async (entity: unknown, criteria: Record<string, unknown>) => {
      if (entity !== TaskNextStep) return [];
      return 'completedAt' in criteria && criteria['completedAt'] === null
        ? steps.filter((step) => step.completedAt === null)
        : steps.filter((step) => step.completedAt !== null);
    }),
    create: vi.fn((entity: unknown, data: Record<string, unknown>) => {
      if (entity === TaskNextStep) {
        const step = Object.assign(new TaskNextStep(), data);
        createdSteps.push(step);
        return step;
      }
      return Object.assign(new AutomationRun(), data);
    }),
    remove: vi.fn((entities: unknown) => removed.push(entities)),
    flush: vi.fn().mockResolvedValue(undefined),
  };
  const writeEm = {
    transactional: vi.fn(async (work: (manager: typeof tx) => Promise<void>) => work(tx)),
  };
  const getWorkerEm = vi
    .fn()
    .mockResolvedValueOnce(readEm as unknown as EntityManager)
    .mockResolvedValueOnce(writeEm as unknown as EntityManager);
  return { getWorkerEm, tx, createdSteps, removed };
}

describe('TriageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resumes routed writer work without reopening or editing a done user-managed task', async () => {
    // Arrange
    const { task, job } = makeGraph();
    task.status = 'done';
    task.managedBy = 'user';
    const completed = new TaskNextStep();
    completed.task = task;
    completed.title = 'Already completed';
    completed.completedAt = new Date('2026-08-08T12:00:00.000Z');
    const harness = writerHarness(task, job, [completed]);
    const aiService = {
      generateStructured: vi.fn().mockResolvedValue(
        generation({
          title: 'AI replacement',
          aiContext: 'AI replacement context',
          recommendedAction: 'AI replacement action',
          nextSteps: [{ title: 'New AI step' }],
          dueDate: '2026-08-10',
          priority: 'urgent',
        }),
      ),
    };
    const service = new TriageService(
      aiService as unknown as AiService,
      { getWorkerEm: harness.getWorkerEm } as WorkerEntityManagerProvider,
    );

    // Act
    await service.processJob(job);

    // Assert
    expect(aiService.generateStructured).toHaveBeenCalledOnce();
    expect(task).toMatchObject({
      status: 'done',
      title: 'Original title',
      aiContext: 'Original context',
      aiRecommendedAction: 'Original action',
    });
    expect(completed.completedAt).toEqual(new Date('2026-08-08T12:00:00.000Z'));
    expect(harness.createdSteps).toHaveLength(0);
    expect(job).toMatchObject({ status: 'completed', checkpoint: {} });
  });

  it('preserves completed next steps while replacing incomplete AI-managed steps', async () => {
    // Arrange
    const { task, job } = makeGraph();
    task.managedBy = 'ai';
    const completed = Object.assign(new TaskNextStep(), {
      task,
      title: 'Completed step',
      completedAt: new Date('2026-08-08T12:00:00.000Z'),
      sortOrder: 0,
    });
    const incomplete = Object.assign(new TaskNextStep(), {
      task,
      title: 'Stale step',
      completedAt: null,
      sortOrder: 1,
    });
    const harness = writerHarness(task, job, [completed, incomplete]);
    const aiService = {
      generateStructured: vi.fn().mockResolvedValue(
        generation({
          title: 'Updated title',
          aiContext: 'Updated context',
          recommendedAction: null,
          nextSteps: [{ title: 'Fresh step' }],
          dueDate: null,
          priority: 'high',
        }),
      ),
    };
    const service = new TriageService(
      aiService as unknown as AiService,
      { getWorkerEm: harness.getWorkerEm } as WorkerEntityManagerProvider,
    );

    // Act
    await service.processJob(job);

    // Assert
    expect(completed.completedAt).not.toBeNull();
    expect(harness.removed).toEqual([[incomplete]]);
    expect(harness.createdSteps).toHaveLength(1);
    expect(harness.createdSteps[0]).toMatchObject({ title: 'Fresh step', sortOrder: 1 });
    expect(task.title).toBe('Updated title');
  });

  it('rejects IDs absent from the sent digest and deduplicates task-email links', async () => {
    // Arrange
    const { user, task, job } = makeGraph();
    const email = Object.assign(new EmailMessage(), {
      id: EMAIL_ID,
      user,
      threadId: 'thread',
      sender: 'sender@example.com',
      subject: 'Reply needed',
      snippet: 'Please reply',
      bodyText: 'Please reply.',
      receivedAt: new Date('2026-08-09T09:00:00.000Z'),
    });
    const createdLinks: TaskEmail[] = [];
    const audits: Array<Record<string, unknown>> = [];
    const tx = {
      find: vi.fn(async (entity: unknown) => {
        if (entity === EmailMessage) return [email];
        if (entity === Task) return [task];
        return [];
      }),
      findOne: vi.fn().mockResolvedValue(null),
      findOneOrFail: vi.fn().mockResolvedValue(job),
      create: vi.fn((entity: unknown, data: Record<string, unknown>) => {
        if (entity === TaskEmail) {
          const link = Object.assign(new TaskEmail(), data);
          createdLinks.push(link);
          return link;
        }
        if (entity === AutomationRun) audits.push(data);
        return Object.assign(new AutomationRun(), data);
      }),
      remove: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const rootEm = {
      transactional: vi.fn(async (work: (manager: typeof tx) => Promise<string[]>) => work(tx)),
    };
    const service = new TriageService({} as AiService, {
      getWorkerEm: vi.fn().mockResolvedValue(rootEm as unknown as EntityManager),
    });
    const input: RoutePromptInput = {
      graph: {
        categories: [{ id: CATEGORY_ID, name: 'Client work', summary: 'Client follow-ups' }],
        tasks: [{ id: TASK_ID, categoryId: CATEGORY_ID, title: task.title }],
      },
      emails: [
        {
          id: EMAIL_ID,
          sender: email.sender,
          subject: email.subject,
          receivedAt: email.receivedAt.toISOString(),
          snippet: email.snippet,
          bodyText: email.bodyText,
          existingTaskIds: [],
        },
      ],
    };
    const routeGeneration = generation({
      newCategories: [],
      newTasks: [],
      routes: [
        { emailId: EMAIL_ID, targets: [{ taskId: TASK_ID }, { taskId: TASK_ID }] },
        { emailId: ROGUE_EMAIL_ID, targets: [{ taskId: TASK_ID }] },
        { emailId: EMAIL_ID, targets: [{ taskId: ROGUE_TASK_ID }] },
      ],
    });
    const applyRoute = (
      service as unknown as {
        applyRoute: (
          jobId: string,
          userId: string,
          emails: EmailMessage[],
          routeInput: RoutePromptInput,
          route: typeof routeGeneration,
          remainingMessageIds: string[],
        ) => Promise<string[]>;
      }
    ).applyRoute.bind(service);

    // Act
    const taskIds = await applyRoute(job.id, USER_ID, [email], input, routeGeneration, []);

    // Assert
    expect(taskIds).toEqual([TASK_ID]);
    expect(createdLinks).toHaveLength(1);
    expect(audits[0]?.['appliedChanges']).toMatchObject({
      rejectedReferences: [`email:${ROGUE_EMAIL_ID}`, `task:${ROGUE_TASK_ID}`],
    });
  });
});
