export const STATUS_LABELS = {
  draft: 'Draft',
  in_progress: 'In progress',
  done: 'Done',
  error: 'Needs attention',
};

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatElapsed(startedAt, now = Date.now()) {
  const elapsedMs = Math.max(0, now - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(elapsedMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function pluralise(count, word) {
  return count === 1 ? word : `${word}s`;
}
