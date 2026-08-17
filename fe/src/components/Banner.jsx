export function Banner({ tone = 'info', title, children, spinner = false, action }) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {spinner && <span className="banner__spinner" aria-hidden="true" />}
      <div className="banner__body">
        {title && <p className="banner__title">{title}</p>}
        {children && <div className="banner__message">{children}</div>}
      </div>
      {action && <div className="banner__action">{action}</div>}
    </div>
  );
}

// No icon prop at all — an empty state is a sentence doing its job, not
// a decorated placeholder. The visual anchor (.empty__icon) is a plain
// hairline ring, never a glyph standing in for "book" or "empty".
export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p className="empty__copy">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
