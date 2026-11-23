import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { TechnicianProfile } from '../src/models/TechnicianProfile.js';
import { Booking } from '../src/models/Booking.js';
import { generateBookingCode } from '../src/utils/bookingCode.js';
import { fromPoint, haversineKm, toPoint } from '../src/utils/geo.js';

const { Types } = mongoose;

const KATHMANDU = { lng: 85.324, lat: 27.7172 };

function bookingData(overrides = {}) {
  return {
    bookingCode: 'REP-2026-9999',
    customerId: new Types.ObjectId(),
    category: 'ac',
    title: 'AC not cooling',
    description: 'The split AC blows warm air since yesterday evening.',
    location: { ...toPoint(KATHMANDU), addressText: 'Thamel, Kathmandu' },
    ...overrides,
  };
}

describe('indexes', () => {
  it('has a 2dsphere index on TechnicianProfile.currentLocation', async () => {
    const indexes = await TechnicianProfile.collection.indexes();
    expect(indexes.some((i) => i.key.currentLocation === '2dsphere')).toBe(true);
    expect(
      indexes.some(
        (i) => i.key.categories === 1 && i.key.isAvailable === 1 && i.key.isVerified === 1,
      ),
    ).toBe(true);
  });

  it('has a 2dsphere index on Booking.location plus the query indexes', async () => {
    const indexes = await Booking.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(indexes.some((i) => i.key.location === '2dsphere')).toBe(true);
    expect(keys).toContain(JSON.stringify({ status: 1, category: 1 }));
    expect(keys).toContain(JSON.stringify({ technicianId: 1, status: 1 }));
    expect(keys).toContain(JSON.stringify({ customerId: 1, createdAt: -1 }));
  });
});

