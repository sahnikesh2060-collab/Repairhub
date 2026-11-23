/**
 * Kathmandu Valley demo data.
 *   npm run seed -w backend              # refuses if the seed accounts already exist
 *   npm run seed -w backend -- --reset   # drops every collection first
 * Never runs with NODE_ENV=production. Every password is Password@123.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ALL_MODELS, connectDB, disconnectDB, syncAllIndexes } from '../config/db.js';
import {
  BOOKING_STATUS as S,
  NOTIFIED_RESPONSE,
  ROLES,
  SCHEDULE_RESPONSE,
  SCHEDULE_STATUS,
} from '../config/constants.js';
import { Booking } from '../models/Booking.js';
import { Category } from '../models/Category.js';
import { Message } from '../models/Message.js';
import { TechnicianProfile } from '../models/TechnicianProfile.js';
import { User } from '../models/User.js';
import { etaMinutes } from '../services/booking.service.js';
import { statusEntry, transition } from '../services/bookingStateMachine.js';
import { broadcast, findEligibleTechnicians } from '../services/dispatch.service.js';
import { generateBookingCode } from '../utils/bookingCode.js';
import { fromPoint, haversineKm, toPoint } from '../utils/geo.js';

const PASSWORD = 'Password@123';
const MINUTE = 60_000;
const ago = (minutes) => new Date(Date.now() - minutes * MINUTE);
const later = (minutes) => new Date(Date.now() + minutes * MINUTE);

const PLACES = {
  newBaneshwor: { lat: 27.6915, lng: 85.342, text: 'New Baneshwor, Kathmandu' },
  patan: { lat: 27.671, lng: 85.324, text: 'Patan, Lalitpur' },
  thamel: { lat: 27.7154, lng: 85.3123, text: 'Thamel, Kathmandu' },
  koteshwor: { lat: 27.6789, lng: 85.3494, text: 'Koteshwor, Kathmandu' },
  shankhamul: { lat: 27.683, lng: 85.329, text: 'Shankhamul, Kathmandu' },
  kalanki: { lat: 27.6935, lng: 85.2817, text: 'Kalanki, Kathmandu' },
  maharajgunj: { lat: 27.7367, lng: 85.3304, text: 'Maharajgunj, Kathmandu' },
  bhaktapur: { lat: 27.671, lng: 85.4298, text: 'Bhaktapur' },
  kirtipur: { lat: 27.6787, lng: 85.2775, text: 'Kirtipur, Kathmandu' },
  boudha: { lat: 27.7215, lng: 85.362, text: 'Boudha, Kathmandu' },
  jawalakhel: { lat: 27.6727, lng: 85.3141, text: 'Jawalakhel, Lalitpur' },
  chabahil: { lat: 27.7174, lng: 85.3466, text: 'Chabahil, Kathmandu' },
  balaju: { lat: 27.734, lng: 85.304, text: 'Balaju, Kathmandu' },
};
const point = (p) => toPoint({ lng: p.lng, lat: p.lat });
const located = (p, detail) => ({
  ...point(p),
  addressText: detail ? `${p.text}, ${detail}` : p.text,
});

const CATEGORIES = [
  {
    key: 'AC',
    name: 'AC Repair',
    icon: 'AirVent',
    description: 'Split and window AC service, gas refill, leaks',
    sortOrder: 1,
  },
  {
    key: 'COMPUTER',
    name: 'Computer & Laptop',
    icon: 'Laptop',
    description: 'Boot problems, OS installs, hardware upgrades',
    sortOrder: 2,
  },
  {
    key: 'PLUMBING',
    name: 'Plumbing',
    icon: 'Wrench',
    description: 'Leaks, taps, drains, water tanks and pumps',
    sortOrder: 3,
  },
  {
    key: 'ELECTRICAL',
    name: 'Electrical',
    icon: 'Zap',
    description: 'Wiring, sockets, MCBs, inverters',
    sortOrder: 4,
  },
  {
    key: 'APPLIANCE',
    name: 'Home Appliances',
    icon: 'Refrigerator',
    description: 'Fridges, washing machines, microwaves',
    sortOrder: 5,
  },
  {
    key: 'CARPENTRY',
    name: 'Carpentry',
    icon: 'Hammer',
    description: 'Doors, furniture repair, fittings',
    sortOrder: 6,
  },
];

const CUSTOMERS = [
  {
    key: 'sita',
    name: 'Sita Sharma',
    email: 'sita@repairhub.test',
    phone: '9841000001',
    place: PLACES.newBaneshwor,
    addresses: [
      { label: 'Home', place: PLACES.newBaneshwor, detail: 'near Everest Hotel', isDefault: true },
      { label: 'Office', place: PLACES.thamel, detail: 'Chaksibari Marg' },
    ],
    test: 'Open AC request (rebroadcast/cancel), confirmed electrical job, completed + reviewed job',
  },
  {
    key: 'ram',
    name: 'Ram Bahadur Karki',
    email: 'ram@repairhub.test',
    phone: '9841000002',
    place: PLACES.patan,
    addresses: [{ label: 'Home', place: PLACES.patan, detail: 'Mangal Bazaar', isDefault: true }],
    test: 'Answer a PENDING proposal (accept / new time / decline), live ON_THE_WAY tracking',
  },
  {
    key: 'gita',
    name: 'Gita Adhikari',
    email: 'gita@repairhub.test',
    phone: '9841000003',
    place: PLACES.thamel,
    addresses: [{ label: 'Home', place: PLACES.thamel, detail: 'JP Marg', isDefault: true }],
    test: 'Waiting for a re-proposal (RESCHEDULE_REQUESTED); a repair IN_PROGRESS',
  },
];

const TECHNICIANS = [
  {
    key: 'bikash',
    name: 'Bikash Shrestha',
    place: PLACES.koteshwor,
    categories: ['AC', 'APPLIANCE'],
    radius: 10,
    fee: 500,
    years: 8,
    bio: 'AC and fridge specialist, 8 years with Daikin and LG units.',
    test: 'ON_THE_WAY to Ram: send location updates to move the live marker',
  },
  {
    key: 'sunita',
    name: 'Sunita Maharjan',
    place: PLACES.shankhamul,
    categories: ['COMPUTER'],
    radius: 8,
    fee: 400,
    years: 6,
    bio: 'Laptop and desktop repair, Windows and Linux installs.',
    test: 'Proposal PENDING with Ram; release the job',
  },
  {
    key: 'rajesh',
    name: 'Rajesh Tamang',
    place: PLACES.kalanki,
    categories: ['PLUMBING'],
    radius: 12,
    fee: 350,
    years: 10,
    bio: 'Plumbing, water pumps and tank cleaning.',
    test: 'Gita asked for a new time: propose round 2',
  },
  {
    key: 'anil',
    name: 'Anil Karki',
    place: PLACES.maharajgunj,
    categories: ['ELECTRICAL', 'AC'],
    radius: 10,
    fee: 600,
    years: 12,
    bio: 'Licensed electrician; wiring, inverters and AC electrics.',
    test: "Sees Sita's open AC request; confirmed job: mark ON_THE_WAY",
  },
  {
    key: 'prakash',
    name: 'Prakash Suwal',
    place: PLACES.bhaktapur,
    categories: ['CARPENTRY', 'PLUMBING'],
    radius: 15,
    fee: 450,
    years: 15,
    bio: 'Carpentry and plumbing around Bhaktapur.',
    test: 'East of the valley; nearby-requests from his own radius',
  },
  {
    key: 'nabin',
    name: 'Nabin Dangol',
    place: PLACES.kirtipur,
    categories: ['COMPUTER', 'ELECTRICAL'],
    radius: 5,
    fee: 300,
    years: 3,
    bio: 'Computer and small electrical jobs in Kirtipur.',
    edge: 'RADIUS TOO SMALL (5 km) to reach New Baneshwor',
    test: "Never notified for Sita's New Baneshwor requests",
  },
  {
    key: 'pasang',
    name: 'Pasang Sherpa',
    place: PLACES.boudha,
    categories: ['COMPUTER'],
    radius: 10,
    fee: 450,
    years: 4,
    verified: false,
    bio: 'Hardware upgrades and data recovery.',
    edge: 'UNVERIFIED (online, but receives no jobs)',
    test: 'Admin verifies this account',
  },
  {
    key: 'manoj',
    name: 'Manoj Joshi',
    place: PLACES.jawalakhel,
    categories: ['APPLIANCE', 'ELECTRICAL'],
    radius: 10,
    fee: 700,
    years: 9,
    online: false,
    bio: 'Washing machines, microwaves, ovens.',
    edge: 'OFFLINE',
    test: 'Go online to start receiving requests',
  },
  {
    key: 'sarita',
    name: 'Sarita Gurung',
    place: PLACES.chabahil,
    categories: ['PLUMBING', 'APPLIANCE'],
    radius: 10,
    fee: 400,
    years: 7,
    bio: 'Plumbing and appliance fixes, quick and tidy.',
    test: 'COMPLETED job with a 5-star review; earnings page',
  },
  {
    key: 'dipak',
    name: 'Dipak Thapa',
    place: PLACES.balaju,
    categories: ['COMPUTER', 'AC'],
    radius: 12,
    fee: 1000,
    years: 11,
    bio: 'Senior technician for desktops, servers and AC.',
    test: 'IN_PROGRESS job with Gita: complete it with a finalCost',
  },
];

const actor = (user) => ({ id: String(user._id), role: user.role });

async function dropAll() {
  for (const model of ALL_MODELS) {
    try {
      await model.collection.drop();
    } catch (err) {
      if (err.codeName !== 'NamespaceNotFound') throw err;
    }
  }
}

async function createUsers() {
  await User.create({
    name: 'RepairHub Admin',
    email: 'admin@repairhub.test',
    phone: '9841000000',
    password: PASSWORD,
    role: ROLES.ADMIN,
  });

  const customers = {};
  for (const c of CUSTOMERS) {
    customers[c.key] = await User.create({
      name: c.name,
      email: c.email,
      phone: c.phone,
      password: PASSWORD,
      role: ROLES.CUSTOMER,
      savedAddresses: c.addresses.map((a) => ({
        label: a.label,
        addressText: `${a.place.text}, ${a.detail}`,
        location: point(a.place),
        isDefault: Boolean(a.isDefault),
      })),
    });
  }

  const technicians = {};
  for (const [i, t] of TECHNICIANS.entries()) {
    const user = await User.create({
      name: t.name,
      email: `${t.key}@repairhub.test`,
      phone: `98510000${String(i + 1).padStart(2, '0')}`,
      password: PASSWORD,
      role: ROLES.TECHNICIAN,
    });
    await TechnicianProfile.create({
      userId: user._id,
      categories: t.categories,
      bio: t.bio,
      experienceYears: t.years,
      visitFee: t.fee,
      serviceRadiusKm: t.radius,
      isVerified: t.verified ?? true,
      isAvailable: t.online ?? true,
      currentLocation: located(t.place),
      lastLocationAt: ago(30),
    });
    technicians[t.key] = user;
  }
  return { customers, technicians };
}

/**
 * Starts a booking whose status changes are replayed through the real state machine,
 * each stamped `minutesAfter` the creation time so the history reads consistently.
 */
