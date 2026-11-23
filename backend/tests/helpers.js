import request from 'supertest';
import app from '../src/app.js';
import { Category } from '../src/models/Category.js';
import { TechnicianProfile } from '../src/models/TechnicianProfile.js';
import { User } from '../src/models/User.js';

export const PASSWORD = 'Password1';

/** Kathmandu Valley test positions as { lng, lat }. */
export const PLACES = Object.freeze({
  newBaneshwor: { lng: 85.342, lat: 27.6915 },
  koteshwor: { lng: 85.3494, lat: 27.6789 },
  shankhamul: { lng: 85.329, lat: 27.683 },
  maharajgunj: { lng: 85.3304, lat: 27.7367 },
  kalanki: { lng: 85.2817, lat: 27.6935 },
  chabahil: { lng: 85.3466, lat: 27.7174 },
  bhaktapur: { lng: 85.4298, lat: 27.671 },
});

export const CATEGORY_SEED = [
  { key: 'AC', name: 'AC Repair', icon: 'AirVent', sortOrder: 1 },
  { key: 'COMPUTER', name: 'Computer & Laptop', icon: 'Laptop', sortOrder: 2 },
  { key: 'PLUMBING', name: 'Plumbing', icon: 'Wrench', sortOrder: 3 },
  { key: 'ELECTRICAL', name: 'Electrical', icon: 'Zap', sortOrder: 4 },
];

export function seedCategories() {
  return Category.insertMany(CATEGORY_SEED);
}

let seq = 0;

/** Registers through the API and returns { id, token, user }. */
export async function registerUser({ role = 'customer', name } = {}) {
  seq += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: name ?? `${role} ${seq}`,
      email: `${role}.${seq}.${Date.now()}@test.local`,
      password: PASSWORD,
      role,
    });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { id: res.body.data.user._id, token: res.body.data.accessToken, user: res.body.data.user };
}

export const makeCustomer = (name) => registerUser({ role: 'customer', name });

export async function makeAdmin() {
  const admin = await registerUser({ role: 'customer', name: 'Admin User' });
  await User.updateOne({ _id: admin.id }, { $set: { role: 'admin' } });
  return admin;
}

/** A technician whose profile is set directly (verified + online by default). */
export async function makeTechnician({
  at = PLACES.koteshwor,
  categories = ['AC'],
  radiusKm = 10,
  verified = true,
  online = true,
  visitFee = 500,
  name,
} = {}) {
  const tech = await registerUser({ role: 'technician', name });
  await TechnicianProfile.updateOne(
    { userId: tech.id },
    {
      $set: {
        categories,
        serviceRadiusKm: radiusKm,
        isVerified: verified,
        isAvailable: online,
        visitFee,
        experienceYears: 5,
        currentLocation: { type: 'Point', coordinates: [at.lng, at.lat], addressText: 'Test base' },
      },
    },
  );
  return tech;
}

/** supertest helpers bound to a bearer token. */
export function as(actor) {
  const auth = { Authorization: `Bearer ${actor.token}` };
  return {
    get: (url) => request(app).get(url).set(auth),
    post: (url, body = {}) => request(app).post(url).set(auth).send(body),
    patch: (url, body = {}) => request(app).patch(url).set(auth).send(body),
    put: (url, body = {}) => request(app).put(url).set(auth).send(body),
  };
}

export function inMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export const scheduleBody = (overrides = {}) => ({
  scheduledDate: inMinutes(120),
  timeSlotLabel: 'Today 2-4 PM',
  technicianNote: 'Will bring gas refill kit',
  estimatedFee: 1500,
  ...overrides,
});

export async function createBooking(customer, overrides = {}) {
  const res = await as(customer).post('/api/bookings', {
    category: 'AC',
    title: 'AC not cooling, rattling noise',
    description: 'The split AC in the bedroom blows warm air and rattles loudly.',
    ...PLACES.newBaneshwor,
    addressText: 'New Baneshwor, Kathmandu, near Everest Hotel',
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create booking failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/**
 * Drives a fresh booking to `target` with one customer and one technician.
 * Supported targets: SCHEDULE_PROPOSED, CONFIRMED_SCHEDULED, ON_THE_WAY, IN_PROGRESS, COMPLETED.
 */
export async function bookingAt(target, { customer, tech } = {}) {
  const c = customer ?? (await makeCustomer());
  const t = tech ?? (await makeTechnician());
  const { booking } = await createBooking(c);
  const id = booking._id;
  const steps = [
    [
      'SCHEDULE_PROPOSED',
      () => as(t).post(`/api/bookings/${id}/accept-and-schedule`, scheduleBody()),
    ],
    [
      'CONFIRMED_SCHEDULED',
      () => as(c).post(`/api/bookings/${id}/respond-schedule`, { action: 'ACCEPT' }),
    ],
    ['ON_THE_WAY', () => as(t).patch(`/api/bookings/${id}/status`, { status: 'ON_THE_WAY' })],
    ['IN_PROGRESS', () => as(t).patch(`/api/bookings/${id}/status`, { status: 'IN_PROGRESS' })],
    [
      'COMPLETED',
      () => as(t).patch(`/api/bookings/${id}/status`, { status: 'COMPLETED', finalCost: 1800 }),
    ],
  ];
  for (const [status, run] of steps) {
    const res = await run();
    if (res.status !== 200) throw new Error(`step ${status} failed: ${JSON.stringify(res.body)}`);
    if (status === target) break;
  }
  return { id, customer: c, tech: t };
}
