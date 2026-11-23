import { Router } from 'express';
import * as booking from '../controllers/booking.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { bookingCreateLimiter, messageLimiter } from '../middleware/rateLimiters.js';
import { discardUploadsOnError, uploadImages } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/constants.js';
import {
  bookingIdParams,
  cancelSchema,
  createBookingSchema,
  listBookingsSchema,
  listMessagesSchema,
  postMessageSchema,
  releaseSchema,
  respondScheduleSchema,
  reviewSchema,
  scheduleSchema,
  updateStatusSchema,
} from '../validators/booking.schemas.js';

const customer = requireRole(ROLES.CUSTOMER);
const technician = requireRole(ROLES.TECHNICIAN);

const router = Router();
router.use(authenticate);

router.post(
  '/',
  customer,
  bookingCreateLimiter,
  uploadImages('images'),
  validate(createBookingSchema),
  booking.create,
  discardUploadsOnError,
);
router.get('/my', customer, validate(listBookingsSchema), booking.listMine);
router.get('/technician/my', technician, validate(listBookingsSchema), booking.listAssigned);

// Every :id route checks access in the service: owner, assigned technician, open-request
// preview technician (read only) or admin. Anyone else gets 404.
router.get('/:id', validate(bookingIdParams), booking.getOne);
router.post(
  '/:id/accept-and-schedule',
  technician,
  validate(scheduleSchema),
  booking.acceptAndSchedule,
);
router.post('/:id/propose-schedule', technician, validate(scheduleSchema), booking.proposeSchedule);
router.post(
  '/:id/respond-schedule',
  customer,
  validate(respondScheduleSchema),
  booking.respondSchedule,
);
router.post('/:id/release', technician, validate(releaseSchema), booking.release);
router.patch('/:id/status', technician, validate(updateStatusSchema), booking.updateStatus);
router.post('/:id/cancel', validate(cancelSchema), booking.cancel);
router.post('/:id/rebroadcast', customer, validate(bookingIdParams), booking.rebroadcast);
router.post('/:id/review', customer, validate(reviewSchema), booking.review);
router.get('/:id/messages', validate(listMessagesSchema), booking.listMessages);
router.post('/:id/messages', messageLimiter, validate(postMessageSchema), booking.postMessage);

export default router;
