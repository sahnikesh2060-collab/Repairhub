import { Router } from 'express';
import * as categories from '../controllers/category.controller.js';

const router = Router();

// Public: active categories ordered by sortOrder.
router.get('/', categories.listActive);

export default router;
