import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../src/api.js';
import ProjectDetailPage from '../src/pages/ProjectDetailPage.jsx';
import { makeProject, steps, runningState, character } from './fixtures.js';

vi.mock('../src/api.js', () => ({
  api: {
    getProject: vi.fn(),
    runStep: vi.fn(),
    resetStuckStep: vi.fn(),
    getBook: vi.fn(),
  },
}));

beforeEach(() => {
  api.getBook.mockResolvedValue('Once upon a time...');
});

describe('ProjectDetailPage', () => {
  test('the in-progress state names the running step and shows elapsed time', async () => {
    const project = makeProject({
      status: 'in_progress',
      currentStep: 'style',
      stepState: runningState('style', { secondsAgo: 5 }),
      steps: steps('running'),
    });
    api.getProject.mockResolvedValue(project);

    render(<ProjectDetailPage projectId="prj_test1" />);

    expect(await screen.findByText('Defining the art style…')).toBeInTheDocument();
    expect(screen.getByText(/Running for \d+s/)).toBeInTheDocument();
  });

  test('the action button is disabled while a step is claimed', async () => {
    const project = makeProject({
      status: 'in_progress',
      currentStep: 'style',
      stepState: runningState('style'),
      steps: steps('running'),
    });
    api.getProject.mockResolvedValue(project);

    render(<ProjectDetailPage projectId="prj_test1" />);

    const button = await screen.findByRole('button', { name: 'Working…' });
    expect(button).toBeDisabled();
  });

  test('per-item image progress: one portrait rendered, the next still shows its running placeholder', async () => {
    const project = makeProject({
      status: 'in_progress',
      currentStep: 'portraits',
      stepState: runningState('portraits'),
      steps: steps('done', 'done', 'running'),
      characters: [
        character(0, { name: 'Mr. Toad', image: 'character-1-mr-toad.png', imageStatus: 'done', imageUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c3/E.H._Shepard_illustration_of_Mr_Toad.jpg/250px-E.H._Shepard_illustration_of_Mr_Toad.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail' }),
        character(1, { name: 'Badger', imageStatus: 'running' }),
      ],
    });
    api.getProject.mockResolvedValue(project);

    render(<ProjectDetailPage projectId="prj_test1" />);

    await screen.findByText('Mr. Toad');
    expect(screen.getByRole('img', { name: 'Mr. Toad' })).toBeInTheDocument();

    expect(screen.getByText('Badger')).toBeInTheDocument();
    expect(screen.getByText('Generating…')).toBeInTheDocument();
  });

  test('the error banner appears and its retry button fires runStep with that step key only', async () => {
    const project = makeProject({
      status: 'error',
      currentStep: 'characters',
      stepState: null,
      steps: steps('done', 'error'),
    });
    project.steps[1].error = 'Gemini returned no usable characters.';
    project.steps[1].attempts = 2;
    api.getProject.mockResolvedValue(project);
    api.runStep.mockResolvedValue({ ...project });

    const user = userEvent.setup();
    render(<ProjectDetailPage projectId="prj_test1" />);

    expect(await screen.findByText('"Characters" failed')).toBeInTheDocument();
    expect(screen.getByText('Gemini returned no usable characters.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry this step' }));

    expect(api.runStep).toHaveBeenCalledTimes(1);
    expect(api.runStep).toHaveBeenCalledWith('prj_test1', 'characters', {});
  });

  test('the stalled-step affordance appears and its button calls resetStuckStep', async () => {
    const stalledSteps = steps('running');
    stalledSteps[0].stalled = true;
    const project = makeProject({
      status: 'in_progress',
      currentStep: 'style',
      stepState: runningState('style', { secondsAgo: 400, stalled: true }),
      steps: stalledSteps,
    });
    api.getProject.mockResolvedValue(project);
    api.resetStuckStep.mockResolvedValue({ ...project, stepState: null });

    const user = userEvent.setup();
    render(<ProjectDetailPage projectId="prj_test1" />);

    expect(await screen.findByText('"Defining the art style" looks stuck')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear and retry' }));

    expect(api.resetStuckStep).toHaveBeenCalledWith('prj_test1');
  });

  test('the finished state renders the "all five steps are done" card', async () => {
    const project = makeProject({
      status: 'done',
      currentStep: null,
      stepState: null,
      steps: steps('done', 'done', 'done', 'done', 'done'),
    });
    api.getProject.mockResolvedValue(project);

    render(<ProjectDetailPage projectId="prj_test1" />);

    expect(await screen.findByText('All five steps are done.')).toBeInTheDocument();
  });

  test('an art style card shows the text and whether it was user-supplied or generated', async () => {
    const project = makeProject({
      status: 'in_progress',
      currentStep: 'characters',
      steps: steps('done'),
      style: 'Bold linocut, two inks.',
      styleSource: 'user',
    });
    api.getProject.mockResolvedValue(project);

    render(<ProjectDetailPage projectId="prj_test1" />);

    expect(await screen.findByText('Bold linocut, two inks.')).toBeInTheDocument();
    expect(screen.getByText('yours')).toBeInTheDocument();
  });

  test('the characters section notes the 2-character server cap', async () => {
    const project = makeProject({
      status: 'in_progress',
      currentStep: 'portraits',
      steps: steps('done', 'done'),
      characters: [character(0), character(1)],
    });
    api.getProject.mockResolvedValue(project);

    render(<ProjectDetailPage projectId="prj_test1" />);

    expect(await screen.findByText('Adults only, capped at 2 by the server.')).toBeInTheDocument();
  });
});
