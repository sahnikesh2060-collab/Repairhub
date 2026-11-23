import { createContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { refreshSession, tokenStore } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';

export const SocketContext = createContext({
  socket: null,
  isConnected: false,
  hasConnected: false,
  connectionId: 0,
});

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '/';

/**
 * One Socket.io connection while logged in. The handshake reads the token through a function,
 * so every (re)connect uses the latest access token from the in-memory store. An expired token
 * on the handshake triggers one refresh and a reconnect. After a reconnect, active queries are
 * refetched so nothing missed while offline is lost.
 */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?._id;
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  const [connectionId, setConnectionId] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;

    const s = io(SOCKET_URL, {
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
    let connects = 0;
    let authRetried = false;

    s.on('connect', () => {
      connects += 1;
      authRetried = false;
      setIsConnected(true);
      setHasConnected(true);
      setConnectionId((n) => n + 1);
      if (connects > 1) queryClient.invalidateQueries({ refetchType: 'active' });
    });
    s.on('disconnect', () => setIsConnected(false));
    s.on('connect_error', async (err) => {
      setIsConnected(false);
      // Middleware rejections are not retried by Socket.io; refresh the token once, then retry.
      if (err?.data?.code === 'UNAUTHORIZED' && !authRetried) {
        authRetried = true;
        try {
          await refreshSession();
          s.connect();
        } catch (_refreshError) {
          // The next API call runs the normal "session expired" flow.
        }
      }
    });

    // A new token (after a REST refresh) is picked up on the next handshake; if we are
    // currently disconnected, reconnect right away with it.
    const unsubscribe = tokenStore.subscribe((token) => {
      if (token && !s.connected) s.connect();
    });

    setSocket(s);
    return () => {
      unsubscribe();
      s.removeAllListeners();
      s.close();
      setSocket(null);
      setIsConnected(false);
      setHasConnected(false);
    };
  }, [userId, queryClient]);

  const value = useMemo(
    () => ({ socket, isConnected, hasConnected, connectionId }),
    [socket, isConnected, hasConnected, connectionId],
  );
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
