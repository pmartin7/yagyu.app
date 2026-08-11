import { act, renderHook, waitFor } from '@testing-library/react';
import type { CategoryResponse, TaskResponse } from '@morpheus/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('../../lib/api-client.js', () => ({
  apiRequest: mocks.apiRequest,
}));

vi.mock('../auth/use-auth.js', () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));

import { useTasks } from './use-tasks.js';

const category: CategoryResponse = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Client work',
  summary: 'Client follow-ups',
  managedBy: 'ai',
  rankingMode: 'ai',
  sortOrder: 0,
};

const task: TaskResponse = {
  id: '20000000-0000-4000-8000-000000000002',
  category,
  title: 'Reply to client',
  status: 'open',
  dueDate: null,
  priority: 'high',
  stackRank: 0,
  managedBy: 'ai',
  aiContext: null,
  aiRecommendedAction: null,
  nextSteps: [],
  notes: [],
  linkedEmails: [],
  createdAt: '2026-08-09T10:00:00.000Z',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

describe('useTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue('token');
  });

  it('optimistically removes a completed task and rolls it back when the API fails', async () => {
    // Arrange
    let rejectUpdate: (reason: Error) => void = () => undefined;
    const update = new Promise<never>((_resolve, reject) => {
      rejectUpdate = reject;
    });
    mocks.apiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/api/tasks?includeDone=true') return Promise.resolve([task]);
      if (path === '/api/categories') return Promise.resolve([category]);
      if (options?.method === 'PATCH') return update;
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tasks).toEqual([task]);

    // Act
    let mutation: Promise<void> | undefined;
    act(() => {
      mutation = result.current.markDone(task);
    });

    // Assert
    expect(result.current.tasks).toEqual([]);

    // Act
    await act(async () => {
      rejectUpdate(new Error('Completion failed'));
      await mutation;
    });

    // Assert
    expect(result.current.tasks).toEqual([task]);
    expect(result.current.undoTask).toBeNull();
    expect(result.current.actionError).toBe('Completion failed');
  });
});