describe('GeoJSON validation', () => {
  it('rejects out-of-range coordinates on TechnicianProfile', async () => {
    const profile = new TechnicianProfile({
      userId: new Types.ObjectId(),
      currentLocation: { type: 'Point', coordinates: [200, 27.7] },
    });
    await expect(profile.validate()).rejects.toThrow(/coordinates must be \[lng, lat\]/);
  });

  it('rejects out-of-range latitude and wrong-length arrays on Booking', async () => {
    const badLat = new Booking(
      bookingData({ location: { type: 'Point', coordinates: [85.3, 95] } }),
    );
    await expect(badLat.validate()).rejects.toThrow(mongoose.Error.ValidationError);

    const threeValues = new Booking(
      bookingData({ location: { type: 'Point', coordinates: [85.3, 27.7, 10] } }),
    );
    await expect(threeValues.validate()).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('rejects a Point with no coordinates instead of letting the 2dsphere index fail', async () => {
    const profile = new TechnicianProfile({
      userId: new Types.ObjectId(),
      currentLocation: { type: 'Point' },
    });
    await expect(profile.validate()).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('toPoint refuses invalid input and round-trips valid input', () => {
    expect(() => toPoint({ lng: 85.3, lat: -91 })).toThrow(/Invalid coordinates/);
    expect(() => toPoint({ lng: '85.3', lat: 27.7 })).toThrow(/Invalid coordinates/);
    expect(fromPoint(toPoint(KATHMANDU))).toEqual(KATHMANDU);
  });

  it('haversineKm gives realistic distances', () => {
    // Kathmandu Durbar Square -> Patan Durbar Square is roughly 4.4 km.
    const km = haversineKm({ lng: 85.3077, lat: 27.7044 }, { lng: 85.3252, lat: 27.6727 });
    expect(km).toBeGreaterThan(3.5);
    expect(km).toBeLessThan(4.5);
  });
});

describe('TechnicianProfile', () => {
  it('saves fine without a location (the 2dsphere index tolerates the missing field)', async () => {
    const profile = await TechnicianProfile.create({ userId: new Types.ObjectId() });
    const raw = await TechnicianProfile.collection.findOne({ _id: profile._id });
    expect(raw).not.toBeNull();
    expect(raw).not.toHaveProperty('currentLocation');
    expect(raw.serviceRadiusKm).toBe(10);
  });

  it('stores [lng, lat] so $nearSphere returns the closest technician first', async () => {
    const near = await TechnicianProfile.create({
      userId: new Types.ObjectId(),
      currentLocation: { ...toPoint({ lng: 85.3245, lat: 27.718 }), addressText: 'Thamel' },
    });
    const far = await TechnicianProfile.create({
      userId: new Types.ObjectId(),
      currentLocation: { ...toPoint({ lng: 85.36, lat: 27.67 }), addressText: 'Koteshwor' },
    });

    const found = await TechnicianProfile.find({
      currentLocation: { $nearSphere: { $geometry: toPoint(KATHMANDU), $maxDistance: 10_000 } },
    });
    expect(found.map((p) => String(p._id))).toEqual([String(near._id), String(far._id)]);
  });

  it('requires at least one category once verified or online', async () => {
    const profile = new TechnicianProfile({ userId: new Types.ObjectId(), isVerified: true });
    await expect(profile.validate()).rejects.toThrow(/At least one category/);
    profile.categories = ['plumbing'];
    await expect(profile.validate()).resolves.toBeUndefined();
    expect(profile.categories).toEqual(['PLUMBING']);
  });
});

describe('Booking', () => {
  it('saves with an addressText inside the indexed location and applies defaults', async () => {
    const booking = await Booking.create(bookingData());
    expect(booking).toMatchObject({
      category: 'AC',
      status: 'REQUESTED',
      scheduleStatus: 'NONE',
      urgency: 'NORMAL',
      currency: 'NPR',
      technicianId: null,
    });
    expect(booking.location.addressText).toBe('Thamel, Kathmandu');
  });

  it('pushStatus sets status and appends to statusHistory', async () => {
    const booking = new Booking(bookingData());
    const actorId = new Types.ObjectId();
    Booking.pushStatus(booking, 'SEARCHING_TECHNICIAN', null, 'Dispatch started');
    Booking.pushStatus(
      booking,
      'CANCELLED',
      { id: String(actorId), role: 'customer' },
      'Changed my mind',
    );
    await booking.save();

    expect(booking.status).toBe('CANCELLED');
    expect(booking.statusHistory).toHaveLength(2);
    expect(booking.statusHistory[0]).toMatchObject({
      status: 'SEARCHING_TECHNICIAN',
      role: 'system',
    });
    expect(String(booking.statusHistory[1].updatedBy)).toBe(String(actorId));
    expect(() => Booking.pushStatus(booking, 'NOT_A_STATUS')).toThrow(/Unknown booking status/);
  });

  it('caps images at 5', async () => {
    const booking = new Booking(
      bookingData({ images: Array.from({ length: 6 }, (_, i) => `/uploads/${i}.jpg`) }),
    );
    await expect(booking.validate()).rejects.toThrow(/at most 5 images/);
  });
});

describe('User', () => {
  it('toJSON removes password, refreshTokens and __v', async () => {
    await User.create({ name: 'Hari', email: 'hari@example.com', password: 'abc12345' });
    const user = await User.findOne({ email: 'hari@example.com' }).select(
      '+password +refreshTokens',
    );
    const json = user.toJSON();
    expect(json).not.toHaveProperty('password');
    expect(json).not.toHaveProperty('refreshTokens');
    expect(json).not.toHaveProperty('__v');
    expect(await user.comparePassword('abc12345')).toBe(true);
    expect(await user.comparePassword('wrong')).toBe(false);
  });

  it('allows many users without a phone (sparse unique index)', async () => {
    await User.create({ name: 'One', email: 'one@example.com', password: 'abc12345' });
    await expect(
      User.create({ name: 'Two', email: 'two@example.com', password: 'abc12345' }),
    ).resolves.toBeDefined();
  });
});

describe('bookingCode', () => {
  it('starts at REP-<UTC year>-1001', async () => {
    const code = await generateBookingCode(new Date(Date.UTC(2026, 0, 1, 0, 30)));
    expect(code).toBe('REP-2026-1001');
  });

  it('20 parallel calls return 20 unique, sequential codes', async () => {
    const when = new Date(Date.UTC(2026, 5, 15));
    const codes = await Promise.all(Array.from({ length: 20 }, () => generateBookingCode(when)));

    expect(new Set(codes).size).toBe(20);
    for (const code of codes) expect(code).toMatch(/^REP-2026-\d+$/);
    const numbers = codes.map((c) => Number(c.split('-')[2])).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => 1001 + i));
  });

  it('keeps a separate sequence per year', async () => {
    await generateBookingCode(new Date(Date.UTC(2026, 11, 31, 23, 59)));
    const next = await generateBookingCode(new Date(Date.UTC(2027, 0, 1, 0, 1)));
    expect(next).toBe('REP-2027-1001');
  });
});
