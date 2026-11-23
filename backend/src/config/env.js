import dotenv from 'dotenv';
import { z } from 'zod';

// Tests set their own variables (tests/setup.js); never let a developer's .env leak into them.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const DURATION = /^\d+(ms|s|m|h|d)$/;

const boolString = z
  .enum(['true', 'false'], { errorMap: () => ({ message: 'must be "true" or "false"' }) })
  .transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGODB_URI: z
      .string({ required_error: 'is required' })
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    // One origin, or a comma-separated allow-list (CORS and Socket.io).
    CLIENT_URL: z
      .string({ required_error: 'is required' })
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim().replace(/\/+$/, ''))
          .filter(Boolean),
      )
      .pipe(z.array(z.string().url('each origin must be a URL')).min(1, 'is required')),
    // true behind Nginx / a load balancer, so secure cookies and rate limits see the real client.
    TRUST_PROXY: boolString.default('false'),
    // Serve frontend/dist from Express (always on when NODE_ENV=production).
    SERVE_FRONTEND: boolString.default('false'),
    // Map tile origins allowed by the Content-Security-Policy (comma-separated).
    MAP_TILE_ORIGINS: z
      .string()
      .default('https://tile.openstreetmap.org,https://*.tile.openstreetmap.org')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    JWT_ACCESS_SECRET: z
      .string({ required_error: 'is required' })
      .min(32, 'must be at least 32 characters'),
    JWT_REFRESH_SECRET: z
      .string({ required_error: 'is required' })
      .min(32, 'must be at least 32 characters'),
    JWT_ACCESS_EXPIRES: z.string().regex(DURATION, 'must look like 15m, 1h, 7d').default('15m'),
    JWT_REFRESH_EXPIRES: z.string().regex(DURATION, 'must look like 15m, 1h, 7d').default('7d'),
    COOKIE_SECURE: boolString.default('false'),
    MAX_DISPATCH_RADIUS_KM: z.coerce.number().positive().max(200).default(25),
    DEFAULT_SERVICE_RADIUS_KM: z.coerce.number().min(1).max(50).default(10),
    MAX_PROPOSAL_ROUNDS: z.coerce.number().int().min(1).max(10).default(3),
    UPLOAD_MAX_FILES: z.coerce.number().int().min(1).max(10).default(5),
    UPLOAD_MAX_MB: z.coerce.number().positive().max(50).default(5),
    CURRENCY: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code')
      .default('NPR'),
    SEED_CENTER_LAT: z.coerce.number().min(-90).max(90).default(27.7172),
    SEED_CENTER_LNG: z.coerce.number().min(-180).max(180).default(85.324),
  })
  .superRefine((data, ctx) => {
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'must be different from JWT_ACCESS_SECRET',
      });
    }
  });

const result = schema.safeParse(process.env);

if (!result.success) {
  const lines = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  console.error(
    `\n[config] Invalid environment configuration (${lines.length} problem(s)):\n${lines.join('\n')}\n` +
      '[config] Copy backend/.env.example to backend/.env and fix the values above.\n',
  );
  process.exit(1);
}

export const env = Object.freeze({
  ...result.data,
  // CLIENT_URLS is the full allow-list; CLIENT_URL stays the primary origin (a string).
  CLIENT_URLS: result.data.CLIENT_URL,
  CLIENT_URL: result.data.CLIENT_URL[0],
  isDev: result.data.NODE_ENV === 'development',
  isTest: result.data.NODE_ENV === 'test',
  isProd: result.data.NODE_ENV === 'production',
});

export default env;
