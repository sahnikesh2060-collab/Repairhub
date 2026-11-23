import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, LogOut, Menu, UserRound, WifiOff, Wrench, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useSocket } from '../../hooks/useSocket.js';
import { ROLE_LABEL } from '../../lib/constants.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { NotificationBell } from './NotificationBell.jsx';

const LINKS = {
  customer: [
    { to: '/customer', label: 'My bookings', end: true },
    { to: '/customer/bookings/new', label: 'Book a repair' },
    { to: '/customer/addresses', label: 'Addresses' },
  ],
  technician: [
    { to: '/technician', label: 'Dashboard', end: true },
    { to: '/technician/jobs', label: 'My jobs' },
    { to: '/technician/earnings', label: 'Earnings' },
  ],
  admin: [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/technicians', label: 'Technicians' },
    { to: '/admin/bookings', label: 'Bookings' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/categories', label: 'Categories' },
  ],
};

const PROFILE_PATH = { customer: '/customer/profile', technician: '/technician/profile' };

const navClass = ({ isActive }) =>
  clsx(
    'rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
    isActive
      ? 'bg-blue-600/10 text-blue-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  );

function UserMenu() {
  const { user, role, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Avatar name={user.name} src={user.avatar} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium text-slate-700 sm:block">
          {user.name}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-[900] mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">
              {user.email} · {ROLE_LABEL[role]}
            </p>
          </div>
          {PROFILE_PATH[role] && (
            <Link
              to={PROFILE_PATH[role]}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
            >
              <UserRound className="h-4 w-4" aria-hidden /> Profile
            </Link>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await logout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
          >
            <LogOut className="h-4 w-4" aria-hidden /> {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

function ReconnectingBanner() {
  const { user } = useAuth();
  const { isConnected, hasConnected } = useSocket();
  if (!user || !hasConnected || isConnected) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      Reconnecting… live updates will resume automatically.
    </div>
  );
}

/** Top navigation (role-aware links, notification bell, user menu) around every page. */
export function AppShell() {
  const { user, role } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = user ? (LINKS[role] ?? []) : [];

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a
        href="#main"
        className="sr-only z-[1100] rounded-lg bg-white px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-[800] border-b border-slate-200/70 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {links.length > 0 && (
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg text-[17px] font-extrabold tracking-tight text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="rh-brand-gradient rounded-xl p-2 text-white shadow-(--shadow-brand)">
              <Wrench className="h-4 w-4" aria-hidden />
            </span>
            <span>
              Repair<span className="text-blue-600">Hub</span>
            </span>
          </Link>
          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {user ? (
              <>
                <NotificationBell />
                <UserMenu />
              </>
            ) : (
              <>
                <Button as={Link} to="/login" variant="ghost" size="sm">
                  Sign in
                </Button>
                <Button as={Link} to="/register" size="sm">
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
        {mobileOpen && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="border-t border-slate-100 px-4 py-2 md:hidden"
          >
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={(s) => clsx(navClass(s), 'block')}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
        <ReconnectingBanner />
      </header>
      <main id="main" className="flex-1">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6">
          <p className="flex items-center gap-2 font-semibold text-slate-700">
            <span className="rh-brand-gradient rounded-lg p-1 text-white">
              <Wrench className="h-3 w-3" aria-hidden />
            </span>
            RepairHub
            <span className="font-normal text-slate-400">
              · Verified repairs across the Kathmandu Valley
            </span>
          </p>
          <p>Times are shown in your local time zone.</p>
        </div>
      </footer>
    </div>
  );
}

export default AppShell;