async function startBooking(spec) {
  const createdAt = ago(spec.createdAgo);
  const booking = new Booking({
    bookingCode: await generateBookingCode(createdAt),
    customerId: spec.customer._id,
    category: spec.category,
    title: spec.title,
    description: spec.description,
    location: located(spec.place, spec.detail),
    urgency: spec.urgency ?? 'NORMAL',
    currency: env.CURRENCY,
    status: S.REQUESTED,
    statusHistory: [
      {
        ...statusEntry(S.REQUESTED, actor(spec.customer), 'Request created'),
        timestamp: createdAt,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  });

  const at = (minutesAfter) => new Date(createdAt.getTime() + minutesAfter * MINUTE);
  const step = (to, who, minutesAfter, note = '') => {
    transition(booking, to, who, { note });
    const when = at(minutesAfter);
    booking.statusHistory[booking.statusHistory.length - 1].timestamp = when;
    booking.updatedAt = when;
    return when;
  };
  const search = async () => {
    const when = step(S.SEARCHING_TECHNICIAN, null, 0, 'Nearby technicians notified');
    const matches = await findEligibleTechnicians(booking);
    booking.notifiedTechnicians = matches.map((m) => ({
      technicianId: m.userId,
      distanceKm: m.distanceKm,
      notifiedAt: when,
      response: NOTIFIED_RESPONSE.PENDING,
    }));
  };
  const accept = (tech, minutesAfter, proposal) => {
    const when = at(minutesAfter);
    const notified = booking.notifiedTechnicians.find(
      (n) => String(n.technicianId) === String(tech._id),
    );
    if (notified) notified.response = NOTIFIED_RESPONSE.ACCEPTED;
    else {
      const profileAt = TECHNICIANS.find((t) => t.name === tech.name).place;
      booking.notifiedTechnicians.push({
        technicianId: tech._id,
        distanceKm: Math.round(haversineKm(profileAt, fromPoint(booking.location)) * 10) / 10,
        notifiedAt: when,
        response: NOTIFIED_RESPONSE.ACCEPTED,
      });
    }
    const full = { technicianId: tech._id, proposedAt: when, round: 1, ...proposal };
    booking.technicianId = tech._id;
    booking.proposedSchedule = full;
    booking.scheduleHistory.push(full);
    booking.scheduleStatus = SCHEDULE_STATUS.PENDING;
    booking.estimatedCost = proposal.estimatedFee;
    step(S.SCHEDULE_PROPOSED, actor(tech), minutesAfter, 'Technician accepted and proposed a time');
  };
  const respond = (response, minutesAfter, note = '') => {
    const last = booking.scheduleHistory[booking.scheduleHistory.length - 1];
    last.response = response;
    last.responseNote = note;
    last.respondedAt = at(minutesAfter);
    if (response === SCHEDULE_RESPONSE.ACCEPT) {
      booking.scheduleStatus = SCHEDULE_STATUS.ACCEPTED;
      step(
        S.CONFIRMED_SCHEDULED,
        actor(spec.customer),
        minutesAfter,
        'Customer confirmed the time',
      );
    } else {
      booking.scheduleStatus = SCHEDULE_STATUS.RESCHEDULE_REQUESTED;
      booking.updatedAt = at(minutesAfter);
    }
  };

  return { booking, at, step, search, accept, respond };
}

async function createBookings({ customers: c, technicians: t }) {
  const created = [];
  const save = async (booking, label) => {
    await booking.save({ timestamps: false });
    created.push({ booking, label });
  };

  // Oldest first so booking codes increase with time.

  // 1. COMPLETED with a 5-star review, 3 days ago (Sita / Sarita)
  {
    const b = await startBooking({
      customer: c.sita,
      category: 'PLUMBING',
      title: 'Bathroom tap dripping constantly',
      description:
        'The hot water tap in the upstairs bathroom drips all night even when fully closed.',
      place: PLACES.newBaneshwor,
      detail: 'near Everest Hotel',
      createdAgo: 3 * 24 * 60,
    });
    await b.search();
    b.accept(t.sarita, 6, {
      scheduledDate: b.at(120),
      timeSlotLabel: '11 AM - 1 PM',
      technicianNote: 'Will bring a new cartridge.',
      estimatedFee: 600,
    });
    b.respond(SCHEDULE_RESPONSE.ACCEPT, 10);
    b.step(S.ON_THE_WAY, actor(t.sarita), 100);
    b.step(S.IN_PROGRESS, actor(t.sarita), 125);
    b.booking.finalCost = 800;
    b.booking.completedAt = b.step(S.COMPLETED, actor(t.sarita), 170, 'Cartridge replaced');
    b.booking.review = {
      rating: 5,
      comment: 'Fixed quickly and left the bathroom clean. Highly recommended!',
      createdAt: b.at(240),
    };
    await save(b.booking, 'COMPLETED with a 5-star review');
  }

  // 2. CANCELLED while searching, 2 days ago (Ram)
  {
    const b = await startBooking({
      customer: c.ram,
      category: 'APPLIANCE',
      title: 'Refrigerator not cooling at all',
      description:
        'Samsung double-door fridge stopped cooling; the light works and the compressor clicks.',
      place: PLACES.patan,
      detail: 'Mangal Bazaar',
      createdAgo: 2 * 24 * 60,
    });
    await b.search();
    const reason = 'Bought a new fridge instead';
    const when = b.step(S.CANCELLED, actor(c.ram), 45, reason);
    b.booking.cancellation = { by: c.ram._id, role: ROLES.CUSTOMER, reason, at: when };
    await save(b.booking, 'CANCELLED by the customer');
  }

  // 3. IN_PROGRESS, started 40 minutes ago (Gita / Dipak)
  {
    const b = await startBooking({
      customer: c.gita,
      category: 'COMPUTER',
      title: 'Desktop PC overheating and shutting down',
      description:
        'The office desktop shuts down after about 20 minutes; the fans are very loud first.',
      place: PLACES.thamel,
      detail: 'JP Marg',
      createdAgo: 5 * 60,
    });
    await b.search();
    b.accept(t.dipak, 12, {
      scheduledDate: b.at(240),
      timeSlotLabel: 'Today 12-2 PM',
      technicianNote: 'Bringing thermal paste and a spare fan.',
      estimatedFee: 1200,
    });
    b.respond(SCHEDULE_RESPONSE.ACCEPT, 20);
    b.step(S.ON_THE_WAY, actor(t.dipak), 230);
    b.step(S.IN_PROGRESS, actor(t.dipak), 260, 'Cleaning the heatsink');
    await save(b.booking, 'IN_PROGRESS');
  }

  // 4. ON_THE_WAY with liveLocation and a short chat (Ram / Bikash)
  {
    const b = await startBooking({
      customer: c.ram,
      category: 'AC',
      title: 'Split AC leaking water indoors',
      description:
        'Water drips from the indoor unit onto the wall; it started after the last service.',
      place: PLACES.patan,
      detail: 'Mangal Bazaar',
      createdAgo: 3 * 60,
      urgency: 'URGENT',
    });
    await b.search();
    b.accept(t.bikash, 8, {
      scheduledDate: later(20),
      timeSlotLabel: 'Today 3-4 PM',
      technicianNote: 'Probably a blocked drain pipe.',
      estimatedFee: 900,
    });
    b.respond(SCHEDULE_RESPONSE.ACCEPT, 15, 'Please come quickly');
    b.step(S.ON_THE_WAY, actor(t.bikash), 170);
    const halfway = { lng: 85.3367, lat: 27.675 };
    b.booking.liveLocation = {
      ...halfway,
      etaMinutes: etaMinutes(haversineKm(halfway, fromPoint(b.booking.location))),
      updatedAt: ago(1),
    };
    await save(b.booking, 'ON_THE_WAY with liveLocation and chat');
    await Message.create([
      {
        bookingId: b.booking._id,
        senderId: c.ram._id,
        senderRole: ROLES.CUSTOMER,
        text: 'The gate is next to the blue pharmacy.',
        readBy: [c.ram._id, t.bikash._id],
      },
      {
        bookingId: b.booking._id,
        senderId: t.bikash._id,
        senderRole: ROLES.TECHNICIAN,
        text: 'Got it, about 10 minutes away.',
        readBy: [t.bikash._id],
      },
    ]);
  }

  // 5. CONFIRMED_SCHEDULED for tomorrow (Sita / Anil)
  {
    const b = await startBooking({
      customer: c.sita,
      category: 'ELECTRICAL',
      title: 'Living room sockets sparking',
      description:
        'Two sockets in the living room spark when plugging in; the MCB tripped twice today.',
      place: PLACES.newBaneshwor,
      detail: 'near Everest Hotel',
      createdAgo: 2 * 60,
      urgency: 'URGENT',
    });
    await b.search();
    b.accept(t.anil, 9, {
      scheduledDate: later(20 * 60),
      timeSlotLabel: 'Tomorrow 10 AM - 12 PM',
      technicianNote: 'Please keep the MCB off until I arrive.',
      estimatedFee: 1500,
    });
    b.respond(SCHEDULE_RESPONSE.ACCEPT, 25);
    await save(b.booking, 'CONFIRMED_SCHEDULED');
  }

  // 6. SCHEDULE_PROPOSED with RESCHEDULE_REQUESTED (Gita / Rajesh)
  {
    const b = await startBooking({
      customer: c.gita,
      category: 'PLUMBING',
      title: 'Kitchen sink leaking under the cabinet',
      description:
        'Water collects under the kitchen sink cabinet every time the tap runs for a while.',
      place: PLACES.thamel,
      detail: 'JP Marg',
      createdAgo: 90,
    });
    await b.search();
    b.accept(t.rajesh, 10, {
      scheduledDate: later(3 * 60),
      timeSlotLabel: 'Today 1-3 PM',
      technicianNote: 'Likely the waste pipe joint.',
      estimatedFee: 700,
    });
    b.respond(SCHEDULE_RESPONSE.REQUEST_NEW_TIME, 20, 'Can you come after 5 PM?');
    await save(b.booking, 'SCHEDULE_PROPOSED (RESCHEDULE_REQUESTED)');
  }

  // 7. SCHEDULE_PROPOSED, PENDING (Ram / Sunita)
  {
    const b = await startBooking({
      customer: c.ram,
      category: 'COMPUTER',
      title: "Laptop won't boot after Windows update",
      description:
        "Dell Inspiron stuck on the spinning dots after last night's update; safe mode fails.",
      place: PLACES.patan,
      detail: 'Mangal Bazaar',
      createdAgo: 45,
    });
    await b.search();
    b.accept(t.sunita, 15, {
      scheduledDate: later(4 * 60),
      timeSlotLabel: 'Today 5-7 PM',
      technicianNote: 'Please keep the charger ready.',
      estimatedFee: 800,
    });
    await save(b.booking, 'SCHEDULE_PROPOSED (PENDING)');
  }

  // 8. SEARCHING_TECHNICIAN, broadcast for real (Sita)
  {
    const b = await startBooking({
      customer: c.sita,
      category: 'AC',
      title: 'AC not cooling, rattling noise',
      description:
        'The bedroom split AC blows warm air and the outdoor unit makes a rattling noise.',
      place: PLACES.newBaneshwor,
      detail: 'near Everest Hotel',
      createdAgo: 20,
    });
    b.step(S.SEARCHING_TECHNICIAN, null, 0, 'Nearby technicians notified');
    await b.booking.save({ timestamps: false });
    const { matchedCount } = await broadcast(b.booking);
    created.push({
      booking: b.booking,
      label: `SEARCHING_TECHNICIAN (${matchedCount} technicians notified)`,
    });
  }

  return created;
}

/** Ratings and completed-job counters derived from the seeded bookings. */
async function recomputeTechnicianStats() {
  await TechnicianProfile.updateMany(
    {},
    { $set: { ratingAvg: 0, ratingCount: 0, completedJobs: 0 } },
  );
  const rows = await Booking.aggregate([
    { $match: { status: S.COMPLETED } },
    {
      $group: {
        _id: '$technicianId',
        completedJobs: { $sum: 1 },
        ratingCount: { $sum: { $cond: [{ $ifNull: ['$review.rating', false] }, 1, 0] } },
        ratingSum: { $sum: { $ifNull: ['$review.rating', 0] } },
      },
    },
  ]);
  for (const r of rows) {
    await TechnicianProfile.updateOne(
      { userId: r._id },
      {
        $set: {
          completedJobs: r.completedJobs,
          ratingCount: r.ratingCount,
          ratingAvg: r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 100) / 100 : 0,
        },
      },
    );
  }
}

function printSummary(bookings) {
  const accounts = [
    {
      email: 'admin@repairhub.test',
      role: 'admin',
      location: '-',
      'what to test': 'Stats, verify Pasang, users, bookings, categories',
    },
    ...CUSTOMERS.map((c) => ({
      email: c.email,
      role: 'customer',
      location: c.place.text,
      'what to test': c.test,
    })),
    ...TECHNICIANS.map((t) => ({
      email: `${t.key}@repairhub.test`,
      role: 'technician',
      location: `${t.place.text} (${t.radius} km)`,
      'what to test': t.edge ? `[EDGE: ${t.edge}] ${t.test}` : t.test,
    })),
  ];
  console.log(`\nRepairHub seed complete. Every password is ${PASSWORD}\n`);
  console.table(accounts);
  console.log('\nBookings:');
  console.table(
    bookings.map(({ booking, label }) => ({
      code: booking.bookingCode,
      state: label,
      title: booking.title,
    })),
  );
  console.log('\nDeliberate edge cases:');
  for (const t of TECHNICIANS.filter((x) => x.edge)) {
    console.log(`  - ${t.name} <${t.key}@repairhub.test>: ${t.edge}`);
  }
  console.log('');
}

async function main() {
  if (env.isProd) {
    console.error('[seed] Refusing to run with NODE_ENV=production.');
    process.exit(1);
  }
  const reset = process.argv.includes('--reset');
  await connectDB();

  if (reset) {
    console.log('[seed] --reset: dropping all collections');
    await dropAll();
  } else if (await User.exists({ email: /@repairhub\.test$/ })) {
    console.error('[seed] Seed accounts already exist. Run `npm run seed -w backend -- --reset`.');
    await disconnectDB();
    process.exit(1);
  }

  await syncAllIndexes();
  await Category.insertMany(CATEGORIES);
  const people = await createUsers();
  const bookings = await createBookings(people);
  await recomputeTechnicianStats();
  printSummary(bookings);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[seed] Failed:', err);
  if (mongoose.connection.readyState === 1) await disconnectDB();
  process.exit(1);
});
