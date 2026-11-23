import { beforeEach, describe, expect, it } from 'vitest';
import { BOOKING_STATUS_VALUES } from '../src/config/constants.js';
import { Booking } from '../src/models/Booking.js';
import { TechnicianProfile } from '../src/models/TechnicianProfile.js';
import {
  assertTransition,
  stageOf,
  TRANSITION_TABLE,
} from '../src/services/bookingStateMachine.js';
import { findEligibleTechnicians } from '../src/services/dispatch.service.js';
import {
  PLACES,
  as,
  bookingAt,
  createBooking,
  inMinutes,
  makeAdmin,
  makeCustomer,
  makeTechnician,
  scheduleBody,
  seedCategories,
} from './helpers.js';

beforeEach(async () => {
  await seedCategories();
});

const url = (id, action = '') => `/api/bookings/${id}${action ? `/${action}` : ''}`;

describe('accept-and-schedule race', () => {
  it('two technicians accepting at once: exactly one 200 and one 409 ALREADY_TAKEN', async () => {
    const techA = await makeTechnician({ at: PLACES.koteshwor });
    const techB = await makeTechnician({ at: PLACES.shankhamul });
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer);

    const results = await Promise.all([
      as(techA).post(url(booking._id, 'accept-and-schedule'), scheduleBody()),
      as(techB).post(url(booking._id, 'accept-and-schedule'), scheduleBody()),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('ALREADY_TAKEN');

    const stored = await Booking.findById(booking._id);
    const winner = results.find((r) => r.status === 200) === results[0] ? techA : techB;
    expect(String(stored.technicianId)).toBe(winner.id);
    expect(stored).toMatchObject({ status: 'SCHEDULE_PROPOSED', scheduleStatus: 'PENDING' });
    expect(stored.proposedSchedule.round).toBe(1);
    expect(stored.estimatedCost).toBe(1500);
    const winnerEntry = stored.notifiedTechnicians.find(
      (n) => String(n.technicianId) === winner.id,
    );
    expect(winnerEntry.response).toBe('ACCEPTED');
  });

  it('refuses unverified or offline technicians and too-early times', async () => {
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer);
    const offline = await makeTechnician({ online: false });
    const ready = await makeTechnician();

    const r1 = await as(offline).post(url(booking._id, 'accept-and-schedule'), scheduleBody());
    expect(r1.status).toBe(403);
    expect(r1.body.error.code).toBe('NOT_ELIGIBLE');

    const r2 = await as(ready).post(
      url(booking._id, 'accept-and-schedule'),
      scheduleBody({ scheduledDate: inMinutes(5) }),
    );
    expect(r2.status).toBe(422);
    expect(r2.body.error.details[0].field).toBe('scheduledDate');
  });
});

