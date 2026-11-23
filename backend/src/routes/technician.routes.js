import { Router } from 'express';
import * as technician from '../controllers/technician.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { locationLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/constants.js';
import {
  availabilitySchema,
  earningsSchema,
  locationSchema,
  publicProfileSchema,
  updateProfileSchema,
} from '../validators/technician.schemas.js';

const onlyTechnicians = requireRole(ROLES.TECHNICIAN);

const router = Router();
router.use(authenticate);

router.get('/me', onlyTechnicians, technician.getMe);
router.put('/me/profile', onlyTechnicians, validate(updateProfileSchema), technician.updateProfile);
router.patch(
  '/me/availability',
  onlyTechnicians,
  validate(availabilitySchema),
  technician.setAvailability,
);
router.patch(
  '/me/location',
  onlyTechnicians,
  locationLimiter,
  validate(locationSchema),
  technician.updateLocation,
);
router.get('/me/earnings', onlyTechnicians, validate(earningsSchema), technician.earnings);
router.get('/nearby-requests', onlyTechnicians, technician.nearbyRequests);

// Any logged-in user.
router.get('/:userId/public', validate(publicProfileSchema), technician.publicProfile);

export default router;
