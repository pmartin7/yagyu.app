import { useState } from 'react';
import type { TaskResponse } from '@morpheus/shared';
import { CheckIcon, ChevronDownIcon } from '../../components/icons.js';
import { cn } from '../../lib/cn.js';
import { TaskNoteComposer } from './task-note-composer.js';

interface TaskCardProps {
  task: TaskResponse;
  onMarkDone: (task: TaskResponse) => Promise<void>;
  onToggleNextStep: (taskId: string, stepId: string, completed: boolean) => Promise<void>;
  onAddNote: (taskId: string, body: string) => Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDueDate(dueDate: string): string {
  return dateFormatter.format(new Date(`${dueDate}T00:00:00`));
}

function isOverdue(task: TaskResponse): boolean {
  return task.status === 'open' && task.dueDate !== null && task.dueDate < localDateKey(new Date());
}

function formatTimestamp(timestamp: string): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

export function TaskCard({
  task,
  onMarkDone,
  onToggleNextStep,
  onAddNote,
}: TaskCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const done = task.status === 'done';
  const overdue = isOverdue(task);
  const completedSteps = task.nextSteps.filter((step) => step.completedAt !== null).length;
  const detailsId = `task-details-${task.id}`;
  const titleId = `task-title-${task.id}`;

  return (
    <article
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      aria-labelledby={titleId}
    >
      <div className="flex min-h-28 items-stretch">
        <div className="flex shrink-0 items-center pl-2 sm:pl-3">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:text-ink-muted"
            aria-label={done ? 'Task completed' : `Mark “${task.title}” done`}
            disabled={done}
            onClick={() => void onMarkDone(task)}
          >
            <span
              id={titleId}
              role="heading"
              aria-level={2}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border-2',
                done ? 'border-ink-muted bg-ink-muted text-card' : 'border-primary',
              )}
              aria-hidden="true"
            >
              {done && <CheckIcon className="h-4 w-4" />}
            </span>
          </button>
        </div>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 px-2 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 sm:px-3"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-ink-muted">
              {task.category.name}
            </span>
            <span
              className={cn(
                'mt-1.5 block text-[0.9375rem] font-semibold leading-snug',
                done ? 'text-ink-muted line-through' : 'text-ink',
              )}
            >
              {task.title}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
              {task.dueDate && (
                <span className={overdue ? 'font-medium text-destructive' : undefined}>
                  {overdue ? 'Overdue ' : 'Due '}
                  {formatDueDate(task.dueDate)}
                </span>
              )}
              {task.dueDate && task.nextSteps.length > 0 && <span aria-hidden="true">·</span>}
              {task.nextSteps.length > 0 && (
                <span>
                  {completedSteps}/{task.nextSteps.length} steps
                </span>
              )}
              {(task.dueDate || task.nextSteps.length > 0) && task.notes.length > 0 && (
                <span aria-hidden="true">·</span>
              )}
              {task.notes.length > 0 && (
                <span>
                  {task.notes.length} {task.notes.length === 1 ? 'note' : 'notes'}
                </span>
              )}
            </span>
          </span>
          <ChevronDownIcon
            className={cn(
              'h-5 w-5 shrink-0 text-ink-muted transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>

      {expanded && (
        <div id={detailsId} className="space-y-6 border-t border-border px-4 py-5 sm:px-6">
          {task.aiContext && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Why it matters
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">{task.aiContext}</p>
            </section>
          )}

          {task.aiRecommendedAction && (
            <section className="border-l-2 border-primary pl-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Recommended action
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">{task.aiRecommendedAction}</p>
            </section>
          )}

          {task.nextSteps.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Next steps
              </h3>
              <ul className="mt-2 divide-y divide-border" aria-label="Task checklist">
                {task.nextSteps.map((step) => {
                  const stepComplete = step.completedAt !== null;
                  return (
                    <li key={step.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm focus-within:ring-2 focus-within:ring-primary/40">
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-primary"
                          checked={stepComplete}
                          onChange={() => void onToggleNextStep(task.id, step.id, !stepComplete)}
                        />
                        <span className={stepComplete ? 'text-ink-muted line-through' : 'text-ink'}>
                          {step.title}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {task.linkedEmails.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Linked emails
              </h3>
              <div className="mt-3 space-y-2">
                {task.linkedEmails.map((email) => (
                  <article key={email.id} className="rounded-lg border border-border px-3 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-medium text-ink">{email.subject}</p>
                      <time className="text-sm text-ink-muted" dateTime={email.receivedAt}>
                        {formatTimestamp(email.receivedAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{email.sender}</p>
                    {email.snippet && (
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{email.snippet}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Notes</h3>
            {task.notes.length > 0 && (
              <ul className="mt-3 space-y-3">
                {task.notes.map((note) => (
                  <li key={note.id} className="border-l border-border pl-3">
                    <p className="text-sm leading-relaxed text-ink">{note.body}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                      <time dateTime={note.createdAt}>{formatTimestamp(note.createdAt)}</time>
                      {note.analysisQueued && <span>Re-analysis queued</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <TaskNoteComposer onSave={(body) => onAddNote(task.id, body)} />
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
