import { describe, expect, it } from 'vitest';

import { RouteDecisionSchema, ScreenDecisionSchema, TaskWriteDecisionSchema } from './triage.js';

const CATEGORY_ID = '10000000-0000-4000-8000-000000000001';
const TASK_ID = '20000000-0000-4000-8000-000000000002';
const EMAIL_ID = '30000000-0000-4000-8000-000000000003';

describe('triage schemas', () => {
  it('accepts valid screen, route, and writer decisions', () => {
    // Arrange
    const screen = { actionable: true, reason: 'A reply is requested.' };
    const route = {
      newCategories: [],
      newTasks: [{ newTaskRef: 'reply-task', categoryId: CATEGORY_ID, label: 'Reply' }],
      routes: [{ emailId: EMAIL_ID, targets: [{ taskId: TASK_ID }] }],
    };
    const write = {
      title: 'Reply to the client',
      aiContext: 'The client asked for confirmation.',
      recommendedAction: 'Confirm the date.',
      nextSteps: [{ title: 'Review the proposed date' }],
      dueDate: '2026-08-10',
      priority: 'high',
    };

    // Act
    const results = [
      ScreenDecisionSchema.safeParse(screen),
      RouteDecisionSchema.safeParse(route),
      TaskWriteDecisionSchema.safeParse(write),
    ];

    // Assert
    expect(results.every((result) => result.success)).toBe(true);
  });

  it.each([
    {
      name: 'a new task declaring both category reference forms',
      decision: {
        newCategories: [],
        newTasks: [
          {
            newTaskRef: 'reply-task',
            categoryId: CATEGORY_ID,
            newCategoryRef: 'new-category',
            label: 'Reply',
          },
        ],
        routes: [],
      },
    },
    {
      name: 'a route target declaring both task reference forms',
      decision: {
        newCategories: [],
        newTasks: [],
        routes: [
          {
            emailId: EMAIL_ID,
            targets: [{ taskId: TASK_ID, newTaskRef: 'reply-task' }],
          },
        ],
      },
    },
    {
      name: 'a route target declaring neither task reference form',
      decision: {
        newCategories: [],
        newTasks: [],
        routes: [{ emailId: EMAIL_ID, targets: [{}] }],
      },
    },
  ])('rejects malformed XOR references: $name', ({ decision }) => {
    // Arrange
    const malformedDecision = decision;

    // Act
    const result = RouteDecisionSchema.safeParse(malformedDecision);

    // Assert
    expect(result.success).toBe(false);
  });

  it.each(['2026-8-10', '2026-02-30', '2026-08-10T00:00:00.000Z'])(
    'rejects writer due date that is not a valid date-only value: %s',
    (dueDate) => {
      // Arrange
      const decision = {
        title: 'Reply',
        aiContext: 'A reply is needed.',
        recommendedAction: null,
        nextSteps: [],
        dueDate,
        priority: 'medium',
      };

      // Act
      const result = TaskWriteDecisionSchema.safeParse(decision);

      // Assert
      expect(result.success).toBe(false);
    },
  );
});
