import { z } from 'zod';

import { TaskPrioritySchema } from './task.js';

const LocalReferenceSchema = z.string().trim().min(1).max(50);

const NewCategorySchema = z
  .object({
    newCategoryRef: LocalReferenceSchema,
    name: z.string().trim().min(1).max(100),
    summary: z.string().trim().min(1).max(500),
  })
  .strict();

const NewTaskInExistingCategorySchema = z
  .object({
    newTaskRef: LocalReferenceSchema,
    categoryId: z.string().uuid(),
    label: z.string().trim().min(1).max(120),
  })
  .strict();

const NewTaskInNewCategorySchema = z
  .object({
    newTaskRef: LocalReferenceSchema,
    newCategoryRef: LocalReferenceSchema,
    label: z.string().trim().min(1).max(120),
  })
  .strict();

const ExistingTaskTargetSchema = z
  .object({
    taskId: z.string().uuid(),
  })
  .strict();

const NewTaskTargetSchema = z
  .object({
    newTaskRef: LocalReferenceSchema,
  })
  .strict();

const EmailRouteSchema = z
  .object({
    emailId: z.string().uuid(),
    targets: z
      .array(z.union([ExistingTaskTargetSchema, NewTaskTargetSchema]))
      .min(1)
      .max(20),
  })
  .strict();

const TaskWriteNextStepSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const ScreenDecisionSchema = z
  .object({
    actionable: z.boolean(),
    reason: z.string().trim().max(200),
  })
  .strict();

export const RouteDecisionSchema = z
  .object({
    newCategories: z.array(NewCategorySchema).max(20),
    newTasks: z
      .array(z.union([NewTaskInExistingCategorySchema, NewTaskInNewCategorySchema]))
      .max(50),
    routes: z.array(EmailRouteSchema).max(50),
  })
  .strict();

export const TaskWriteDecisionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    aiContext: z.string().trim().min(1).max(2000),
    recommendedAction: z.string().trim().min(1).max(1000).nullable(),
    nextSteps: z.array(TaskWriteNextStepSchema).max(20),
    dueDate: z.string().date().nullable(),
    priority: TaskPrioritySchema,
  })
  .strict();

export type ScreenDecision = z.infer<typeof ScreenDecisionSchema>;
export type RouteDecision = z.infer<typeof RouteDecisionSchema>;
export type TaskWriteDecision = z.infer<typeof TaskWriteDecisionSchema>;
