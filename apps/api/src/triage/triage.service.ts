import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  RouteDecisionSchema,
  ScreenDecisionSchema,
  TaskWriteDecisionSchema,
} from '@morpheus/shared';
import type { RouteDecision, ScreenDecision, TaskWriteDecision } from '@morpheus/shared';
import { z } from 'zod';
import { AiService, type StructuredGeneration } from '../ai/ai.service.js';
import {
  WORKER_ENTITY_MANAGER,
  type WorkerEntityManagerProvider,
} from '../email-sync/email-sync.service.js';
import { EmailMessage } from '../email-sync/entities/email-message.entity.js';
import { SyncJob } from '../email-sync/entities/sync-job.entity.js';
import { Category } from '../tasks/entities/category.entity.js';
import { TaskEmail } from '../tasks/entities/task-email.entity.js';
import { TaskNextStep } from '../tasks/entities/task-next-step.entity.js';
import { TaskNote } from '../tasks/entities/task-note.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { AutomationRun } from './entities/automation-run.entity.js';
import {
  buildRoutePrompt,
  ROUTE_GENERATION_CONFIG,
  ROUTE_PROMPT_VERSION,
  ROUTE_SYSTEM_PROMPT,
  type RoutePromptInput,
} from './prompts/route.prompt.js';
import {
  buildScreenPrompt,
  SCREEN_GENERATION_CONFIG,
  SCREEN_PROMPT_VERSION,
  SCREEN_SYSTEM_PROMPT,
} from './prompts/screen.prompt.js';
import {
  buildWritePrompt,
  WRITE_GENERATION_CONFIG,
  WRITE_PROMPT_VERSION,
  WRITE_SYSTEM_PROMPT,
  type WritePromptInput,
} from './prompts/write.prompt.js';
import { getTriageModel } from './triage-model.config.js';

const MAX_LINKED_EMAILS = 20;
const MAX_NOTES = 10;
const MAX_EMAILS_PER_ANALYSIS = 10;
const MAX_SCREEN_BODY_CHARS = 12_000;
const MAX_ROUTE_BODY_CHARS = 4_000;
const MAX_WRITER_BODY_CHARS = 6_000;

const ScreenAuditSchema = z.object({ actionable: z.boolean(), reason: z.string() }).strict();
const RouteAuditSchema = z
  .object({
    createdCategoryIds: z.array(z.string().uuid()),
    createdTaskIds: z.array(z.string().uuid()),
    linkedEmailIds: z.array(z.string().uuid()),
    rejectedReferences: z.array(z.string()),
  })
  .strict();
const WriteAuditSchema = z
  .object({
    applied: z.boolean(),
    preservedCompletedSteps: z.number().int().nonnegative(),
  })
  .strict();

interface RoutedCheckpoint {
  state: 'routed';
  taskIds: string[];
  messageIds: string[];
  remainingMessageIds: string[];
}

interface WriterContext {
  taskId: string;
  prompt: WritePromptInput;
}

interface WriterResult {
  context: WriterContext;
  generation: StructuredGeneration<TaskWriteDecision>;
}

@Injectable()
export class TriageService {
  constructor(
    private readonly aiService: AiService,
    @Inject(WORKER_ENTITY_MANAGER)
    private readonly workerProvider: WorkerEntityManagerProvider,
  ) {}

