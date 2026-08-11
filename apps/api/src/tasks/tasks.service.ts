import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  CategoryResponse,
  CreateTaskNote,
  TaskListQuery,
  TaskResponse,
  UpdateNextStep,
  UpdateTask,
} from '@morpheus/shared';
import { SyncJob } from '../email-sync/entities/sync-job.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Category } from './entities/category.entity.js';
import { TaskEmail } from './entities/task-email.entity.js';
import { TaskNextStep } from './entities/task-next-step.entity.js';
import { TaskNote } from './entities/task-note.entity.js';
import { Task } from './entities/task.entity.js';

@Injectable()
export class TasksService {
  constructor(private readonly em: EntityManager) {}

  async list(user: User, query: TaskListQuery): Promise<TaskResponse[]> {
    const tasks = await this.em.find(
      Task,
      {
        user,
        ...(query.categoryId ? { category: query.categoryId } : {}),
        ...(query.includeDone ? {} : { status: 'open' as const }),
      },
      {
        populate: ['category', 'nextSteps', 'notes', 'taskEmails.email'],
        orderBy: {
          category: { sortOrder: 'asc' },
          stackRank: 'asc',
          createdAt: 'asc',
        },
      },
    );
    return tasks.map((task) => this.toResponse(task));
  }

  async listCategories(user: User): Promise<CategoryResponse[]> {
    const categories = await this.em.find(
      Category,
      { user },
      { orderBy: { sortOrder: 'asc', name: 'asc' } },
    );
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      summary: category.summary,
      managedBy: category.managedBy,
      rankingMode: category.rankingMode,
      sortOrder: category.sortOrder,
    }));
  }

  async update(user: User, taskId: string, input: UpdateTask): Promise<TaskResponse> {
    const task = await this.em.findOne(Task, { id: taskId, user }, { populate: ['category'] });
    if (!task) throw new NotFoundException('Task not found');

    if (input.status !== undefined) task.status = input.status;
    if (input.stackRank !== undefined) {
      task.stackRank = input.stackRank;
      task.category.rankingMode = 'manual';
    }
    await this.em.flush();
    return this.getResponse(user, task.id);
  }

  async updateNextStep(
    user: User,
    taskId: string,
    stepId: string,
    input: UpdateNextStep,
  ): Promise<TaskResponse> {
    const step = await this.em.findOne(TaskNextStep, {
      id: stepId,
      task: { id: taskId, user },
    });
    if (!step) throw new NotFoundException('Task next step not found');
    step.completedAt = input.completed ? new Date() : null;
    await this.em.flush();
    return this.getResponse(user, taskId);
  }

  async appendNote(user: User, taskId: string, input: CreateTaskNote): Promise<TaskResponse> {
    const task = await this.em.findOne(Task, { id: taskId, user });
    if (!task) throw new NotFoundException('Task not found');
    const note = this.em.create(TaskNote, { task, user, body: input.body });
    await this.em.flush();

    const link = await this.em.findOne(TaskEmail, { task }, { populate: ['email.emailAccount'] });
    const analysisQueued = Boolean(link);
    if (link) {
      this.em.create(SyncJob, {
        emailAccount: link.email.emailAccount,
        kind: 'reanalyze',
        status: 'pending',
        dedupeKey: `task-note:${note.id}`,
        attempts: 0,
        runAfter: new Date(),
        leasedUntil: null,
        checkpoint: { taskId: task.id, noteId: note.id },
        lastError: null,
      });
      await this.em.flush();
    }
    const response = await this.getResponse(user, task.id);
    const createdNote = response.notes.find((item) => item.id === note.id);
    if (createdNote) createdNote.analysisQueued = analysisQueued;
    return response;
  }

  private async getResponse(user: User, taskId: string): Promise<TaskResponse> {
    const task = await this.em.findOne(
      Task,
      { id: taskId, user },
      { populate: ['category', 'nextSteps', 'notes', 'taskEmails.email'] },
    );
    if (!task) throw new NotFoundException('Task not found');
    return this.toResponse(task);
  }

  private toResponse(task: Task): TaskResponse {
    return {
      id: task.id,
      category: {
        id: task.category.id,
        name: task.category.name,
        summary: task.category.summary,
      },
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      priority: task.priority,
      stackRank: task.stackRank,
      managedBy: task.managedBy,
      aiContext: task.aiContext,
      aiRecommendedAction: task.aiRecommendedAction,
      nextSteps: task.nextSteps
        .getItems()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((step) => ({
          id: step.id,
          title: step.title,
          completedAt: step.completedAt?.toISOString() ?? null,
          sortOrder: step.sortOrder,
        })),
      notes: task.notes
        .getItems()
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((note) => ({
          id: note.id,
          body: note.body,
          createdAt: note.createdAt.toISOString(),
          analysisQueued: false,
        })),
      linkedEmails: task.taskEmails
        .getItems()
        .sort((left, right) => right.email.receivedAt.getTime() - left.email.receivedAt.getTime())
        .map((link) => ({
          id: link.email.id,
          sender: link.email.sender,
          subject: link.email.subject,
          snippet: link.email.snippet,
          receivedAt: link.email.receivedAt.toISOString(),
        })),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
