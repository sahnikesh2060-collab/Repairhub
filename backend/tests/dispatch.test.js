import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { UPLOAD_DIR } from '../src/config/constants.js';
import { Booking } from '../src/models/Booking.js';
import { Notification } from '../src/models/Notification.js';
import { findEligibleTechnicians } from '../src/services/dispatch.service.js';
import {
  PLACES,
  as,
  createBooking,
  makeCustomer,
  makeTechnician,
  registerUser,
  seedCategories,
} from './helpers.js';

beforeEach(async () => {
  await seedCategories();
});

describe('dispatch', () => {
  it('returns only verified, online, matching, within-own-radius technicians, nearest first', async () => {
    const near = await makeTechnician({ at: PLACES.koteshwor, name: 'Near Koteshwor' });
    const farther = await makeTechnician({ at: PLACES.maharajgunj, name: 'Farther Maharajgunj' });
    const unverified = await makeTechnician({ at: PLACES.shankhamul, verified: false });
    const offline = await makeTechnician({ at: PLACES.chabahil, online: false });
    const tooSmallRadius = await makeTechnician({ at: PLACES.kalanki, radiusKm: 5 });
    const wrongCategory = await makeTechnician({ at: PLACES.koteshwor, categories: ['PLUMBING'] });
    const beyondCap = await makeTechnician({ at: { lng: 85.65, lat: 27.62 }, radiusKm: 50 });

    const customer = await makeCustomer();
    const { booking, matchedCount } = await createBooking(customer);

    expect(matchedCount).toBe(2);
    expect(booking.status).toBe('SEARCHING_TECHNICIAN');

    const stored = await Booking.findById(booking._id);
    const eligible = await findEligibleTechnicians(stored);
    expect(eligible.map((t) => t.userId)).toEqual([near.id, farther.id]);
    expect(eligible[0]).toMatchObject({ name: 'Near Koteshwor', visitFee: 500 });
    expect(eligible[0].distanceKm).toBeGreaterThan(1);
    expect(eligible[0].distanceKm).toBeLessThan(2);
    expect(eligible[0].distanceKm).toBeLessThan(eligible[1].distanceKm);

    const excludedIds = [unverified, offline, tooSmallRadius, wrongCategory, beyondCap].map(
      (t) => t.id,
    );
    for (const id of excludedIds) expect(eligible.map((t) => t.userId)).not.toContain(id);

    expect(stored.notifiedTechnicians.map((n) => String(n.technicianId))).toEqual([
      near.id,
      farther.id,
    ]);
    expect(stored.statusHistory.map((h) => h.status)).toEqual([
      'REQUESTED',
      'SEARCHING_TECHNICIAN',
    ]);
    expect(await Notification.countDocuments({ type: 'NEW_REQUEST' })).toBe(2);
  });

  it('treats zero matches as success and still moves to SEARCHING_TECHNICIAN', async () => {
    const customer = await makeCustomer();
    const { booking, matchedCount } = await createBooking(customer, { category: 'COMPUTER' });
    expect(matchedCount).toBe(0);
    expect(booking.status).toBe('SEARCHING_TECHNICIAN');
    expect(booking.stage).toMatchObject({ stage: 1, cancelled: false });
  });

  it('rejects unknown categories and invalid coordinates', async () => {
    const customer = await makeCustomer();
    const unknown = await as(customer).post('/api/bookings', {
      category: 'GARDENING',
      title: 'Hedge trimming',
      description: 'Please trim the hedge in front of the house.',
      ...PLACES.newBaneshwor,
      addressText: 'New Baneshwor, Kathmandu',
    });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe('INVALID_CATEGORY');

    const badCoords = await as(customer).post('/api/bookings', {
      category: 'AC',
      title: 'AC not cooling',
      description: 'The AC blows warm air all day long.',
      lng: 27.69,
      lat: 185.34,
      addressText: 'Somewhere',
    });
    expect(badCoords.status).toBe(422);
  });

  it('does not re-notify technicians already notified, and never excluded ones', async () => {
    const tech = await makeTechnician();
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer);
    const stored = await Booking.findById(booking._id);

    const { broadcast } = await import('../src/services/dispatch.service.js');
    const again = await broadcast(stored);
    expect(again).toEqual({ matchedCount: 1, notifiedCount: 0 });

    stored.excludedTechnicians.push(tech.id);
    expect(await findEligibleTechnicians(stored)).toEqual([]);
  });

  it('only technicians of the booking can preview it; area only, no coordinates or phone', async () => {
    const tech = await makeTechnician();
    const stranger = await makeCustomer();
    const customer = await registerUser({ role: 'customer' });
    const { booking } = await createBooking(customer);

    const preview = await as(tech).get(`/api/bookings/${booking._id}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.booking).toMatchObject({
      area: 'New Baneshwor',
      location: null,
      allowedActions: ['ACCEPT_AND_SCHEDULE'],
    });
    expect(preview.body.data.booking.customer.phone).toBeUndefined();
    expect(preview.body.data.booking.notifiedTechnicians).toBeUndefined();

    expect((await as(stranger).get(`/api/bookings/${booking._id}`)).status).toBe(404);
    const farTech = await makeTechnician({ at: PLACES.bhaktapur, radiusKm: 3 });
    expect((await as(farTech).get(`/api/bookings/${booking._id}`)).status).toBe(404);
  });

  it('nearby-requests lists open bookings inside my radius with distanceKm', async () => {
    const tech = await makeTechnician();
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer);
    await createBooking(customer, {
      category: 'PLUMBING',
      title: 'Kitchen sink leaking under the cabinet',
    });

    const res = await as(tech).get('/api/technicians/nearby-requests');
    expect(res.status).toBe(200);
    expect(res.body.data.requests).toHaveLength(1);
    expect(res.body.data.requests[0]).toMatchObject({
      bookingId: booking._id,
      area: 'New Baneshwor',
    });
    expect(res.body.data.requests[0].distanceKm).toBeCloseTo(1.6, 0);
  });
});

describe('technician account', () => {
  it('refuses going online without location or categories, and flags pending verification', async () => {
    const tech = await registerUser({ role: 'technician' });
    const api = as(tech);

    const noLocation = await api.patch('/api/technicians/me/availability', { isAvailable: true });
    expect(noLocation.status).toBe(422);
    expect(noLocation.body.error.code).toBe('LOCATION_REQUIRED');

    const located = await api.patch('/api/technicians/me/location', {
      ...PLACES.koteshwor,
      addressText: 'Koteshwor, Kathmandu',
    });
    expect(located.status).toBe(200);
    expect(located.body.data.currentLocation.coordinates).toEqual([85.3494, 27.6789]);

    const noCategories = await api.patch('/api/technicians/me/availability', { isAvailable: true });
    expect(noCategories.body.error.code).toBe('CATEGORIES_REQUIRED');

    const profile = await api.put('/api/technicians/me/profile', {
      categories: ['ac', 'COMPUTER'],
      bio: 'Ten years of AC and laptop repair.',
      experienceYears: 10,
      visitFee: 600,
      serviceRadiusKm: 8,
    });
    expect(profile.status).toBe(200);
    expect(profile.body.data.profile.categories).toEqual(['AC', 'COMPUTER']);

    const online = await api.patch('/api/technicians/me/availability', { isAvailable: true });
    expect(online.status).toBe(200);
    expect(online.body.data).toMatchObject({ receivesJobs: false });
    expect(online.body.data.message).toMatch(/verification is pending/);

    const throttled = await api.patch('/api/technicians/me/location', PLACES.shankhamul);
    expect(throttled.body.data.ignored).toBe(true);
  });
});

describe('photo uploads', () => {
  // 1x1 transparent PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  const fields = (req) =>
    req
      .field('category', 'AC')
      .field('title', 'AC not cooling, rattling noise')
      .field('description', 'The split AC blows warm air and rattles loudly.')
      .field('lng', '85.342')
      .field('lat', '27.6915')
      .field('addressText', 'New Baneshwor, Kathmandu')
      .field('preferredNote', '');

  it('accepts multipart images and serves them from /uploads', async () => {
    const customer = await makeCustomer();
    const res = await fields(
      request(app).post('/api/bookings').set('Authorization', `Bearer ${customer.token}`),
    ).attach('images', png, { filename: 'ac.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    const [image] = res.body.data.booking.images;
    expect(image).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}\.png$/);
    const served = await request(app).get(image);
    expect(served.status).toBe(200);
    fs.rmSync(path.join(UPLOAD_DIR, image.replace('/uploads/', '')), { force: true });
  });

  it('rejects other file types and removes saved files when validation fails', async () => {
    const customer = await makeCustomer();
    const wrongType = await fields(
      request(app).post('/api/bookings').set('Authorization', `Bearer ${customer.token}`),
    ).attach('images', Buffer.from('%PDF-1.4'), {
      filename: 'quote.pdf',
      contentType: 'application/pdf',
    });
    expect(wrongType.status).toBe(422);
    expect(wrongType.body.error.code).toBe('UPLOAD_INVALID_TYPE');

    const before = fs.existsSync(UPLOAD_DIR) ? countFiles(UPLOAD_DIR) : 0;
    const invalid = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('category', 'AC')
      .field('title', 'x')
      .attach('images', png, { filename: 'a.png', contentType: 'image/png' });
    expect(invalid.status).toBe(422);
    expect(countFiles(UPLOAD_DIR)).toBe(before);
  });
});

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(path.join(dir, entry.name));
    else if (entry.name !== '.gitkeep') n += 1;
  }
  return n;
}
