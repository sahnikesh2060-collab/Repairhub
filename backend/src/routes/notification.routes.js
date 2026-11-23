import { Router } from 'express';
import * as notifications from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  listNotificationsSchema,
  notificationIdSchema,
} from '../validators/notification.schemas.js';

const router = Router();
router.use(authenticate);

router.get('/', validate(listNotificationsSchema), notifications.list);
router.patch('/read-all', notifications.markAllRead);
router.patch('/:id/read', validate(notificationIdSchema), notifications.markRead);

export default router;
