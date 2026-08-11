import { TaskList } from '../features/tasks/task-list.js';

export function TasksPage(): JSX.Element {
  return (
    <div className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-7">
          <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.25em] text-ink-muted">
            Your focus
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
            Tasks
          </h1>
        </header>
        <TaskList />
      </div>
    </div>
  );
}
