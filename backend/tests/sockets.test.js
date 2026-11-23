import http from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connectClient } from 'socket.io-client';
import app from '../src/app.js';
import { closeSocket, initSocket } from '../src/sockets/index.js';
import {
  PLACES,
  as,
  bookingAt,
  createBooking,
  makeCustomer,
  makeTechnician,
  scheduleBody,
  seedCategories,
} from './helpers.js';

let server;
let baseUrl;
const clients = [];

beforeAll(async () => {
  server = http.createServer(app);
  initSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await closeSocket();
});

beforeEach(async () => {
  await seedCategories();
});

afterEach(() => {
  while (clients.length) clients.pop().close();
});

function connect(actor) {
  return new Promise((resolve, reject) => {
    const socket = connectClient(baseUrl, {
      auth: { token: actor.token },
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitFor(socket, event, { timeoutMs = 4000, where = () => true } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    const onEvent = (payload) => {
      if (!where(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });
}

const emitAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

describe('sockets', () => {
  it('rejects a handshake without a valid token', async () => {
    await expect(connect({ token: 'garbage' })).rejects.toThrow(/Invalid or expired token/);
  });

  it('notifies nearby technicians and tells the customer about the proposal', async () => {
    const tech = await makeTechnician();
    const customer = await makeCustomer();
    const techSocket = await connect(tech);
    const customerSocket = await connect(customer);

    const newRequest = waitFor(techSocket, 'new_repair_request');
    const techNotification = waitFor(techSocket, 'notification:new');
    const { booking } = await createBooking(customer);

    const request = await newRequest;
    expect(request).toMatchObject({
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      category: 'AC',
      area: 'New Baneshwor',
      urgency: 'NORMAL',
      imagesCount: 0,
      booking: { _id: booking._id, status: 'SEARCHING_TECHNICIAN' },
    });
    expect(request.distanceKm).toBeCloseTo(1.6, 0);
    expect(JSON.stringify(request)).not.toMatch(/Everest Hotel|coordinates/);
    expect((await techNotification).notification.type).toBe('NEW_REQUEST');

    const proposed = waitFor(customerSocket, 'schedule_proposed');
    await as(tech)
      .post(`/api/bookings/${booking._id}/accept-and-schedule`, scheduleBody())
      .expect(200);
    const payload = await proposed;
    expect(payload).toMatchObject({
      bookingId: booking._id,
      booking: {
        status: 'SCHEDULE_PROPOSED',
        scheduleStatus: 'PENDING',
        stage: { stage: 2 },
        technician: { _id: tech.id },
      },
      proposal: { round: 1, timeSlotLabel: 'Today 2-4 PM' },
    });
  });

  it('tells the losing technicians the booking was taken', async () => {
    const winner = await makeTechnician({ at: PLACES.koteshwor });
    const loser = await makeTechnician({ at: PLACES.shankhamul });
    const customer = await makeCustomer();
    const loserSocket = await connect(loser);
    const { booking } = await createBooking(customer);

    const taken = waitFor(loserSocket, 'booking_taken');
    await as(winner)
      .post(`/api/bookings/${booking._id}/accept-and-schedule`, scheduleBody())
      .expect(200);
    expect(await taken).toMatchObject({
      bookingId: booking._id,
      booking: { status: 'SCHEDULE_PROPOSED' },
    });
  });

  it('both parties receive booking_status_updated; live location reaches the booking room', async () => {
    const { id, customer, tech } = await bookingAt('CONFIRMED_SCHEDULED');
    const customerSocket = await connect(customer);
    const techSocket = await connect(tech);

    const joined = await emitAck(customerSocket, 'join_booking_room', { bookingId: id });
    expect(joined).toEqual({ ok: true, room: `booking:${id}` });

    const forCustomer = waitFor(customerSocket, 'booking_status_updated');
    const forTech = waitFor(techSocket, 'booking_status_updated');
    await as(tech).patch(`/api/bookings/${id}/status`, { status: 'ON_THE_WAY' }).expect(200);
    const [c, t] = await Promise.all([forCustomer, forTech]);
    expect(c).toMatchObject({
      bookingId: id,
      status: 'ON_THE_WAY',
      booking: { stage: { stage: 4 } },
    });
    expect(t.bookingId).toBe(id);

    const moved = waitFor(customerSocket, 'technician_location_updated');
    const ack = await emitAck(techSocket, 'technician_location_update', {
      bookingId: id,
      ...PLACES.shankhamul,
    });
    expect(ack).toMatchObject({ ok: true, ignored: false });
    const live = await moved;
    expect(live).toMatchObject({ bookingId: id, lng: 85.329, lat: 27.683 });
    expect(live.etaMinutes).toBeGreaterThan(0);

    const throttled = await emitAck(techSocket, 'technician_location_update', {
      bookingId: id,
      ...PLACES.koteshwor,
    });
    expect(throttled).toMatchObject({ ok: true, ignored: true });
  });

  it("refuses a non-participant's join_booking_room and relays typing to the room only", async () => {
    const { id, customer, tech } = await bookingAt('SCHEDULE_PROPOSED');
    const stranger = await makeCustomer();
    const strangerSocket = await connect(stranger);
    const refused = await emitAck(strangerSocket, 'join_booking_room', { bookingId: id });
    expect(refused).toMatchObject({ ok: false, error: 'NOT_FOUND' });

    const bad = await emitAck(strangerSocket, 'join_booking_room', { bookingId: 'nope' });
    expect(bad).toMatchObject({ ok: false, error: 'VALIDATION_ERROR' });

    const customerSocket = await connect(customer);
    const techSocket = await connect(tech);
    await emitAck(customerSocket, 'join_booking_room', { bookingId: id });
    await emitAck(techSocket, 'join_booking_room', { bookingId: id });

    const typing = waitFor(customerSocket, 'typing');
    const ack = await emitAck(techSocket, 'typing', { bookingId: id });
    expect(ack).toEqual({ ok: true });
    expect(await typing).toMatchObject({ bookingId: id, userId: tech.id, role: 'technician' });

    const message = waitFor(techSocket, 'booking_message');
    await as(customer).post(`/api/bookings/${id}/messages`, { text: 'See you soon' }).expect(201);
    expect((await message).message).toMatchObject({ text: 'See you soon', senderRole: 'customer' });

    const compat = await emitAck(strangerSocket, 'join_user_room', {});
    expect(compat).toEqual({ ok: true, room: `user:${stranger.id}` });
  });

  it('booking_cancelled reaches the booking room and the assigned technician', async () => {
    const { id, customer, tech } = await bookingAt('CONFIRMED_SCHEDULED');
    const techSocket = await connect(tech);
    const cancelled = waitFor(techSocket, 'booking_cancelled');
    const notification = waitFor(techSocket, 'notification:new');
    await as(customer).post(`/api/bookings/${id}/cancel`, { reason: 'Plans changed' }).expect(200);
    expect(await cancelled).toMatchObject({
      bookingId: id,
      reason: 'Plans changed',
      cancelledBy: 'customer',
    });
    expect((await notification).notification.type).toBe('BOOKING_CANCELLED');
  });
});
