import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/use-auth.js';
import { Button } from '../components/ui/button.js';
import { HankoMark } from '../components/hanko-mark.js';
import { UserAvatarMenu } from '../components/user-avatar-menu.js';
import { SidePanel } from '../components/side-panel.js';
import { Sheet, SheetContent } from '../components/ui/sheet.js';
import { MenuIcon } from '../components/icons.js';

const DESKTOP_QUERY = '(min-width: 1024px)';

// The desktop <aside> is gated on this hook rather than CSS (e.g. `hidden
// lg:flex`, always rendered): CSS-hiding it would keep SidePanel mounted below
// 1024px and double-fire useEmailAccounts()'s fetch. The mobile Sheet doesn't
// have that problem either way — Radix Dialog.Content isn't in the DOM while
// open={false} — but it shares this hook for symmetry with the <aside> branch.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event: MediaQueryListEvent): void => setIsDesktop(event.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
}

export function AppLayout(): JSX.Element {
  const { user, emailVerified } = useAuth();
  const isDesktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Withheld until verified: the panel's Settings/Sources links would only
  // bounce back to /verify-email. Sign-out stays reachable either way.
  const showPanel = Boolean(user && emailVerified);

  // Crossing into desktop width no longer renders the <Sheet> block at all,
  // but sheetOpen stays true in state — shrinking back below 1024px later
  // would reopen the drawer with no user action. Resetting it here keeps
  // "closed" the true state whenever the drawer isn't the active pattern.
  useEffect(() => {
    if (isDesktop) setSheetOpen(false);
  }, [isDesktop]);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <nav className="border-b border-border px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <HankoMark />
          <span className="font-display text-lg font-semibold text-ink lowercase tracking-tight">
            yagyu
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {showPanel && !isDesktop && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  onClick={() => setSheetOpen(true)}
                >
                  <MenuIcon className="h-4 w-4" />
                </Button>
              )}
              <UserAvatarMenu />
            </>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </nav>
      <div className="flex-1 flex">
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
        {showPanel && isDesktop && (
          <aside className="w-72 shrink-0 border-l border-border bg-card">
            <SidePanel />
          </aside>
        )}
      </div>
      {showPanel && !isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SidePanel onNavigate={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
