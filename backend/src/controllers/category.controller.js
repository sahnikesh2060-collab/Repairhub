import * as categoryService from '../services/category.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** Public: active categories ordered by sortOrder. */
export const listActive = asyncHandler(async (_req, res) => {
  sendSuccess(res, { categories: await categoryService.listActiveCategories() });
});
