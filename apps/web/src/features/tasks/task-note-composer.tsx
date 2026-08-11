import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { PlusIcon } from '../../components/icons.js';
import { Button } from '../../components/ui/button.js';

interface TaskNoteComposerProps {
  onSave: (body: string) => Promise<void>;
}

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  const maxHeight = 240;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

export function TaskNoteComposer({ onSave }: TaskNoteComposerProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  useEffect(() => {
    if (!expanded || !textareaRef.current) return;
    textareaRef.current.focus();
    resizeTextarea(textareaRef.current);
  }, [expanded]);

  const collapse = (): void => {
    setExpanded(false);
    setBody('');
    setError(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setBody(event.target.value);
    setError(null);
    resizeTextarea(event.target);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError('Write a note before saving.');
      textareaRef.current?.focus();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(trimmedBody);
      collapse();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Note could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-expanded="false"
        onClick={() => setExpanded(true)}
      >
        <PlusIcon className="h-4 w-4" />
        Add a note
      </button>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      <label className="sr-only" htmlFor={fieldId}>
        Note for Yagyu
      </label>
      <textarea
        ref={textareaRef}
        id={fieldId}
        value={body}
        rows={3}
        maxLength={4000}
        disabled={saving}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="block min-h-24 max-h-60 w-full resize-none rounded-lg border border-border-strong bg-card px-3 py-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-wait disabled:opacity-50"
        placeholder="Add context Yagyu should consider…"
        onChange={handleChange}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={saving}
          onClick={collapse}
        >
          Cancel
        </Button>
        <Button type="submit" className="min-h-11" disabled={saving}>
          {saving ? 'Saving…' : 'Save note'}
        </Button>
      </div>
    </form>
  );
}
