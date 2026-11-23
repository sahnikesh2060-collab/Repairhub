import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  addressIdParamSchema,
  createAddressSchema,
  loginSchema,
  registerSchema,
  updateAddressSchema,
  updateMeSchema,
} from '../validators/auth.schemas.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), auth.register);
router.post('/login', authLimiter, validate(loginSchema), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);

router.get('/me', authenticate, auth.getMe);
router.patch('/me', authenticate, validate(updateMeSchema), auth.updateMe);

router.get('/me/addresses', authenticate, auth.listAddresses);
router.post('/me/addresses', authenticate, validate(createAddressSchema), auth.addAddress);
router.patch(
  '/me/addresses/:addressId',
  authenticate,
  validate(updateAddressSchema),
  auth.updateAddress,
);
router.delete(
  '/me/addresses/:addressId',
  authenticate,
  validate(addressIdParamSchema),
  auth.deleteAddress,
);

export default router;
