import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/constants.js';
import {
  createCategorySchema,
  idParams,
  listBookingsSchema,
  listTechniciansSchema,
  listUsersSchema,
  setActiveSchema,
  updateCategorySchema,
  verifyTechnicianSchema,
} from '../validators/admin.schemas.js';

const router = Router();
router.use(authenticate, requireRole(ROLES.ADMIN));

router.get('/stats', admin.stats);

router.get('/users', validate(listUsersSchema), admin.listUsers);
router.patch('/users/:id/active', validate(setActiveSchema), admin.setUserActive);

router.get('/technicians', validate(listTechniciansSchema), admin.listTechnicians);
router.patch(
  '/technicians/:userId/verify',
  validate(verifyTechnicianSchema),
  admin.verifyTechnician,
);

router.get('/bookings', validate(listBookingsSchema), admin.listBookings);
router.get('/bookings/:id', validate(idParams), admin.getBooking);

router.get('/categories', admin.listCategories);
router.post('/categories', validate(createCategorySchema), admin.createCategory);
router.patch('/categories/:id', validate(updateCategorySchema), admin.updateCategory);

export default router;
