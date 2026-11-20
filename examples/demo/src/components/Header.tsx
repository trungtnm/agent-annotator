export function Header() {
  return (
    <header className="header">
      <div>
        <p className="eyebrow">Thursday, November 20</p>
        <h1>Good morning, Jamie</h1>
      </div>
      <div className="header-actions">
        <label className="search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input placeholder="Search orders, customers…" />
        </label>
        {/* Deliberately the weaker style: the main action of the page should stand out. */}
        <button type="button" className="btn ghost">
          New order
        </button>
      </div>
    </header>
  );
}
