import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { Notification } from '../src/models/Notification.js';
import { TechnicianProfile } from '../src/models/TechnicianProfile.js';
import {
  as,
  bookingAt,
  createBooking,
  makeAdmin,
  makeCustomer,
  makeTechnician,
  registerUser,
  seedCategories,
} from './helpers.js';

beforeEach(async () => {
  await seedCategories();
});

describe('categories', () => {
  it('lists active categories publicly and lets admins manage them', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.categories.map((c) => c.key)).toEqual([
      'AC',
      'COMPUTER',
      'PLUMBING',
      'ELECTRICAL',
    ]);

    const admin = await makeAdmin();
    const created = await as(admin).post('/api/admin/categories', {
      key: 'carpentry',
      name: 'Carpentry',
      icon: 'Hammer',
      sortOrder: 6,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.category.key).toBe('CARPENTRY');

    const dup = await as(admin).post('/api/admin/categories', { key: 'AC', name: 'Again' });
    expect(dup.status).toBe(409);

    const hidden = await as(admin).patch(
      `/api/admin/categories/${created.body.data.category._id}`,
      {
        isActive: false,
      },
    );
    expect(hidden.status).toBe(200);
    expect((await request(app).get('/api/categories')).body.data.categories).toHaveLength(4);

    const customer = await makeCustomer();
    expect(
      (await as(customer).post('/api/admin/categories', { key: 'X1', name: 'Nope' })).status,
    ).toBe(403);
  });
});

describe('admin', () => {
  it('verifies technicians (with a TECH_VERIFIED notification) and filters them', async () => {
    const admin = await makeAdmin();
    const pending = await makeTechnician({ verified: false, name: 'Pending Pasang' });
    await makeTechnician({ name: 'Verified Vinod' });

    const list = await as(admin).get('/api/admin/technicians?verified=false');
    expect(list.status).toBe(200);
    expect(list.body.data.technicians.map((t) => t.user.name)).toEqual(['Pending Pasang']);

    const search = await as(admin).get('/api/admin/technicians?q=vinod');
    expect(search.body.data.technicians).toHaveLength(1);

    const res = await as(admin).patch(`/api/admin/technicians/${pending.id}/verify`, {
      isVerified: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.isVerified).toBe(true);
    expect(await Notification.countDocuments({ userId: pending.id, type: 'TECH_VERIFIED' })).toBe(
      1,
    );

    const blank = await registerUser({ role: 'technician' });
    const refused = await as(admin).patch(`/api/admin/technicians/${blank.id}/verify`, {
      isVerified: true,
    });
    expect(refused.status).toBe(422);
  });

  it('deactivates users (signing them out) and reports stats', async () => {
    const admin = await makeAdmin();
    const tech = await makeTechnician();
    await bookingAt('COMPLETED', { tech });
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer, { category: 'PLUMBING' });
    await as(customer).post(`/api/bookings/${booking._id}/cancel`, { reason: 'Not needed now' });

    const stats = await as(admin).get('/api/admin/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.data).toMatchObject({
      usersByRole: { admin: 1, technician: 1, customer: 2 },
      techniciansPendingVerification: 0,
      bookingsByStatus: { COMPLETED: 1, CANCELLED: 1 },
      completionRate: 0.5,
    });
    expect(stats.body.data.bookingsPerDay).toHaveLength(7);
    expect(stats.body.data.bookingsPerDay[6].count).toBe(2);

    const off = await as(admin).patch(`/api/admin/users/${tech.id}/active`, { isActive: false });
    expect(off.status).toBe(200);
    expect((await TechnicianProfile.findOne({ userId: tech.id })).isAvailable).toBe(false);
    expect((await as(tech).get('/api/auth/me')).status).toBe(401);

    const self = await as(admin).patch(`/api/admin/users/${admin.id}/active`, { isActive: false });
    expect(self.status).toBe(422);

    const bookings = await as(admin).get('/api/admin/bookings?status=COMPLETED');
    expect(bookings.body.data.bookings).toHaveLength(1);
    const detail = await as(admin).get(`/api/admin/bookings/${bookings.body.data.bookings[0]._id}`);
    expect(detail.body.data.booking.notifiedTechnicians[0].technicianId.name).toEqual(
      expect.any(String),
    );
  });
});

describe('notifications', () => {
  it('lists with unreadCount, marks one and all as read', async () => {
    const { tech } = await bookingAt('CONFIRMED_SCHEDULED');
    const api = as(tech);
    const list = await api.get('/api/notifications?unread=true');
    expect(list.status).toBe(200);
    expect(list.body.meta.unreadCount).toBeGreaterThanOrEqual(2);
    const first = list.body.data.notifications[0];

    const one = await api.patch(`/api/notifications/${first._id}/read`);
    expect(one.body.data.notification.isRead).toBe(true);

    const all = await api.patch('/api/notifications/read-all');
    expect(all.status).toBe(200);
    expect((await api.get('/api/notifications')).body.meta.unreadCount).toBe(0);

    const someoneElse = await makeCustomer();
    expect((await as(someoneElse).patch(`/api/notifications/${first._id}/read`)).status).toBe(404);
  });
});
