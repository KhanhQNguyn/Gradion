export function Banner({ tone = 'info', title, children, spinner = false, action }) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {spinner && <span className="banner-spinner" aria-hidden="true" />}
      <div className="banner-body">
        {title && <p className="banner-title">{title}</p>}
        {children && <div className="banner-message">{children}</div>}
      </div>
      {action && <div className="banner-action">{action}</div>}
    </div>
  );
}

// No icon prop at all — an empty state is a sentence doing its job, not
// a decorated placeholder. If a page genuinely needs a visual anchor
// here, it's a plain hairline rule (see .empty-state-rule in
// styles.css), never a glyph standing in for "book" or "empty".
export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-rule" aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p className="empty-state-copy">{children}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
