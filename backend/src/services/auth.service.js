import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS, ERROR_CODES, MAX_SAVED_ADDRESSES, ROLES } from '../config/constants.js';
import { User } from '../models/User.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { ApiError } from '../utils/ApiError.js';
import { toPoint } from '../utils/geo.js';
import { issueTokenPair, revokeRefreshToken, rotateRefreshToken } from './token.service.js';

const INVALID_CREDENTIALS = 'Invalid email or password';

// Compared against when the email is unknown, so both failure paths cost one bcrypt compare.
let dummyHashPromise;
const dummyHash = () => (dummyHashPromise ??= bcrypt.hash('not-a-real-password-0', BCRYPT_ROUNDS));

async function loadUser(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) throw ApiError.notFound('User not found');
  return user;
}

/**
 * Registers a customer or technician. Technicians also get an empty, unverified, offline
 * TechnicianProfile with no location.
 * @returns {Promise<{ user, accessToken: string, refreshToken: string }>}
 */
export async function registerUser({ name, email, phone, password, role }, meta = {}) {
  if (role !== ROLES.CUSTOMER && role !== ROLES.TECHNICIAN) {
    throw ApiError.forbidden('Admins cannot self-register');
  }

  const user = await User.create({ name, email, phone, password, role });

  if (role === ROLES.TECHNICIAN) {
    try {
      await TechnicianProfile.create({ userId: user._id });
    } catch (err) {
      // Standalone MongoDB has no transactions; undo the user so registration can be retried.
      await User.deleteOne({ _id: user._id });
      throw err;
    }
  }

  const tokens = await issueTokenPair(user, meta);
  return { user, ...tokens };
}

/** Any failure (unknown email, wrong password, disabled account) gives the same 401. */
export async function loginUser({ email, password }, meta = {}) {
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    await bcrypt.compare(password, await dummyHash());
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  const ok = await user.comparePassword(password);
  if (!ok || !user.isActive) throw ApiError.unauthorized(INVALID_CREDENTIALS);

  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });

  const tokens = await issueTokenPair(user, meta);
  return { user, ...tokens };
}

export function refreshSession(rawToken, meta = {}) {
  return rotateRefreshToken(rawToken, meta);
}

export function logout(rawToken) {
  return revokeRefreshToken(rawToken);
}

/** The user, plus technicianProfile when the user is a technician. */
export async function getMe(userId) {
  const user = await loadUser(userId);
  const result = { user };
  if (user.role === ROLES.TECHNICIAN) {
    result.technicianProfile = await TechnicianProfile.findOne({ userId: user._id });
  }
  return result;
}

/** Updates name, phone and avatar. null for phone/avatar removes the value. */
export async function updateMe(userId, { name, phone, avatar }) {
  const $set = {};
  const $unset = {};
  if (name !== undefined) $set.name = name;
  if (phone !== undefined) {
    if (phone === null) $unset.phone = 1;
    else $set.phone = phone;
  }
  if (avatar !== undefined) {
    if (avatar === null) $unset.avatar = 1;
    else $set.avatar = avatar;
  }

  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;

  const user = await User.findOneAndUpdate({ _id: userId, isActive: true }, update, {
    new: true,
    runValidators: true,
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

// ---- Saved addresses ----

function makeOnlyDefault(user, address) {
  for (const a of user.savedAddresses) a.isDefault = a._id.equals(address._id);
}

function findAddress(user, addressId) {
  const address = user.savedAddresses.id(addressId);
  if (!address) throw ApiError.notFound('Address not found');
  return address;
}

export async function listAddresses(userId) {
  const user = await loadUser(userId);
  return user.savedAddresses;
}

/** Adds an address. The first address, or one sent with isDefault: true, becomes the only default. */
export async function addAddress(userId, { label, addressText, lng, lat, isDefault }) {
  const user = await loadUser(userId);
  if (user.savedAddresses.length >= MAX_SAVED_ADDRESSES) {
    throw ApiError.unprocessable(
      `You can save at most ${MAX_SAVED_ADDRESSES} addresses`,
      ERROR_CODES.ADDRESS_LIMIT_REACHED,
    );
  }

  const makeDefault = isDefault === true || user.savedAddresses.length === 0;
  user.savedAddresses.push({
    label,
    addressText,
    location: toPoint({ lng, lat }),
    isDefault: makeDefault,
  });
  const address = user.savedAddresses[user.savedAddresses.length - 1];
  if (makeDefault) makeOnlyDefault(user, address);

  await user.save();
  return { address, addresses: user.savedAddresses };
}

export async function updateAddress(userId, addressId, patch) {
  const user = await loadUser(userId);
  const address = findAddress(user, addressId);

  if (patch.label !== undefined) address.label = patch.label;
  if (patch.addressText !== undefined) address.addressText = patch.addressText;
  if (patch.lng !== undefined && patch.lat !== undefined) {
    address.location = toPoint({ lng: patch.lng, lat: patch.lat });
  }
  if (patch.isDefault === true) makeOnlyDefault(user, address);
  else if (patch.isDefault === false) address.isDefault = false;

  await user.save();
  return { address, addresses: user.savedAddresses };
}

/** Deletes an address. If it was the default, the first remaining address becomes default. */
export async function deleteAddress(userId, addressId) {
  const user = await loadUser(userId);
  const address = findAddress(user, addressId);
  const wasDefault = address.isDefault;

  user.savedAddresses.pull(address._id);
  if (wasDefault && user.savedAddresses.length > 0) {
    makeOnlyDefault(user, user.savedAddresses[0]);
  }

  await user.save();
  return { addresses: user.savedAddresses };
}
