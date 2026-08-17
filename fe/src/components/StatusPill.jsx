import { STATUS_LABELS } from '../lib/format.js';

export default function StatusPill({ status }) {
  return (
    <span className={`pill pill--${status}`}>
      <span className="pill-dot" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
