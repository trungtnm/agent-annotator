import { navigate } from '../router';

const NAV = [
  { label: 'Overview', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { label: 'Orders', href: '/', icon: 'M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z' },
  { label: 'Products', icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8' },
  { label: 'Customers', href: '/customers', icon: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0' },
  { label: 'Analytics', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' },
];

export function Sidebar(props: { readonly path: string }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Lumen
      </div>
      <nav className="nav">
        {NAV.map((item) => (
          <a
            key={item.label}
            href={item.href ?? '#'}
            className={item.href === props.path ? 'nav-item active' : 'nav-item'}
            onClick={(event) => {
              if (item.href === undefined) return;
              event.preventDefault();
              navigate(item.href);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={item.icon} />
            </svg>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="avatar">JD</div>
        <div>
          <div className="who">Jamie Doe</div>
          <div className="role">Store owner</div>
        </div>
      </div>
    </aside>
  );
}
