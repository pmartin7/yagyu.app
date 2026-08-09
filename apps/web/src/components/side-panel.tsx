import { NavLink } from 'react-router-dom';
import { useEmailAccounts } from '../features/email-accounts/use-email-accounts.js';
import { ChecklistIcon, GmailIcon, SettingsIcon, SyncIcon } from './icons.js';
import { cn } from '../lib/cn.js';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return cn(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-surface-alt text-primary' : 'text-ink hover:bg-surface-alt',
  );
}

export function SidePanel({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const { accounts, loading } = useEmailAccounts();

  return (
    <nav className="flex h-full w-full flex-col gap-6 p-4">
      <NavLink to="/tasks" className={navLinkClassName} onClick={onNavigate}>
        <ChecklistIcon className="h-4 w-4" />
        Tasks
      </NavLink>

      <div className="flex flex-col gap-2">
        <p className="px-3 font-mono text-xs font-medium tracking-[0.25em] text-ink-muted">
          SOURCES
        </p>

        {loading && <p className="px-3 text-sm text-ink-muted">Loading…</p>}

        {!loading && accounts.length === 0 && (
          <p className="px-3 text-sm text-ink-muted">No accounts linked</p>
        )}

        {accounts.length > 0 && (
          <ul className="flex flex-col gap-1">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink"
              >
                <GmailIcon className="h-4 w-4 shrink-0 text-ink-muted" />
                <span className="flex-1 truncate">{account.emailAddress}</span>
                {/* Decorative only — sync is not implemented yet, so this is
                    never a button: giving it click semantics would promise
                    behavior that doesn't exist. */}
                <span aria-hidden="true" title="Sync">
                  <SyncIcon className="h-3.5 w-3.5 text-ink-muted" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn(navLinkClassName({ isActive }), 'mt-auto border-t border-border pt-4')
        }
        onClick={onNavigate}
      >
        <SettingsIcon className="h-4 w-4" />
        Settings
      </NavLink>
    </nav>
  );
}