describe('state machine', () => {
  it('every transition not in the table is 409 INVALID_TRANSITION with { from, to }', () => {
    const legal = new Set(TRANSITION_TABLE.flatMap((t) => t.from.map((f) => `${f}->${t.to}`)));
    let checked = 0;
    for (const from of BOOKING_STATUS_VALUES) {
      for (const to of BOOKING_STATUS_VALUES) {
        if (legal.has(`${from}->${to}`)) continue;
        const booking = { status: from, customerId: 'c', technicianId: 't', statusHistory: [] };
        try {
          assertTransition(booking, to, { id: 't', role: 'technician' });
          throw new Error(`expected ${from} -> ${to} to be refused`);
        } catch (err) {
          expect(err.status).toBe(409);
          expect(err.code).toBe('INVALID_TRANSITION');
          expect(err.details).toEqual({ from, to });
        }
        checked += 1;
      }
    }
    expect(checked).toBe(64 - legal.size);
  });

  it('illegal API transitions answer 409; wrong roles answer 403', async () => {
    const { id, customer, tech } = await bookingAt('SCHEDULE_PROPOSED');

    const skip = await as(tech).patch(url(id, 'status'), { status: 'IN_PROGRESS' });
    expect(skip.status).toBe(409);
    expect(skip.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { from: 'SCHEDULE_PROPOSED', to: 'IN_PROGRESS' },
    });

    const customerPatch = await as(customer).patch(url(id, 'status'), { status: 'ON_THE_WAY' });
    expect(customerPatch.status).toBe(403);

    const techResponds = await as(tech).post(url(id, 'respond-schedule'), { action: 'ACCEPT' });
    expect(techResponds.status).toBe(403);

    const otherTech = await makeTechnician();
    expect((await as(otherTech).get(url(id))).status).toBe(404);
  });

  it('COMPLETED requires finalCost; the full happy path updates counters and the tracker', async () => {
    const { id, customer, tech } = await bookingAt('IN_PROGRESS');
    const missing = await as(tech).patch(url(id, 'status'), { status: 'COMPLETED' });
    expect(missing.status).toBe(422);
    expect(missing.body.error.details[0].field).toBe('finalCost');

    const done = await as(tech).patch(url(id, 'status'), { status: 'COMPLETED', finalCost: 2000 });
    expect(done.status).toBe(200);
    expect(done.body.data.booking).toMatchObject({ status: 'COMPLETED', finalCost: 2000 });
    expect(done.body.data.booking.stage).toMatchObject({ stage: 6, cancelled: false });

    const profile = await TechnicianProfile.findOne({ userId: tech.id });
    expect(profile.completedJobs).toBe(1);

    const detail = await as(customer).get(url(id));
    expect(detail.body.data.booking.allowedActions).toEqual(['REVIEW']);
    expect(detail.body.data.booking.statusHistory.map((h) => h.status)).toEqual([
      'REQUESTED',
      'SEARCHING_TECHNICIAN',
      'SCHEDULE_PROPOSED',
      'CONFIRMED_SCHEDULED',
      'ON_THE_WAY',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
    expect(detail.body.data.booking.technician.phone).toBeDefined();
  });

  it('ON_THE_WAY seeds liveLocation with a straight-line ETA', async () => {
    const { id } = await bookingAt('ON_THE_WAY');
    const stored = await Booking.findById(id);
    expect(stored.liveLocation).toMatchObject({ lng: 85.3494, lat: 27.6789 });
    expect(stored.liveLocation.etaMinutes).toBe(4); // ~1.6 km at 25 km/h
  });
});

describe('reschedule rounds', () => {
  it('REQUEST_NEW_TIME -> propose again -> round 2 ... and a 4th round is refused', async () => {
    const { id, customer, tech } = await bookingAt('SCHEDULE_PROPOSED');

    const ask1 = await as(customer).post(url(id, 'respond-schedule'), {
      action: 'REQUEST_NEW_TIME',
      note: 'Evening please',
    });
    expect(ask1.status).toBe(200);
    expect(ask1.body.data.booking).toMatchObject({
      status: 'SCHEDULE_PROPOSED',
      scheduleStatus: 'RESCHEDULE_REQUESTED',
    });
    expect(ask1.body.data.booking.scheduleHistory[0]).toMatchObject({
      response: 'REQUEST_NEW_TIME',
      responseNote: 'Evening please',
    });

    const early = await as(tech).get(url(id));
    expect(early.body.data.booking.allowedActions).toContain('PROPOSE_SCHEDULE');

    const round2 = await as(tech).post(
      url(id, 'propose-schedule'),
      scheduleBody({ timeSlotLabel: '6-8 PM' }),
    );
    expect(round2.status).toBe(200);
    expect(round2.body.data.booking.proposedSchedule).toMatchObject({
      round: 2,
      timeSlotLabel: '6-8 PM',
    });
    expect(round2.body.data.booking.scheduleStatus).toBe('PENDING');

    const notExpected = await as(tech).post(url(id, 'propose-schedule'), scheduleBody());
    expect(notExpected.status).toBe(409);

    await as(customer)
      .post(url(id, 'respond-schedule'), { action: 'REQUEST_NEW_TIME' })
      .expect(200);
    const round3 = await as(tech).post(url(id, 'propose-schedule'), scheduleBody());
    expect(round3.body.data.booking.proposedSchedule.round).toBe(3);

    const askAgain = await as(customer).post(url(id, 'respond-schedule'), {
      action: 'REQUEST_NEW_TIME',
    });
    expect(askAgain.status).toBe(409);
    expect(askAgain.body.error.code).toBe('MAX_ROUNDS_REACHED');

    const view = await as(customer).get(url(id));
    expect(view.body.data.booking.allowedActions).toEqual([
      'ACCEPT_SCHEDULE',
      'DECLINE_TECHNICIAN',
      'CANCEL',
      'CHAT',
    ]);

    await as(customer).post(url(id, 'respond-schedule'), { action: 'ACCEPT' }).expect(200);
    const round4 = await as(tech).post(url(id, 'propose-schedule'), scheduleBody());
    expect(round4.status).toBe(409);
    expect(round4.body.error.code).toBe('MAX_ROUNDS_REACHED');

    const stored = await Booking.findById(id);
    expect(stored.scheduleHistory).toHaveLength(3);
    expect(stored.status).toBe('CONFIRMED_SCHEDULED');
  });

  it('a technician can re-propose a confirmed time, which returns it to SCHEDULE_PROPOSED', async () => {
    const { id, tech } = await bookingAt('CONFIRMED_SCHEDULED');
    const res = await as(tech).post(
      url(id, 'propose-schedule'),
      scheduleBody({ timeSlotLabel: 'Tomorrow 9 AM' }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.booking).toMatchObject({
      status: 'SCHEDULE_PROPOSED',
      scheduleStatus: 'PENDING',
    });
    expect(res.body.data.booking.proposedSchedule.round).toBe(2);
  });
});

describe('decline and release', () => {
  it('DECLINE_TECHNICIAN returns to SEARCHING_TECHNICIAN and the technician is excluded everywhere', async () => {
    const declined = await makeTechnician({ at: PLACES.koteshwor });
    const other = await makeTechnician({ at: PLACES.maharajgunj });
    const { id, customer } = await bookingAt('SCHEDULE_PROPOSED', { tech: declined });

    const res = await as(customer).post(url(id, 'respond-schedule'), {
      action: 'DECLINE_TECHNICIAN',
      note: 'Fee too high',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.booking).toMatchObject({
      status: 'SEARCHING_TECHNICIAN',
      scheduleStatus: 'NONE',
      technicianId: null,
      proposedSchedule: null,
    });
    expect(res.body.data.matchedCount).toBe(1);

    const stored = await Booking.findById(id);
    expect(stored.excludedTechnicians.map(String)).toEqual([declined.id]);
    const entry = stored.notifiedTechnicians.find((n) => String(n.technicianId) === declined.id);
    expect(entry.response).toBe('DECLINED');
    expect(stored.scheduleHistory[0].response).toBe('DECLINE_TECHNICIAN');

    const eligible = await findEligibleTechnicians(stored);
    expect(eligible.map((t) => t.userId)).toEqual([other.id]);

    const nearby = await as(declined).get('/api/technicians/nearby-requests');
    expect(nearby.body.data.requests.map((r) => r.bookingId)).not.toContain(id);
    expect((await as(declined).get(url(id))).status).toBe(404);
    const retry = await as(declined).post(url(id, 'accept-and-schedule'), scheduleBody());
    expect(retry.status).toBe(404);

    const takeover = await as(other).post(url(id, 'accept-and-schedule'), scheduleBody());
    expect(takeover.status).toBe(200);
  });

  it('a technician can release before ON_THE_WAY but not after', async () => {
    const { id, customer, tech } = await bookingAt('CONFIRMED_SCHEDULED');
    const res = await as(tech).post(url(id, 'release'), { reason: 'Vehicle broke down' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SEARCHING_TECHNICIAN');

    const stored = await Booking.findById(id);
    expect(stored.excludedTechnicians.map(String)).toContain(tech.id);
    expect(
      stored.notifiedTechnicians.find((n) => String(n.technicianId) === tech.id).response,
    ).toBe('RELEASED');
    expect((await as(customer).get(url(id))).body.data.booking.stage.stage).toBe(1);

    const late = await bookingAt('ON_THE_WAY');
    const refused = await as(late.tech).post(url(late.id, 'release'), {
      reason: 'Changed my mind',
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('cancel', () => {
  it('customers cancel before departure; only admins cancel ON_THE_WAY / IN_PROGRESS', async () => {
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer);
    const short = await as(customer).post(url(booking._id, 'cancel'), { reason: 'no' });
    expect(short.status).toBe(422);

    const ok = await as(customer).post(url(booking._id, 'cancel'), { reason: 'Fixed it myself' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.booking).toMatchObject({
      status: 'CANCELLED',
      cancellation: { role: 'customer', reason: 'Fixed it myself' },
      stage: { stage: 1, cancelled: true },
    });
    const twice = await as(customer).post(url(booking._id, 'cancel'), { reason: 'Again please' });
    expect(twice.status).toBe(409);

    const { id, customer: c2, tech } = await bookingAt('ON_THE_WAY');
    expect((await as(c2).post(url(id, 'cancel'), { reason: 'Too slow today' })).status).toBe(403);
    expect((await as(tech).post(url(id, 'cancel'), { reason: 'Cannot make it' })).status).toBe(403);

    const admin = await makeAdmin();
    const adminCancel = await as(admin).post(url(id, 'cancel'), {
      reason: 'Customer called support',
    });
    expect(adminCancel.status).toBe(200);
    expect(stageOf(adminCancel.body.data.booking)).toEqual({
      stage: 4,
      label: 'On the way',
      cancelled: true,
    });
  });

  it('rebroadcast is limited to once per 2 minutes', async () => {
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer);
    const res = await as(customer).post(url(booking._id, 'rebroadcast'));
    expect(res.status).toBe(429);
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(100);

    await Booking.updateOne(
      { _id: booking._id },
      { lastBroadcastAt: new Date(Date.now() - 3 * 60_000) },
    );
    const later = await as(customer).post(url(booking._id, 'rebroadcast'));
    expect(later.status).toBe(200);
    expect(later.body.data).toMatchObject({ matchedCount: 0, notifiedCount: 0 });
  });
});

describe('review', () => {
  it('only once, only COMPLETED, with correct rating maths', async () => {
    const early = await bookingAt('IN_PROGRESS');
    const tooEarly = await as(early.customer).post(url(early.id, 'review'), { rating: 5 });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('NOT_COMPLETED');

    const { id, customer, tech } = await bookingAt('COMPLETED');
    await TechnicianProfile.updateOne({ userId: tech.id }, { ratingAvg: 4, ratingCount: 2 });

    const res = await as(customer).post(url(id, 'review'), {
      rating: 5,
      comment: 'Quick and tidy',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.booking.review).toMatchObject({ rating: 5, comment: 'Quick and tidy' });

    const profile = await TechnicianProfile.findOne({ userId: tech.id });
    expect(profile.ratingCount).toBe(3);
    expect(profile.ratingAvg).toBe(4.33); // (4 * 2 + 5) / 3 = 4.333...

    const again = await as(customer).post(url(id, 'review'), { rating: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REVIEWED');

    const bad = await as(customer).post(url(id, 'review'), { rating: 4.5 });
    expect(bad.status).toBe(422);

    const card = await as(customer).get(`/api/technicians/${tech.id}/public`);
    expect(card.body.data.technician.reviews[0]).toMatchObject({
      rating: 5,
      comment: 'Quick and tidy',
    });
  });
});

describe('chat', () => {
  it('opens once a technician is assigned, between the two participants only', async () => {
    const customer = await makeCustomer();
    const { booking } = await createBooking(customer);
    const closed = await as(customer).post(url(booking._id, 'messages'), { text: 'Hello?' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('CHAT_UNAVAILABLE');

    const { id, customer: c, tech } = await bookingAt('SCHEDULE_PROPOSED');
    await as(c).post(url(id, 'messages'), { text: 'Can you come earlier?' }).expect(201);
    await as(tech).post(url(id, 'messages'), { text: 'I can try 1 PM' }).expect(201);

    const list = await as(c).get(url(id, 'messages'));
    expect(list.status).toBe(200);
    expect(list.body.data.messages.map((m) => m.text)).toEqual([
      'Can you come earlier?',
      'I can try 1 PM',
    ]);
    expect(list.body.meta).toMatchObject({ page: 1, total: 2 });

    const stranger = await makeCustomer();
    expect((await as(stranger).get(url(id, 'messages'))).status).toBe(404);
  });
});

describe('lists', () => {
  it('customer and technician lists filter by active/past and hide contact until confirmed', async () => {
    const { id, customer, tech } = await bookingAt('SCHEDULE_PROPOSED');
    const mine = await as(customer).get('/api/bookings/my?status=active');
    expect(mine.status).toBe(200);
    expect(mine.body.data.bookings).toHaveLength(1);
    expect(mine.body.data.bookings[0].technician.phone).toBeUndefined();
    expect(
      (await as(customer).get('/api/bookings/my?status=past')).body.data.bookings,
    ).toHaveLength(0);

    const assigned = await as(tech).get('/api/bookings/technician/my');
    expect(assigned.body.data.bookings[0]).toMatchObject({ _id: id, area: 'New Baneshwor' });
    expect(assigned.body.data.bookings[0].addressText).toBeUndefined();

    await as(customer).post(url(id, 'respond-schedule'), { action: 'ACCEPT' }).expect(200);
    const confirmed = await as(tech).get('/api/bookings/technician/my');
    expect(confirmed.body.data.bookings[0].addressText).toMatch(/New Baneshwor/);

    const tooBig = await as(customer).get('/api/bookings/my?limit=51');
    expect(tooBig.status).toBe(422);
  });
});
