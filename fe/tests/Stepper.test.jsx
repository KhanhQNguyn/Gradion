import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { stepVisualState, Stepper, ProgressStrip } from '../src/components/Stepper.jsx';
import { steps } from './fixtures.js';

describe('stepVisualState', () => {
  test('a stalled step reads as an error, never as healthy progress', () => {
    const runningStep = { key: 'style', status: 'running', stalled: true };
    expect(stepVisualState(runningStep, 0, 0)).toBe('error');
  });

  test('a failed step never renders as current', () => {
    const erroredStep = { key: 'style', status: 'error', stalled: false };
    // Even if its index happens to equal currentIndex, error wins.
    expect(stepVisualState(erroredStep, 0, 0)).toBe('error');
  });

  test('done, running, current, and pending each resolve distinctly', () => {
    expect(stepVisualState({ status: 'done', stalled: false }, 0, 2)).toBe('done');
    expect(stepVisualState({ status: 'running', stalled: false }, 1, 2)).toBe('running');
    expect(stepVisualState({ status: 'pending', stalled: false }, 2, 2)).toBe('current');
    expect(stepVisualState({ status: 'pending', stalled: false }, 3, 2)).toBe('pending');
  });
});

describe('Stepper', () => {
  test('renders each step with a distinct data-state and accessible text', () => {
    // style done, characters running, portraits is the next not-done step
    // (so it reads as "current"), chapters/illustrations still pending.
    const stepList = steps('done', 'running');
    render(<Stepper steps={stepList} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);

    expect(items[0]).toHaveAttribute('data-state', 'done');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[1]).toHaveAttribute('data-state', 'running');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveAttribute('data-state', 'pending');
    expect(items[2]).not.toHaveAttribute('aria-current');
    expect(items[3]).toHaveAttribute('data-state', 'pending');

    expect(screen.getByText('Step 1: Art style — done')).toBeInTheDocument();
    expect(screen.getByText('Step 2: Characters — in progress')).toBeInTheDocument();
    expect(screen.getByText('Step 3: Portraits — not started')).toBeInTheDocument();
  });

  test('the first not-done step reads as "current" when it is merely pending, not running', () => {
    const stepList = steps('done', 'done');
    render(<Stepper steps={stepList} />);

    const items = screen.getAllByRole('listitem');
    expect(items[2]).toHaveAttribute('data-state', 'current');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Step 3: Portraits — up next')).toBeInTheDocument();
  });

  test('a stalled step renders data-state="error" in the stepper, not "running"', () => {
    const stepList = steps('done', 'running');
    stepList[1].stalled = true;
    render(<Stepper steps={stepList} />);

    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('data-state', 'error');
    expect(screen.getByText('Step 2: Characters — needs attention')).toBeInTheDocument();
  });

  test('no step ever renders a check, bang, or other pictographic character as its marker', () => {
    const stepList = steps('done', 'error');
    render(<Stepper steps={stepList} />);

    const markers = screen.getAllByText(/^[0-9]$/, { selector: '.stepper-marker' });
    expect(markers).toHaveLength(5);
    markers.forEach((marker, index) => expect(marker).toHaveTextContent(String(index + 1)));
  });
});

describe('ProgressStrip', () => {
  test('reports "N of M steps done" as an accessible label and renders one segment per step', () => {
    const stepList = steps('done', 'done', 'running');
    const { container } = render(<ProgressStrip steps={stepList} />);

    expect(screen.getByRole('img', { name: '2 of 5 steps done' })).toBeInTheDocument();
    expect(container.querySelectorAll('.progress-seg')).toHaveLength(5);
  });

  test('a stalled step colours its segment as an error, not as running', () => {
    const stepList = steps('running');
    stepList[0].stalled = true;
    const { container } = render(<ProgressStrip steps={stepList} />);

    const first = container.querySelector('.progress-seg');
    expect(first).toHaveClass('progress-seg--error');
    expect(first).not.toHaveClass('progress-seg--running');
  });
});