  async processJob(job: SyncJob): Promise<void> {
    const routed = this.readRoutedCheckpoint(job.checkpoint);
    if (routed) {
      await this.runWriters(
        job.id,
        job.emailAccount.user.id,
        routed.taskIds,
        routed.messageIds,
        routed.remainingMessageIds,
      );
      return;
    }

    const targetedTaskId =
      job.kind === 'reanalyze' && typeof job.checkpoint['taskId'] === 'string'
        ? job.checkpoint['taskId']
        : null;
    if (targetedTaskId) {
      await this.runWriters(job.id, job.emailAccount.user.id, [targetedTaskId], [], []);
      return;
    }

    const { emails, remainingMessageIds } = await this.loadJobEmails(job);
    if (emails.length === 0) {
      await this.completeJob(job.id);
      return;
    }

    const screened = await Promise.all(
      emails.map(async (email) => ({
        email,
        generation: await this.aiService.generateStructured({
          schema: ScreenDecisionSchema,
          system: SCREEN_SYSTEM_PROMPT,
          operation: 'triage.screen',
          promptVersion: SCREEN_PROMPT_VERSION,
          prompt: buildScreenPrompt({
            sender: email.sender,
            subject: email.subject,
            receivedAt: email.receivedAt.toISOString(),
            snippet: email.snippet,
            bodyText: email.bodyText.slice(0, MAX_SCREEN_BODY_CHARS),
          }),
          model: getTriageModel('screen'),
          ...SCREEN_GENERATION_CONFIG,
        }),
      })),
    );
    const actionable = await this.applyScreenResults(job.id, screened, remainingMessageIds);
    if (actionable.length === 0) return;

    const routeInput = await this.buildRouteInput(job.emailAccount.user.id, actionable);
    const routeGeneration = await this.aiService.generateStructured({
      schema: RouteDecisionSchema,
      system: ROUTE_SYSTEM_PROMPT,
      operation: 'triage.route',
      promptVersion: ROUTE_PROMPT_VERSION,
      prompt: buildRoutePrompt(routeInput),
      model: getTriageModel('route'),
      ...ROUTE_GENERATION_CONFIG,
    });
    const taskIds = await this.applyRoute(
      job.id,
      job.emailAccount.user.id,
      actionable,
      routeInput,
      routeGeneration,
      remainingMessageIds,
    );
    await this.runWriters(
      job.id,
      job.emailAccount.user.id,
      taskIds,
      actionable.map((email) => email.id),
      remainingMessageIds,
    );
  }

  private async loadJobEmails(
    job: SyncJob,
  ): Promise<{ emails: EmailMessage[]; remainingMessageIds: string[] }> {
    const em = await this.workerProvider.getWorkerEm();
    const directIds = Array.isArray(job.checkpoint['messageIds'])
      ? job.checkpoint['messageIds'].filter((id): id is string => typeof id === 'string')
      : [];
    if (directIds.length > 0) {
      const emails = await em.find(
        EmailMessage,
        { id: { $in: directIds }, user: job.emailAccount.user.id },
        { orderBy: { receivedAt: 'asc' } },
      );
      return {
        emails: emails.slice(0, MAX_EMAILS_PER_ANALYSIS),
        remainingMessageIds: emails.slice(MAX_EMAILS_PER_ANALYSIS).map((email) => email.id),
      };
    }

    const taskId = typeof job.checkpoint['taskId'] === 'string' ? job.checkpoint['taskId'] : null;
    if (!taskId) return { emails: [], remainingMessageIds: [] };
    const links = await em.find(
      TaskEmail,
      { task: { id: taskId, user: job.emailAccount.user.id } },
      { populate: ['email'] },
    );
    const threadIds = [...new Set(links.map((link) => link.email.threadId))];
    if (threadIds.length === 0) return { emails: [], remainingMessageIds: [] };
    const emails = await em.find(
      EmailMessage,
      {
        user: job.emailAccount.user.id,
        emailAccount: job.emailAccount.id,
        threadId: { $in: threadIds },
      },
      { orderBy: { receivedAt: 'asc' } },
    );
    return {
      emails: emails.slice(0, MAX_EMAILS_PER_ANALYSIS),
      remainingMessageIds: emails.slice(MAX_EMAILS_PER_ANALYSIS).map((email) => email.id),
    };
  }

  private async applyScreenResults(
    jobId: string,
    screened: Array<{
      email: EmailMessage;
      generation: StructuredGeneration<ScreenDecision>;
    }>,
    remainingMessageIds: string[],
  ): Promise<EmailMessage[]> {
    const em = await this.workerProvider.getWorkerEm();
    const actionableIds = screened
      .filter((result) => result.generation.object.actionable)
      .map((result) => result.email.id);

    await em.transactional(async (tx) => {
      for (const result of screened) {
        const email = await tx.findOneOrFail(EmailMessage, { id: result.email.id });
        if (!result.generation.object.actionable) email.analysisStatus = 'skipped';
        tx.create(AutomationRun, {
          user: email.user,
          stage: 'screen',
          email,
          task: null,
          promptVersion: SCREEN_PROMPT_VERSION,
          model: result.generation.model,
          generationConfig: result.generation.generationConfig,
          appliedChanges: ScreenAuditSchema.parse(result.generation.object),
          tokensIn: result.generation.tokensIn,
          tokensOut: result.generation.tokensOut,
          latencyMs: result.generation.latencyMs,
        });
      }
      if (actionableIds.length === 0) {
        const job = await tx.findOneOrFail(SyncJob, { id: jobId });
        job.status = remainingMessageIds.length > 0 ? 'pending' : 'completed';
        job.leasedUntil = null;
        job.attempts = 0;
        job.runAfter = new Date();
        job.checkpoint =
          remainingMessageIds.length > 0
            ? { state: 'screen', messageIds: remainingMessageIds }
            : {};
      }
      await tx.flush();
    });

    return screened
      .filter((result) => result.generation.object.actionable)
      .map((result) => result.email);
  }

