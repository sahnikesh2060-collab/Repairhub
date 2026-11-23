import mongoose from 'mongoose';
import { CATEGORY_KEY_PATTERN } from '../config/constants.js';

const categorySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [CATEGORY_KEY_PATTERN, 'Invalid category key'],
    },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // A lucide-react icon component name, e.g. "AirVent", "Laptop", "Wrench".
    icon: {
      type: String,
      trim: true,
      default: 'Wrench',
      match: [/^[A-Z][A-Za-z0-9]*$/, 'icon must be a lucide-react icon name (PascalCase)'],
    },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false }, toObject: { versionKey: false } },
);

categorySchema.index({ isActive: 1, sortOrder: 1 });

export const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
export default Category;
