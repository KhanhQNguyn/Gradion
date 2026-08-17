const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

const STATE_DESCRIPTIONS = {
  done: 'done',
  running: 'in progress',
  current: 'up next',
  error: 'needs attention',
  pending: 'not started',
};

export function stepVisualState(step, index, currentIndex) {
  if (step.stalled) return 'error';
  if (step.status === 'running') return 'running';
  if (step.status === 'done') return 'done';
  if (step.status === 'error') return 'error';
  if (index === currentIndex) return 'current';
  return 'pending';
}

// The first not-done step, purely for highlighting which item is "up
// next" in the rail — a display index, not a permission decision. The
// server already decided what's runnable; this never gates anything.
function findCurrentIndex(steps) {
  return steps.findIndex((step) => step.status !== 'done');
}

// A table-of-contents rail — "I · Style   II · Characters   ..." in
// Fraunces — not a checkmark progress bar. Done/current/pending/error
// render as a dot fill keyed off data-state; never a check or bang
// character in the markup.
export function Stepper({ steps }) {
  const currentIndex = findCurrentIndex(steps);

  return (
    <ol className="stepper">
      {steps.map((step, index) => {
        const visualState = stepVisualState(step, index, currentIndex);
        const isCurrent = visualState === 'current' || visualState === 'running';

        return (
          <li
            key={step.key}
            className="step"
            data-state={visualState}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="step__marker" aria-hidden="true">
              <span className="step__numeral">{ROMAN[index]}</span>
            </span>
            <span className="step__label">{step.label}</span>
            <span className="sr-only">
              Step {index + 1}: {step.label} — {STATE_DESCRIPTIONS[visualState]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// A compact strip of coloured segments used in project list rows.
export function ProgressStrip({ steps }) {
  const currentIndex = findCurrentIndex(steps);
  const done = steps.filter((step) => step.status === 'done').length;

  return (
    <div
      className="progress-strip"
      role="img"
      aria-label={`${done} of ${steps.length} steps done`}
    >
      {steps.map((step, index) => {
        const visualState = stepVisualState(step, index, currentIndex);
        return (
          <span
            key={step.key}
            className={`progress-strip__seg progress-strip__seg--${visualState}`}
          />
        );
      })}
    </div>
  );
}
