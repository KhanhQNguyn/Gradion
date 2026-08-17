import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../src/api.js';
import ProjectListPage from '../src/pages/ProjectListPage.jsx';
import { summary, runningState } from './fixtures.js';

vi.mock('../src/api.js', () => ({
  api: { listProjects: vi.fn() },
}));

beforeEach(() => {
  window.location.hash = '';
});

describe('ProjectListPage', () => {
  test('shows a skeleton while loading, then the empty state once the list resolves empty', async () => {
    let resolveList;
    api.listProjects.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      })
    );

    render(<ProjectListPage />);

    const list = screen.getByRole('list');
    expect(list).toHaveAttribute('aria-busy', 'true');

    resolveList([]);

    await waitFor(() => expect(screen.getByText('No projects yet')).toBeInTheDocument());
    expect(screen.getByText('Start your first project')).toBeInTheDocument();
  });

  test('a row renders its status pill and progress strip', async () => {
    api.listProjects.mockResolvedValue([summary({ id: 'prj_row1', title: 'Row One' })]);

    render(<ProjectListPage />);

    await waitFor(() => expect(screen.getByText('Row One')).toBeInTheDocument());
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /0 of 5 steps done/ })).toBeInTheDocument();
  });

  test('a row with a live step names it', async () => {
    api.listProjects.mockResolvedValue([
      summary({
        id: 'prj_row2',
        title: 'In Progress Row',
        status: 'in_progress',
        stepState: runningState('portraits'),
      }),
    ]);

    render(<ProjectListPage />);

    await waitFor(() => expect(screen.getByText('In Progress Row')).toBeInTheDocument());
    expect(screen.getByText(/Painting the character portraits/)).toBeInTheDocument();
  });

  test('a stalled project is flagged in its row', async () => {
    api.listProjects.mockResolvedValue([
      summary({
        id: 'prj_row3',
        title: 'Stalled Row',
        status: 'in_progress',
        stepState: runningState('style', { stalled: true }),
      }),
    ]);

    render(<ProjectListPage />);

    await waitFor(() => expect(screen.getByText('Stalled Row')).toBeInTheDocument());
    expect(screen.getByText(/Defining the art style.*may be stuck/)).toBeInTheDocument();
  });

  test('clicking a row navigates to that project', async () => {
    const user = userEvent.setup();
    api.listProjects.mockResolvedValue([summary({ id: 'prj_nav123', title: 'Click Me' })]);

    render(<ProjectListPage />);

    await waitFor(() => expect(screen.getByText('Click Me')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Click Me/ }));

    expect(window.location.hash).toBe('#projects/prj_nav123');
  });

  test('a list-load failure surfaces a Banner instead of leaving the skeleton forever', async () => {
    api.listProjects.mockRejectedValue(new Error('Cannot reach the server.'));

    render(<ProjectListPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Cannot reach the server.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('renders one row per project, each with its own title', async () => {
    api.listProjects.mockResolvedValue([
      summary({ id: 'prj_a', title: 'Book A' }),
      summary({ id: 'prj_b', title: 'Book B' }),
      summary({ id: 'prj_c', title: 'Book C' }),
    ]);

    render(<ProjectListPage />);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(screen.getByText('Book A')).toBeInTheDocument();
    expect(screen.getByText('Book B')).toBeInTheDocument();
    expect(screen.getByText('Book C')).toBeInTheDocument();
  });

  test('a row shows a character-count chip once characters exist', async () => {
    api.listProjects.mockResolvedValue([
      summary({ id: 'prj_chars', title: 'With Characters', counts: { characters: 2, chapters: 0 } }),
    ]);

    render(<ProjectListPage />);

    await waitFor(() => expect(screen.getByText('With Characters')).toBeInTheDocument());
    expect(screen.getByText('2 characters')).toBeInTheDocument();
  });
});
