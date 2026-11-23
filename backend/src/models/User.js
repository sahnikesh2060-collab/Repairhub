import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS, ROLES, ROLE_VALUES } from '../config/constants.js';
import { buildPointSchema } from '../utils/geo.js';

const { Schema } = mongoose;

const savedAddressSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    addressText: { type: String, required: true, trim: true, maxlength: 300 },
    location: { type: buildPointSchema(), required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 300, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    // Optional; unique among users who set one. Never store null or '' (sparse index).
    phone: { type: String, trim: true, unique: true, sparse: true, maxlength: 20 },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.CUSTOMER },
    avatar: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    savedAddresses: { type: [savedAddressSchema], default: [] },
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.refreshTokens;
        return ret;
      },
    },
    toObject: { versionKey: false },
  },
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
});

/** Compares a plain password with the stored hash. The document must be loaded with +password. */
userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password || typeof plain !== 'string') return Promise.resolve(false);
  return bcrypt.compare(plain, this.password);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
