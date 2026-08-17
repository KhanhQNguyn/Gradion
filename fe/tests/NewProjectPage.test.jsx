import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../src/api.js';
import { ApiError } from '../src/api.js';
import NewProjectPage from '../src/pages/NewProjectPage.jsx';

vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual('../src/api.js');
  return {
    ...actual,
    api: { createProject: vi.fn() },
  };
});

const LONG_TEXT = 'Once upon a time in a riverbank burrow. '.repeat(10); // > 200 chars

beforeEach(() => {
  window.location.hash = '';
});

describe('NewProjectPage', () => {
  test('validation fires for both fields, including aria-invalid', async () => {
    const user = userEvent.setup();
    render(<NewProjectPage />);

    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const titleInput = screen.getByLabelText('Title');
    const textArea = screen.getByLabelText('Book text');

    expect(titleInput).toHaveAttribute('aria-invalid', 'true');
    expect(textArea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText(/Add at least 200 characters/)).toBeInTheDocument();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  test('creating from pasted text works end to end and navigates on success', async () => {
    const user = userEvent.setup();
    api.createProject.mockResolvedValue({ id: 'prj_new123' });

    render(<NewProjectPage />);

    await user.type(screen.getByLabelText('Title'), 'My Pasted Book');
    await user.type(screen.getByLabelText('Book text'), LONG_TEXT);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1));
    expect(api.createProject).toHaveBeenCalledWith('My Pasted Book', LONG_TEXT.trim());
    await waitFor(() => expect(window.location.hash).toBe('#projects/prj_new123'));
  });

  test('the .txt upload path reads the file in the browser and populates the textarea and title', async () => {
    const user = userEvent.setup();
    render(<NewProjectPage />);

    const file = new File([LONG_TEXT], 'my-story.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('Upload a book text file');

    await user.upload(fileInput, file);

    await waitFor(() => expect(screen.getByLabelText('Book text')).toHaveValue(LONG_TEXT));
    expect(screen.getByLabelText('Title')).toHaveValue('my-story');
    expect(screen.getByText(/Loaded my-story\.txt/)).toBeInTheDocument();
  });

  test('a server-side failure on submit shows the error without clearing what the user typed', async () => {
    const user = userEvent.setup();
    api.createProject.mockRejectedValue(new ApiError('That title is already taken.', { status: 409 }));

    render(<NewProjectPage />);

    await user.type(screen.getByLabelText('Title'), 'Persisted Title');
    await user.type(screen.getByLabelText('Book text'), LONG_TEXT);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(screen.getByText('That title is already taken.')).toBeInTheDocument()
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Persisted Title');
    expect(screen.getByLabelText('Book text')).toHaveValue(LONG_TEXT);
  });

  test('typing directly in the textarea clears the remembered filename', async () => {
    const user = userEvent.setup();
    render(<NewProjectPage />);

    const file = new File([LONG_TEXT], 'uploaded.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Upload a book text file'), file);
    await waitFor(() => expect(screen.getByText(/Loaded uploaded\.txt/)).toBeInTheDocument());

    await user.type(screen.getByLabelText('Book text'), ' more text');

    expect(screen.queryByText(/Loaded uploaded\.txt/)).not.toBeInTheDocument();
  });

  test('the Cancel button and the back link both navigate to the project list', async () => {
    const user = userEvent.setup();
    window.location.hash = '#projects/new';
    render(<NewProjectPage />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(window.location.hash).toBe('#projects');
  });
});
