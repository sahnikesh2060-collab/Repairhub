import mongoose from 'mongoose';
import { ApiError } from './ApiError.js';
import { ERROR_CODES } from '../config/constants.js';

const EARTH_RADIUS_KM = 6371.0088;

/** True when lng/lat are finite numbers inside the valid WGS84 ranges. */
export function isValidLngLat(lng, lat) {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/** Validates a GeoJSON coordinates array: exactly [lng, lat]. */
export function isValidCoordinatePair(coordinates) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    isValidLngLat(coordinates[0], coordinates[1])
  );
}

/**
 * Converts named fields into a GeoJSON Point (DECISIONS #4). Throws a 422 on bad input.
 * @param {{ lng: number, lat: number }} input
 */
export function toPoint({ lng, lat } = {}) {
  if (!isValidLngLat(lng, lat)) {
    throw ApiError.unprocessable(
      'Invalid coordinates: lng must be -180..180 and lat -90..90',
      ERROR_CODES.VALIDATION_ERROR,
      [{ field: 'lng/lat', message: 'Out of range or not a number' }],
    );
  }
  return { type: 'Point', coordinates: [lng, lat] };
}

/** Converts a GeoJSON Point back into { lng, lat }; returns null when there is no point. */
export function fromPoint(point) {
  if (!point || !isValidCoordinatePair(point.coordinates)) return null;
  const [lng, lat] = point.coordinates;
  return { lng, lat };
}

/** Great-circle distance in kilometres between two { lng, lat } positions. */
export function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Mongoose sub-schema for a GeoJSON Point.
 * `type` deliberately has NO default: a { type: 'Point' } without coordinates makes the
 * 2dsphere index reject the insert ("Can't extract geo keys"). Leave the whole field
 * undefined until real coordinates exist.
 * @param {{ withAddress?: boolean }} [options] adds an `addressText` string next to the point
 */
export function buildPointSchema({ withAddress = false } = {}) {
  const definition = {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: isValidCoordinatePair,
        message: 'coordinates must be [lng, lat] with lng in -180..180 and lat in -90..90',
      },
    },
  };
  if (withAddress) {
    definition.addressText = { type: String, trim: true, maxlength: 300 };
  }
  return new mongoose.Schema(definition, { _id: false });
}
