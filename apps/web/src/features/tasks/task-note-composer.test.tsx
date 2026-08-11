import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskNoteComposer } from './task-note-composer.js';

describe('TaskNoteComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands and focuses the note field', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TaskNoteComposer onSave={vi.fn()} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Add a note' }));

    // Assert
    expect(screen.getByRole('textbox', { name: 'Note for Yagyu' })).toHaveFocus();
  });

  it('rejects blank input without saving', async () => {
    // Arrange
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TaskNoteComposer onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    await user.type(screen.getByRole('textbox', { name: 'Note for Yagyu' }), '   ');

    // Act
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Write a note before saving.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves trimmed input and collapses after success', async () => {
    // Arrange
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TaskNoteComposer onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Note for Yagyu' }),
      '  Use the revised contract.  ',
    );

    // Act
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith('Use the revised contract.');
    expect(screen.getByRole('button', { name: 'Add a note' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Note for Yagyu' })).not.toBeInTheDocument();
  });
});
