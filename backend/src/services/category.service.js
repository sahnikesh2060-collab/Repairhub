import { Category } from '../models/Category.js';
import { ApiError } from '../utils/ApiError.js';

export function listActiveCategories() {
  return Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
}

export function listAllCategories() {
  return Category.find().sort({ sortOrder: 1, name: 1 });
}

/** Category keys that exist and are active, from `keys`. */
export async function activeCategoryKeys(keys) {
  const found = await Category.find({ key: { $in: keys }, isActive: true })
    .select('key')
    .lean();
  return new Set(found.map((c) => c.key));
}

export function createCategory(body) {
  return Category.create(body);
}

export async function updateCategory(categoryId, patch) {
  const category = await Category.findByIdAndUpdate(categoryId, patch, {
    new: true,
    runValidators: true,
  });
  if (!category) throw ApiError.notFound('Category not found');
  return category;
}
