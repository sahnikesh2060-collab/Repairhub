import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../config/constants.js';
import { User } from '../models/User.js';
import { verifyAccessToken } from '../services/token.service.js';
import { logger } from '../utils/logger.js';
import { registerBookingHandlers } from './booking.handlers.js';

let io = null;

export const userRoom = (userId) => `user:${userId}`;
export const bookingRoom = (bookingId) => `booking:${bookingId}`;

function unauthorized(message) {
  const err = new Error(message);
  err.data = { code: ERROR_CODES.UNAUTHORIZED, message };
  return err;
}

/** Handshake auth (DECISIONS #9): the access token is sent in handshake.auth.token. */
async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') return next(unauthorized('Authentication required'));

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('name role isActive').lean();
    if (!user || !user.isActive) return next(unauthorized('Account not found or disabled'));
    socket.data.user = { id: String(user._id), role: user.role, name: user.name };
    return next();
  } catch (_err) {
    return next(unauthorized('Invalid or expired token'));
  }
}

/**
 * Attaches Socket.io to the HTTP server. Every authenticated socket joins `user:<userId>`.
 * Booking event handlers are added in Phase 2.
 * @param {import('node:http').Server} httpServer
 */
export function initSocket(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URLS, credentials: true },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(userRoom(id));
    registerBookingHandlers(socket);
    logger.debug(`[socket] connected ${socket.id} user=${id} role=${role}`);
    socket.on('disconnect', (reason) => {
      logger.debug(`[socket] disconnected ${socket.id} user=${id} (${reason})`);
    });
  });

  return io;
}

/** The Socket.io server; throws if initSocket has not run. */
export function getIO() {
  if (!io) throw new Error('Socket.io has not been initialised; call initSocket() first');
  return io;
}

/** Disconnects every client and stops Socket.io. Note: io.close() also closes the HTTP server. */
export function closeSocket() {
  return new Promise((resolve) => {
    if (!io) return resolve();
    const server = io;
    io = null;
    server.close(() => resolve());
  });
}
