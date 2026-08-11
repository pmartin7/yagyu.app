import { describe, expect, it } from 'vitest';

import { CreateTaskNoteSchema, TaskResponseSchema, UpdateTaskSchema } from './task.js';

describe('task schemas', () => {
  it('accepts a valid task response contract', () => {
    // Arrange
    const task = {
      id: '10000000-0000-4000-8000-000000000001',
      category: {
        id: '20000000-0000-4000-8000-000000000002',
        name: 'Client work',
        summary: 'Work that needs a client response',
      },
      title: 'Reply to the contract question',
      status: 'open',
      dueDate: '2026-08-10',
      priority: 'high',
      stackRank: 1,
      managedBy: 'ai',
      aiContext: 'The client is waiting.',
      aiRecommendedAction: 'Confirm the revised date.',
      nextSteps: [],
      notes: [],
      linkedEmails: [],
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    };

    // Act
    const result = TaskResponseSchema.safeParse(task);

    // Assert
    expect(result.success).toBe(true);
  });

  it('rejects an empty task update', () => {
    // Arrange
    const update = {};

    // Act
    const result = UpdateTaskSchema.safeParse(update);

    // Assert
    expect(result.success).toBe(false);
  });

  it.each(['2026-8-9', '2026-02-30', '2026-08-09T00:00:00.000Z'])(
    'rejects invalid date-only due date %s',
    (dueDate) => {
      // Arrange
      const task = {
        id: '10000000-0000-4000-8000-000000000001',
        category: {
          id: '20000000-0000-4000-8000-000000000002',
          name: 'Client work',
          summary: 'Work that needs a client response',
        },
        title: 'Reply',
        status: 'open',
        dueDate,
        priority: 'medium',
        stackRank: 0,
        managedBy: 'ai',
        aiContext: null,
        aiRecommendedAction: null,
        nextSteps: [],
        notes: [],
        linkedEmails: [],
        createdAt: '2026-08-09T12:00:00.000Z',
        updatedAt: '2026-08-09T12:00:00.000Z',
      };

      // Act
      const result = TaskResponseSchema.safeParse(task);

      // Assert
      expect(result.success).toBe(false);
    },
  );

  it.each(['', '   ', '\n\t'])('rejects blank notes', (body) => {
    // Arrange
    const note = { body };

    // Act
    const result = CreateTaskNoteSchema.safeParse(note);

    // Assert
    expect(result.success).toBe(false);
  });
});
