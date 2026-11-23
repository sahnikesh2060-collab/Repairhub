import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CATEGORY_KEY_PATTERN } from '../config/constants.js';
import { buildPointSchema } from '../utils/geo.js';

const { Schema } = mongoose;

const technicianProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    categories: {
      type: [
        {
          type: String,
          uppercase: true,
          trim: true,
          match: [CATEGORY_KEY_PATTERN, 'Invalid category key'],
        },
      ],
      default: [],
      validate: {
        // A fresh profile has no categories; once the technician is onboarded (verified or
        // going online) at least one category is required.
        validator(value) {
          if (!this.isVerified && !this.isAvailable) return true;
          return Array.isArray(value) && value.length >= 1;
        },
        message: 'At least one category is required once the technician is onboarded',
      },
    },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    visitFee: { type: Number, min: 0, default: 0 },
    serviceRadiusKm: {
      type: Number,
      min: 1,
      max: 50,
      default: () => env.DEFAULT_SERVICE_RADIUS_KM,
    },
    isAvailable: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    ratingAvg: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    completedJobs: { type: Number, min: 0, default: 0 },
    // Left undefined until the technician shares a real position (see utils/geo.js).
    currentLocation: { type: buildPointSchema({ withAddress: true }) },
    lastLocationAt: { type: Date },
  },
  { timestamps: true, toJSON: { versionKey: false }, toObject: { versionKey: false } },
);

technicianProfileSchema.index({ currentLocation: '2dsphere' });
technicianProfileSchema.index({ categories: 1, isAvailable: 1, isVerified: 1 });

export const TechnicianProfile =
  mongoose.models.TechnicianProfile || mongoose.model('TechnicianProfile', technicianProfileSchema);
export default TechnicianProfile;
