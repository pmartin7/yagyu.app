import { z } from 'zod';

const ManagedBySchema = z.enum(['ai', 'user']);
const RankingModeSchema = z.enum(['ai', 'manual']);
const TaskStatusSchema = z.enum(['open', 'done']);

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

const TaskCategorySummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    summary: z.string(),
  })
  .strict();

const TaskNextStepResponseSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    completedAt: z.string().datetime().nullable(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

const TaskNoteResponseSchema = z
  .object({
    id: z.string().uuid(),
    body: z.string(),
    createdAt: z.string().datetime(),
    analysisQueued: z.boolean().default(false),
  })
  .strict();

const TaskLinkedEmailResponseSchema = z
  .object({
    id: z.string().uuid(),
    sender: z.string(),
    subject: z.string(),
    snippet: z.string(),
    receivedAt: z.string().datetime(),
  })
  .strict();

export const CategoryResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    summary: z.string(),
    managedBy: ManagedBySchema,
    rankingMode: RankingModeSchema,
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

export const TaskResponseSchema = z
  .object({
    id: z.string().uuid(),
    category: TaskCategorySummarySchema,
    title: z.string(),
    status: TaskStatusSchema,
    dueDate: z.string().date().nullable(),
    priority: TaskPrioritySchema,
    stackRank: z.number().finite(),
    managedBy: ManagedBySchema,
    aiContext: z.string().nullable(),
    aiRecommendedAction: z.string().nullable(),
    nextSteps: z.array(TaskNextStepResponseSchema),
    notes: z.array(TaskNoteResponseSchema),
    linkedEmails: z.array(TaskLinkedEmailResponseSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const TaskListQuerySchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    includeDone: z.preprocess((value) => {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }, z.boolean().optional()),
  })
  .strict();

export const UpdateTaskSchema = z
  .object({
    status: TaskStatusSchema.optional(),
    stackRank: z.number().finite().nonnegative().optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.stackRank !== undefined, {
    message: 'At least one of status or stackRank is required',
  });

export const UpdateNextStepSchema = z
  .object({
    completed: z.boolean(),
  })
  .strict();

export const CreateTaskNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type CategoryResponse = z.infer<typeof CategoryResponseSchema>;
export type TaskResponse = z.infer<typeof TaskResponseSchema>;
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type UpdateNextStep = z.infer<typeof UpdateNextStepSchema>;
export type CreateTaskNote = z.infer<typeof CreateTaskNoteSchema>;
