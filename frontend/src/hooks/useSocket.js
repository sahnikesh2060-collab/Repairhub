import { useContext } from 'react';
import { SocketContext } from '../context/SocketContext.jsx';

/** { socket, isConnected, hasConnected, connectionId } — connectionId changes on every (re)connect. */
export function useSocket() {
  return useContext(SocketContext);
}
