import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CategoryResponse,
  CreateTaskNote,
  TaskResponse,
  UpdateNextStep,
  UpdateTask,
} from '@morpheus/shared';
import { apiRequest } from '../../lib/api-client.js';
import { useAuth } from '../auth/use-auth.js';

export type TaskListEmptyState = 'none' | 'no-tasks' | 'filter-empty' | 'all-done';

interface UseTasksResult {
  tasks: TaskResponse[];
  categories: CategoryResponse[];
  selectedCategoryId: string | null;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  undoTask: TaskResponse | null;
  emptyState: TaskListEmptyState;
  setSelectedCategoryId: (categoryId: string | null) => void;
  refresh: () => Promise<void>;
  markDone: (task: TaskResponse) => Promise<void>;
  undoDone: () => Promise<void>;
  toggleNextStep: (taskId: string, stepId: string, completed: boolean) => Promise<void>;
  addNote: (taskId: string, body: string) => Promise<void>;
  dismissActionError: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useTasks(): UseTasksResult {
  const { getToken } = useAuth();
  const [allTasks, setAllTasks] = useState<TaskResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [undoTask, setUndoTask] = useState<TaskResponse | null>(null);
  const loadSequence = useRef(0);
  const statusVersions = useRef(new Map<string, number>());
  const statusRequests = useRef(new Map<string, Promise<boolean>>());

  const refresh = useCallback(async (): Promise<void> => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const requestOptions = { token: token ?? undefined };
      const [taskData, categoryData] = await Promise.all([
        apiRequest<TaskResponse[]>('/api/tasks?includeDone=true', requestOptions),
        apiRequest<CategoryResponse[]>('/api/categories', requestOptions),
      ]);

      if (sequence !== loadSequence.current) return;
      setAllTasks(taskData);
      setCategories(
        [...categoryData].sort(
          (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
        ),
      );
    } catch (loadError) {
      if (sequence !== loadSequence.current) return;
      setError(errorMessage(loadError, 'Tasks could not be loaded'));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tasks = useMemo(() => {
    const categoryOrder = new Map(
      categories.map((category, index) => [category.id, index] as const),
    );
    return allTasks
      .filter(
        (task) =>
          task.status === 'open' &&
          (selectedCategoryId === null || task.category.id === selectedCategoryId),
      )
      .sort(
        (left, right) =>
          (categoryOrder.get(left.category.id) ?? Number.MAX_SAFE_INTEGER) -
            (categoryOrder.get(right.category.id) ?? Number.MAX_SAFE_INTEGER) ||
          left.stackRank - right.stackRank ||
          left.createdAt.localeCompare(right.createdAt),
      );
  }, [allTasks, categories, selectedCategoryId]);

  const emptyState = useMemo<TaskListEmptyState>(() => {
    if (allTasks.length === 0) return 'no-tasks';
    if (selectedCategoryId !== null && tasks.length === 0) return 'filter-empty';
    if (allTasks.every((task) => task.status === 'done')) return 'all-done';
    return 'none';
  }, [allTasks, selectedCategoryId, tasks.length]);

  const nextStatusVersion = useCallback((taskId: string): number => {
    const version = (statusVersions.current.get(taskId) ?? 0) + 1;
    statusVersions.current.set(taskId, version);
    return version;
  }, []);

  const markDone = useCallback(
    async (task: TaskResponse): Promise<void> => {
      if (task.status === 'done') return;

      const version = nextStatusVersion(task.id);
      setActionError(null);
      setUndoTask(task);
      setAllTasks((current) =>
        current.map((candidate) =>
          candidate.id === task.id ? { ...candidate, status: 'done' } : candidate,
        ),
      );

      const request = (async (): Promise<boolean> => {
        try {
          const token = await getToken();
          const body: UpdateTask = { status: 'done' };
          await apiRequest<TaskResponse>(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            token: token ?? undefined,
            body: JSON.stringify(body),
          });
          return true;
        } catch (mutationError) {
          if (statusVersions.current.get(task.id) === version) {
            setAllTasks((current) =>
              current.map((candidate) =>
                candidate.id === task.id ? { ...candidate, status: 'open' } : candidate,
              ),
            );
            setUndoTask((current) => (current?.id === task.id ? null : current));
            setActionError(errorMessage(mutationError, 'Task could not be completed'));
          }
          return false;
        }
      })();

      statusRequests.current.set(task.id, request);
      await request;
    },
    [getToken, nextStatusVersion],
  );

  const undoDone = useCallback(async (): Promise<void> => {
    const task = undoTask;
    if (!task) return;

    const version = nextStatusVersion(task.id);
    const previousRequest = statusRequests.current.get(task.id);
    setActionError(null);
    setUndoTask(null);
    setAllTasks((current) =>
      current.map((candidate) =>
        candidate.id === task.id ? { ...candidate, status: 'open' } : candidate,
      ),
    );

    const request = (async (): Promise<boolean> => {
      const completionPersisted = previousRequest ? await previousRequest : true;
      if (!completionPersisted) return true;

      try {
        const token = await getToken();
        const body: UpdateTask = { status: 'open' };
        await apiRequest<TaskResponse>(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          token: token ?? undefined,
          body: JSON.stringify(body),
        });
        return true;
      } catch (mutationError) {
        if (statusVersions.current.get(task.id) === version) {
          setAllTasks((current) =>
            current.map((candidate) =>
              candidate.id === task.id ? { ...candidate, status: 'done' } : candidate,
            ),
          );
          setActionError(errorMessage(mutationError, 'Task completion could not be undone'));
        }
        return false;
      }
    })();

    statusRequests.current.set(task.id, request);
    await request;
  }, [getToken, nextStatusVersion, undoTask]);

  const toggleNextStep = useCallback(
    async (taskId: string, stepId: string, completed: boolean): Promise<void> => {
      const previousCompletedAt =
        allTasks.find((task) => task.id === taskId)?.nextSteps.find((step) => step.id === stepId)
          ?.completedAt ?? null;
      const completedAt = completed ? new Date().toISOString() : null;
      setActionError(null);
      setAllTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                nextSteps: task.nextSteps.map((step) =>
                  step.id === stepId ? { ...step, completedAt } : step,
                ),
              }
            : task,
        ),
      );

      try {
        const token = await getToken();
        const body: UpdateNextStep = { completed };
        await apiRequest(`/api/tasks/${taskId}/next-steps/${stepId}`, {
          method: 'PATCH',
          token: token ?? undefined,
          body: JSON.stringify(body),
        });
      } catch (mutationError) {
        setAllTasks((current) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  nextSteps: task.nextSteps.map((step) =>
                    step.id === stepId ? { ...step, completedAt: previousCompletedAt } : step,
                  ),
                }
              : task,
          ),
        );
        setActionError(errorMessage(mutationError, 'Next step could not be updated'));
      }
    },
    [allTasks, getToken],
  );

  const addNote = useCallback(
    async (taskId: string, body: string): Promise<void> => {
      setActionError(null);
      const token = await getToken();
      const payload: CreateTaskNote = { body };
      const updatedTask = await apiRequest<TaskResponse>(`/api/tasks/${taskId}/notes`, {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify(payload),
      });

      setAllTasks((current) => current.map((task) => (task.id === taskId ? updatedTask : task)));
    },
    [getToken],
  );

  const dismissActionError = useCallback((): void => setActionError(null), []);

  return {
    tasks,
    categories,
    selectedCategoryId,
    loading,
    error,
    actionError,
    undoTask,
    emptyState,
    setSelectedCategoryId,
    refresh,
    markDone,
    undoDone,
    toggleNextStep,
    addNote,
    dismissActionError,
  };
}
