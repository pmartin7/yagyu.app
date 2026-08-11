import { Button } from '../../components/ui/button.js';
import { cn } from '../../lib/cn.js';
import { TaskCard } from './task-card.js';
import { useTasks } from './use-tasks.js';
import type { TaskListEmptyState } from './use-tasks.js';

const emptyContent: Record<TaskListEmptyState, { title: string; description: string } | null> = {
  none: null,
  'no-tasks': {
    title: 'No tasks yet',
    description: 'Tasks shaped from your inbox will gather here as Yagyu learns what needs action.',
  },
  'filter-empty': {
    title: 'Nothing in this category',
    description: 'Choose another category to see what needs your attention.',
  },
  'all-done': {
    title: 'All done',
    description: 'Your list is clear. Enjoy the quiet.',
  },
};

function LoadingTasks(): JSX.Element {
  return (
    <div className="space-y-3" role="status" aria-label="Loading tasks">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="min-h-28 animate-pulse rounded-xl border border-border bg-card p-4"
          aria-hidden="true"
        >
          <div className="ml-12 h-2.5 w-24 rounded-full bg-surface-alt" />
          <div className="ml-12 mt-3 h-4 w-3/4 rounded-full bg-surface-alt" />
          <div className="ml-12 mt-3 h-3 w-40 rounded-full bg-surface-alt" />
        </div>
      ))}
    </div>
  );
}

function LoadingFilters(): JSX.Element {
  return (
    <div className="-mx-4 flex h-11 gap-2 overflow-hidden px-4 sm:mx-0 sm:px-0" aria-hidden="true">
      {[72, 112, 96].map((width) => (
        <div
          key={width}
          className="h-11 shrink-0 animate-pulse rounded-full bg-surface-alt"
          style={{ width }}
        />
      ))}
    </div>
  );
}

interface EmptyTasksProps {
  state: Exclude<TaskListEmptyState, 'none'>;
}

function EmptyTasks({ state }: EmptyTasksProps): JSX.Element {
  const content = emptyContent[state];
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-10 text-left shadow-sm">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
        {content?.title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{content?.description}</p>
    </div>
  );
}

export function TaskList(): JSX.Element {
  const {
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
  } = useTasks();

  return (
    <section data-testid="task-list-region" aria-label="Task list" className="space-y-5">
      {!loading && !error && categories.length > 0 && (
        <div className="relative -mx-4 px-4 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-gradient-to-l after:from-surface after:to-transparent sm:mx-0 sm:px-0 sm:after:hidden">
          <div
            className="flex gap-2 overflow-x-auto pr-8 pb-2 sm:pr-0 sm:pb-1"
            role="group"
            aria-label="Filter tasks by category"
          >
            <button
              type="button"
              className={cn(
                'h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                selectedCategoryId === null
                  ? 'border-primary bg-card text-primary ring-1 ring-primary/20'
                  : 'border-border bg-card text-ink hover:border-border-strong',
              )}
              aria-pressed={selectedCategoryId === null}
              onClick={() => setSelectedCategoryId(null)}
            >
              All
            </button>
            {categories.map((category) => {
              const selected = selectedCategoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={cn(
                    'h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    selected
                      ? 'border-primary bg-card text-primary ring-1 ring-primary/20'
                      : 'border-border bg-card text-ink hover:border-border-strong',
                  )}
                  aria-pressed={selected}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {undoTask && (
        <div
          className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-2 shadow-sm"
          role="status"
        >
          <p className="min-w-0 truncate text-sm text-ink-muted">
            <span className="font-medium text-ink">Completed</span> {undoTask.title}
          </p>
          <button
            type="button"
            className="min-h-11 shrink-0 px-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => void undoDone()}
          >
            Undo
          </button>
        </div>
      )}

      {actionError && (
        <div
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card px-4 py-2"
          role="alert"
        >
          <p className="text-sm text-destructive">{actionError}</p>
          <button
            type="button"
            className="min-h-11 shrink-0 px-2 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Dismiss error"
            onClick={dismissActionError}
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && (
        <>
          <LoadingFilters />
          <LoadingTasks />
        </>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-destructive/30 bg-card px-5 py-6" role="alert">
          <h2 className="font-display text-lg font-semibold text-ink">Tasks could not be loaded</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{error}</p>
          <Button className="mt-4 min-h-11" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && emptyState !== 'none' && <EmptyTasks state={emptyState} />}

      {!loading && !error && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onMarkDone={markDone}
              onToggleNextStep={toggleNextStep}
              onAddNote={addNote}
            />
          ))}
        </div>
      )}
    </section>
  );
}
