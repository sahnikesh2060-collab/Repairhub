import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import { UPLOAD_DIR, UPLOAD_PUBLIC_PREFIX } from './config/constants.js';
import apiRoutes from './routes/index.js';
import { generalLimiter } from './middleware/rateLimiters.js';
import { requestId } from './middleware/requestId.js';
import { sanitizeRequest } from './middleware/sanitize.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The built frontend (npm run build -w frontend). */
export const FRONTEND_DIST = path.resolve(here, '..', '..', 'frontend', 'dist');

/** CORS allow-list check shared with Socket.io (requests without an Origin are same-origin). */
export function isAllowedOrigin(origin) {
  return !origin || env.CLIENT_URLS.includes(origin.replace(/\/+$/, ''));
}

function securityHeaders() {
  return helmet({
    // The frontend may run on another origin and must be able to show /uploads images.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // OpenStreetMap blocks tile requests without a Referer; this sends only the site origin.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Leaflet and the charts set inline styles.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', ...env.MAP_TILE_ORIGINS],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Only upgrade to https when the site is served over https.
        upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
      },
    },
  });
}

function requestLogger() {
  const format = env.isDev
    ? ':method :url :status :response-time ms'
    : ':remote-addr :method :url :status :res[content-length] - :response-time ms ":user-agent"';
  return morgan(format, { stream: { write: (line) => logger.info(`[http] ${line.trim()}`) } });
}

/** Serves frontend/dist with an SPA fallback for every non-API route. */
function serveFrontend(app) {
  const indexHtml = path.join(FRONTEND_DIST, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    logger.warn(`[app] ${indexHtml} not found; run "npm run build" to serve the frontend`);
    return;
  }
  app.use(
    express.static(FRONTEND_DIST, {
      index: false,
      setHeaders(res, filePath) {
        // Hashed assets can be cached for a year; index.html must always be revalidated.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get(/^(?!\/(api|uploads|socket\.io)(\/|$)).*/, (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(indexHtml);
  });
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(requestId);
  app.use(securityHeaders());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeRequest);
  app.use(hpp());
  if (!env.isTest) app.use(requestLogger());

  app.use(
    UPLOAD_PUBLIC_PREFIX,
    express.static(UPLOAD_DIR, { index: false, dotfiles: 'ignore', maxAge: '7d' }),
  );
  app.use('/api', generalLimiter, apiRoutes);

  if (env.isProd || env.SERVE_FRONTEND) serveFrontend(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
