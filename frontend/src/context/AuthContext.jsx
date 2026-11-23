import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth.api.js';
import { setAuthFailureHandler, tokenStore } from '../api/client.js';
import { ROLE_HOME } from '../lib/constants.js';
import { Spinner } from '../components/ui/Spinner.jsx';

export const AuthContext = createContext(null);

/** Only same-app paths are accepted as ?next targets (no //evil.com, no auth pages). */
export function safeNext(next) {
  if (!next || typeof next !== 'string') return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (/^\/(login|register)\b/.test(next)) return null;
  return next;
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
      <Spinner size="lg" />
      <p className="text-sm text-slate-500">Loading RepairHub…</p>
    </div>
  );
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState({ status: 'loading', user: null, technicianProfile: null });
  const userRef = useRef(null);
  userRef.current = state.user;

  const applyMe = useCallback((me) => {
    setState({ status: 'ready', user: me.user, technicianProfile: me.technicianProfile ?? null });
  }, []);

  const clearSession = useCallback(() => {
    tokenStore.set(null);
    queryClient.clear();
    setState({ status: 'ready', user: null, technicianProfile: null });
  }, [queryClient]);

  // Silent sign-in from the refresh cookie on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await authApi.refresh();
        const me = await authApi.me();
        if (!cancelled) applyMe(me);
      } catch (_err) {
        if (!cancelled) setState({ status: 'ready', user: null, technicianProfile: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMe]);

  // When a refresh fails mid-session: clear everything and send the user to /login?next=...
  useEffect(() => {
    setAuthFailureHandler(() => {
      if (!userRef.current) return;
      const next = `${window.location.pathname}${window.location.search}`;
      clearSession();
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    });
    return () => setAuthFailureHandler(() => {});
  }, [clearSession, navigate]);

  const goHome = useCallback(
    (user, next) => {
      navigate(safeNext(next) ?? ROLE_HOME[user.role] ?? '/', { replace: true });
    },
    [navigate],
  );

  const login = useCallback(
    async (credentials, { next } = {}) => {
      await authApi.login(credentials);
      const me = await authApi.me();
      applyMe(me);
      goHome(me.user, next);
      return me.user;
    },
    [applyMe, goHome],
  );

  const register = useCallback(
    async (body, { next } = {}) => {
      await authApi.register(body);
      const me = await authApi.me();
      applyMe(me);
      goHome(me.user, next);
      return me.user;
    },
    [applyMe, goHome],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  }, [clearSession, navigate]);

  const updateUser = useCallback((user) => {
    setState((s) => ({ ...s, user: { ...s.user, ...user } }));
  }, []);

  const reloadMe = useCallback(async () => {
    const me = await authApi.me();
    applyMe(me);
    return me;
  }, [applyMe]);

  const value = useMemo(
    () => ({
      user: state.user,
      role: state.user?.role ?? null,
      technicianProfile: state.technicianProfile,
      isAuthenticated: Boolean(state.user),
      login,
      register,
      logout,
      updateUser,
      reloadMe,
    }),
    [state, login, register, logout, updateUser, reloadMe],
  );

  if (state.status === 'loading') return <FullScreenLoader />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
