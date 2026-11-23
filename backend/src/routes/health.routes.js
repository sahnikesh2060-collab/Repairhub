import { Router } from 'express';
import { isDbConnected } from '../config/db.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();

router.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptime: Math.round(process.uptime()),
    db: isDbConnected() ? 'up' : 'down',
  });
});

export default router;