  private async buildRouteInput(userId: string, emails: EmailMessage[]): Promise<RoutePromptInput> {
    const em = await this.workerProvider.getWorkerEm();
    const [categories, tasks, existingLinks] = await Promise.all([
      em.find(Category, { user: userId }, { orderBy: { sortOrder: 'asc' } }),
      em.find(Task, { user: userId, status: 'open' }, { populate: ['category'] }),
      em.find(
        TaskEmail,
        {
          email: {
            user: userId,
            threadId: { $in: [...new Set(emails.map((email) => email.threadId))] },
          },
          task: { user: userId, status: 'open' },
        },
        { populate: ['email', 'task'] },
      ),
    ]);
    const existingTaskIdsByThread = new Map<string, Set<string>>();
    for (const link of existingLinks) {
      const taskIds = existingTaskIdsByThread.get(link.email.threadId) ?? new Set<string>();
      taskIds.add(link.task.id);
      existingTaskIdsByThread.set(link.email.threadId, taskIds);
    }
    return {
      graph: {
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          summary: category.summary,
        })),
        tasks: tasks.map((task) => ({
          id: task.id,
          categoryId: task.category.id,
          title: task.title,
        })),
      },
      emails: emails.map((email) => ({
        id: email.id,
        sender: email.sender,
        subject: email.subject,
        receivedAt: email.receivedAt.toISOString(),
        snippet: email.snippet,
        bodyText: email.bodyText.slice(0, MAX_ROUTE_BODY_CHARS),
        existingTaskIds: [...(existingTaskIdsByThread.get(email.threadId) ?? [])],
      })),
    };
  }

  private async applyRoute(
    jobId: string,
    userId: string,
    emails: EmailMessage[],
    input: RoutePromptInput,
    generation: StructuredGeneration<RouteDecision>,
    remainingMessageIds: string[],
  ): Promise<string[]> {
    const workerEm = await this.workerProvider.getWorkerEm();
    return workerEm.transactional(async (em) => {
      const validCategoryIds = new Set(input.graph.categories.map((category) => category.id));
      const validTaskIds = new Set(input.graph.tasks.map((task) => task.id));
      const validEmailIds = new Set(input.emails.map((email) => email.id));
      const categoryRefs = new Map<string, Category>();
      const taskRefs = new Map<string, Task>();
      const touchedTasks = new Map<string, Task>();
      const createdCategoryIds: string[] = [];
      const createdTaskIds: string[] = [];
      const linkedEmailIds: string[] = [];
      const rejectedReferences: string[] = [];
      const plannedLinks = new Set<string>();

      for (const declaration of generation.object.newCategories) {
        if (categoryRefs.has(declaration.newCategoryRef)) {
          rejectedReferences.push(`duplicate-category-ref:${declaration.newCategoryRef}`);
          continue;
        }
        let category = await em.findOne(Category, { user: userId, name: declaration.name });
        if (!category) {
          category = em.create(Category, {
            user: userId,
            name: declaration.name,
            summary: declaration.summary,
            managedBy: 'ai',
            rankingMode: 'ai',
            sortOrder: input.graph.categories.length + createdCategoryIds.length,
          });
          await em.flush();
          createdCategoryIds.push(category.id);
        }
        categoryRefs.set(declaration.newCategoryRef, category);
      }

      for (const declaration of generation.object.newTasks) {
        if (taskRefs.has(declaration.newTaskRef)) {
          rejectedReferences.push(`duplicate-task-ref:${declaration.newTaskRef}`);
          continue;
        }
        let category: Category | null = null;
        if ('categoryId' in declaration) {
          if (!validCategoryIds.has(declaration.categoryId)) {
            rejectedReferences.push(`category:${declaration.categoryId}`);
            continue;
          }
          category = await em.findOne(Category, { id: declaration.categoryId, user: userId });
        } else {
          category = categoryRefs.get(declaration.newCategoryRef) ?? null;
          if (!category) rejectedReferences.push(`category-ref:${declaration.newCategoryRef}`);
        }
        if (!category) continue;
        const task = em.create(Task, {
          user: userId,
          category,
          title: declaration.label,
          status: 'open',
          priority: 'medium',
          stackRank: 0,
          managedBy: 'ai',
          aiContext: null,
          aiRecommendedAction: null,
          dueDate: null,
        });
        await em.flush();
        taskRefs.set(declaration.newTaskRef, task);
        createdTaskIds.push(task.id);
      }

      const emailById = new Map(
        (await em.find(EmailMessage, { id: { $in: [...validEmailIds] }, user: userId })).map(
          (email) => [email.id, email],
        ),
      );
      const existingTasks = new Map(
        (await em.find(Task, { id: { $in: [...validTaskIds] }, user: userId })).map((task) => [
          task.id,
          task,
        ]),
      );
      const routedEmailIds = new Set<string>();

      for (const route of generation.object.routes) {
        const email = validEmailIds.has(route.emailId) ? emailById.get(route.emailId) : undefined;
        if (!email) {
          rejectedReferences.push(`email:${route.emailId}`);
          continue;
        }
        for (const target of route.targets) {
          const task =
            'taskId' in target
              ? validTaskIds.has(target.taskId)
                ? existingTasks.get(target.taskId)
                : undefined
              : taskRefs.get(target.newTaskRef);
          if (!task) {
            rejectedReferences.push(
              'taskId' in target ? `task:${target.taskId}` : `task-ref:${target.newTaskRef}`,
            );
            continue;
          }
          const linkKey = `${task.id}:${email.id}`;
          if (plannedLinks.has(linkKey)) {
            touchedTasks.set(task.id, task);
            routedEmailIds.add(email.id);
            continue;
          }
          const existingLink = await em.findOne(TaskEmail, { task, email });
          if (!existingLink) {
            em.create(TaskEmail, { task, email, linkedBy: 'ai' });
            linkedEmailIds.push(email.id);
          }
          plannedLinks.add(linkKey);
          touchedTasks.set(task.id, task);
          routedEmailIds.add(email.id);
        }
      }

      for (const task of taskRefs.values()) {
        if (touchedTasks.has(task.id)) continue;
        em.remove(task);
        const createdIndex = createdTaskIds.indexOf(task.id);
        if (createdIndex >= 0) createdTaskIds.splice(createdIndex, 1);
      }

      for (const email of emails) {
        if (routedEmailIds.has(email.id)) continue;
        const managedEmail = emailById.get(email.id);
        if (!managedEmail) continue;
        let fallbackCategory = await em.findOne(Category, {
          user: userId,
          name: 'Inbox Follow-ups',
        });
        if (!fallbackCategory) {
          fallbackCategory = em.create(Category, {
            user: userId,
            name: 'Inbox Follow-ups',
            summary: 'Actionable email that needs a follow-up.',
            managedBy: 'ai',
            rankingMode: 'ai',
            sortOrder: input.graph.categories.length + createdCategoryIds.length,
          });
          await em.flush();
          createdCategoryIds.push(fallbackCategory.id);
        }
        const task = em.create(Task, {
          user: userId,
          category: fallbackCategory,
          title: managedEmail.subject || 'Follow up on email',
          status: 'open',
          priority: 'medium',
          stackRank: 0,
          managedBy: 'ai',
          aiContext: null,
          aiRecommendedAction: null,
          dueDate: null,
        });
        await em.flush();
        em.create(TaskEmail, { task, email: managedEmail, linkedBy: 'ai' });
        createdTaskIds.push(task.id);
        linkedEmailIds.push(managedEmail.id);
        touchedTasks.set(task.id, task);
      }

      const job = await em.findOneOrFail(SyncJob, { id: jobId });
      const taskIds = [...touchedTasks.keys()];
      const messageIds = emails.map((email) => email.id);
      job.checkpoint = {
        state: 'routed',
        taskIds,
        messageIds,
        remainingMessageIds,
      } satisfies RoutedCheckpoint;
      job.attempts = 0;
      em.create(AutomationRun, {
        user: userId,
        stage: 'route',
        email: null,
        task: null,
        promptVersion: ROUTE_PROMPT_VERSION,
        model: generation.model,
        generationConfig: generation.generationConfig,
        appliedChanges: RouteAuditSchema.parse({
          createdCategoryIds,
          createdTaskIds,
          linkedEmailIds,
          rejectedReferences,
        }),
        tokensIn: generation.tokensIn,
        tokensOut: generation.tokensOut,
        latencyMs: generation.latencyMs,
      });
      await em.flush();
      return taskIds;
    });
  }

  private async runWriters(
    jobId: string,
    userId: string,
    taskIds: string[],
    messageIds: string[],
    remainingMessageIds: string[],
  ): Promise<void> {
    const contexts = (
      await Promise.all(
        [...new Set(taskIds)].map((taskId) => this.buildWriterContext(userId, taskId, messageIds)),
      )
    ).filter((context): context is WriterContext => context !== null);
    const results = await Promise.all(
      contexts.map(
        async (context): Promise<WriterResult> => ({
          context,
          generation: await this.aiService.generateStructured({
            schema: TaskWriteDecisionSchema,
            system: WRITE_SYSTEM_PROMPT,
            operation: 'triage.write',
            promptVersion: WRITE_PROMPT_VERSION,
            prompt: buildWritePrompt(context.prompt),
            model: getTriageModel('write'),
            ...WRITE_GENERATION_CONFIG,
          }),
        }),
      ),
    );

    const workerEm = await this.workerProvider.getWorkerEm();
    await workerEm.transactional(async (em) => {
      const categoryIds = new Set<string>();
      for (const result of results) {
        const task = await em.findOneOrFail(
          Task,
          { id: result.context.taskId, user: userId },
          { populate: ['category'] },
        );
        const completedSteps = await em.find(TaskNextStep, {
          task,
          completedAt: { $ne: null },
        });
        let applied = false;
        if (task.managedBy === 'ai') {
          task.title = result.generation.object.title;
          task.aiContext = result.generation.object.aiContext;
          task.aiRecommendedAction = result.generation.object.recommendedAction;
          task.dueDate = result.generation.object.dueDate;
          task.priority = result.generation.object.priority;
          const incompleteSteps = await em.find(TaskNextStep, { task, completedAt: null });
          em.remove(incompleteSteps);
          result.generation.object.nextSteps.forEach((step, index) => {
            em.create(TaskNextStep, {
              task,
              title: step.title,
              completedAt: null,
              sortOrder: completedSteps.length + index,
            });
          });
          applied = true;
        }
        categoryIds.add(task.category.id);
        em.create(AutomationRun, {
          user: userId,
          stage: 'write',
          email: null,
          task,
          promptVersion: WRITE_PROMPT_VERSION,
          model: result.generation.model,
          generationConfig: result.generation.generationConfig,
          appliedChanges: WriteAuditSchema.parse({
            applied,
            preservedCompletedSteps: completedSteps.length,
          }),
          tokensIn: result.generation.tokensIn,
          tokensOut: result.generation.tokensOut,
          latencyMs: result.generation.latencyMs,
        });
      }

      await this.rankCategories(em, userId, [...categoryIds]);
      if (messageIds.length > 0) {
        const emails = await em.find(EmailMessage, {
          id: { $in: messageIds },
          user: userId,
        });
        for (const email of emails) email.analysisStatus = 'analyzed';
      }
      const job = await em.findOneOrFail(SyncJob, { id: jobId });
      job.status = remainingMessageIds.length > 0 ? 'pending' : 'completed';
      job.leasedUntil = null;
      job.attempts = 0;
      job.runAfter = new Date();
      job.checkpoint =
        remainingMessageIds.length > 0 ? { state: 'screen', messageIds: remainingMessageIds } : {};
      await em.flush();
    });
  }

  private async buildWriterContext(
    userId: string,
    taskId: string,
    newMessageIds: string[],
  ): Promise<WriterContext | null> {
    const em = await this.workerProvider.getWorkerEm();
    const task = await em.findOne(Task, { id: taskId, user: userId }, { populate: ['category'] });
    if (!task) return null;
    const [steps, notes, links] = await Promise.all([
      em.find(TaskNextStep, { task }, { orderBy: { sortOrder: 'asc' } }),
      em.find(
        TaskNote,
        { task, user: userId },
        { orderBy: { createdAt: 'desc' }, limit: MAX_NOTES },
      ),
      em.find(
        TaskEmail,
        { task },
        {
          populate: ['email'],
          orderBy: { email: { receivedAt: 'desc' } },
          limit: MAX_LINKED_EMAILS,
        },
      ),
    ]);
    const newIds = new Set(newMessageIds);
    return {
      taskId,
      prompt: {
        category: { name: task.category.name, summary: task.category.summary },
        task: {
          id: task.id,
          title: task.title,
          aiContext: task.aiContext,
          aiRecommendedAction: task.aiRecommendedAction,
          dueDate: task.dueDate,
          priority: task.priority,
          completedNextSteps: steps
            .filter((step) => step.completedAt !== null)
            .map((step) => step.title),
        },
        linkedEmails: links.map((link) => ({
          sender: link.email.sender,
          subject: link.email.subject,
          receivedAt: link.email.receivedAt.toISOString(),
          snippet: link.email.snippet,
          ...(newIds.has(link.email.id)
            ? { bodyText: link.email.bodyText.slice(0, MAX_WRITER_BODY_CHARS) }
            : {}),
        })),
        notes: notes.map((note) => ({
          body: note.body,
          createdAt: note.createdAt.toISOString(),
        })),
      },
    };
  }

  private async rankCategories(
    em: EntityManager,
    userId: string,
    categoryIds: string[],
  ): Promise<void> {
    for (const categoryId of categoryIds) {
      const category = await em.findOne(Category, { id: categoryId, user: userId });
      if (!category || category.rankingMode === 'manual') continue;
      const tasks = await em.find(Task, { category, user: userId, status: 'open' });
      tasks
        .sort(
          (left, right) =>
            this.rankScore(left) - this.rankScore(right) || left.id.localeCompare(right.id),
        )
        .forEach((task, index) => {
          task.stackRank = index;
        });
    }
  }

  private rankScore(task: Task): number {
    let priority = 300;
    if (task.priority === 'urgent') priority = 0;
    else if (task.priority === 'high') priority = 100;
    else if (task.priority === 'medium') priority = 200;
    const due = task.dueDate
      ? Math.max(
          -100,
          Math.min(100, Math.ceil((Date.parse(task.dueDate) - Date.now()) / 86_400_000)),
        )
      : 100;
    const recency = Math.min(30, (Date.now() - task.updatedAt.getTime()) / 86_400_000);
    return priority + due + recency;
  }

  private readRoutedCheckpoint(checkpoint: Record<string, unknown>): RoutedCheckpoint | null {
    if (
      checkpoint['state'] !== 'routed' ||
      !Array.isArray(checkpoint['taskIds']) ||
      !Array.isArray(checkpoint['messageIds']) ||
      (checkpoint['remainingMessageIds'] !== undefined &&
        !Array.isArray(checkpoint['remainingMessageIds']))
    ) {
      return null;
    }
    return {
      state: 'routed',
      taskIds: checkpoint['taskIds'].filter((id): id is string => typeof id === 'string'),
      messageIds: checkpoint['messageIds'].filter((id): id is string => typeof id === 'string'),
      remainingMessageIds: Array.isArray(checkpoint['remainingMessageIds'])
        ? checkpoint['remainingMessageIds'].filter((id): id is string => typeof id === 'string')
        : [],
    };
  }

  private async completeJob(jobId: string): Promise<void> {
    const em = await this.workerProvider.getWorkerEm();
    const job = await em.findOne(SyncJob, { id: jobId });
    if (!job) return;
    job.status = 'completed';
    job.leasedUntil = null;
    job.attempts = 0;
    job.checkpoint = {};
    await em.flush();
  }
}
