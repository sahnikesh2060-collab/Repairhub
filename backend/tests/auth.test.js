import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { TechnicianProfile } from '../src/models/TechnicianProfile.js';
import { REFRESH_COOKIE_NAME } from '../src/config/constants.js';

const customer = {
  name: 'Sita Sharma',
  email: 'Test.Customer@Example.com',
  phone: '9800000001',
  password: 'secret123',
};

const technician = {
  name: 'Ram Thapa',
  email: 'test.tech@example.com',
  phone: '+977 980-000-0002',
  password: 'fixit2026',
  role: 'technician',
};

/** Returns the raw Set-Cookie line for the refresh cookie, or undefined. */
function refreshSetCookie(res) {
  const cookies = res.headers['set-cookie'] ?? [];
  return cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
}

/** Returns "rh_refresh=<value>" ready for a Cookie header. */
function refreshCookie(res) {
  const line = refreshSetCookie(res);
  if (!line) throw new Error('No refresh cookie in response');
  return line.split(';')[0];
}

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const refresh = (cookie) => request(app).post('/api/auth/refresh').set('Cookie', cookie);

describe('POST /api/auth/register', () => {
  it('registers a customer, returns the user and an access token, and sets the refresh cookie', async () => {
    const res = await register(customer);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      name: 'Sita Sharma',
      email: 'test.customer@example.com',
      phone: '9800000001',
      role: 'customer',
      isActive: true,
    });
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.refreshTokens).toBeUndefined();
    expect(res.body.data.user.__v).toBeUndefined();

    const cookie = refreshSetCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const stored = await User.findOne({ email: 'test.customer@example.com' }).select(
      '+password +refreshTokens',
    );
    expect(stored.password).not.toBe(customer.password);
    expect(stored.password).toMatch(/^\$2[aby]\$12\$/);
    expect(stored.refreshTokens).toHaveLength(1);
    expect(stored.refreshTokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await TechnicianProfile.countDocuments()).toBe(0);
  });

  it('registers a technician and creates an empty, unverified, offline profile', async () => {
    const res = await register(technician);

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('technician');
    expect(res.body.data.user.phone).toBe('+9779800000002');

    const profile = await TechnicianProfile.findOne({ userId: res.body.data.user._id }).lean();
    expect(profile).not.toBeNull();
    expect(profile).toMatchObject({
      categories: [],
      isVerified: false,
      isAvailable: false,
      serviceRadiusKm: 10,
      ratingAvg: 0,
      ratingCount: 0,
      completedJobs: 0,
    });
    expect(profile.currentLocation).toBeUndefined();
  });

  it('rejects a duplicate email with 409 DUPLICATE naming the field', async () => {
    await register(customer).expect(201);
    const res = await register({
      ...customer,
      phone: '9800000099',
      email: 'test.customer@example.com',
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'DUPLICATE', message: 'email already exists' },
    });
    expect(res.body.error.details[0].field).toBe('email');
  });

  it('rejects admin self-registration and creates no user', async () => {
    const res = await register({ ...customer, role: 'admin' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'role', in: 'body' })]),
    );
    expect(await User.countDocuments()).toBe(0);
  });

  it('enforces the password policy with per-field details', async () => {
    const res = await register({ ...customer, password: 'onlyletters' });

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'password', in: 'body', message: 'Password must contain at least one number' },
    ]);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right password and updates lastLoginAt', async () => {
    await register(customer).expect(201);
    const res = await login('test.customer@example.com', customer.password);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.lastLoginAt).toEqual(expect.any(String));
    expect(refreshSetCookie(res)).toBeDefined();
  });

  it('answers 401 "Invalid email or password" for a wrong password or an unknown email', async () => {
    await register(customer).expect(201);

    const wrong = await login('test.customer@example.com', 'wrongpass1');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password',
    });

    const unknown = await login('nobody@example.com', 'whatever1');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe('Invalid email or password');
  });
});

describe('GET /api/auth/me', () => {
  it('rejects requests without a token or with a bad token', async () => {
    const none = await request(app).get('/api/auth/me');
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('UNAUTHORIZED');

    const bad = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(bad.status).toBe(401);
  });

  it('returns the user for a valid token', async () => {
    const { body } = await register(customer).expect(201);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('test.customer@example.com');
    expect(res.body.data.technicianProfile).toBeUndefined();
  });

  it('includes the technicianProfile for technicians', async () => {
    const { body } = await register(technician).expect(201);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.technicianProfile).toMatchObject({
      userId: body.data.user._id,
      isVerified: false,
    });
  });

  it('rejects a token of a deactivated user', async () => {
    const { body } = await register(customer).expect(201);
    await User.updateOne({ _id: body.data.user._id }, { isActive: false });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token, and the old token is then rejected', async () => {
    const reg = await register(customer).expect(201);
    const first = refreshCookie(reg);

    const rotated = await refresh(first);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.accessToken).toEqual(expect.any(String));
    const second = refreshCookie(rotated);
    expect(second).not.toBe(first);

    const stored = await User.findById(reg.body.data.user._id).select('+refreshTokens');
    expect(stored.refreshTokens).toHaveLength(1);

    const reused = await refresh(first);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('UNAUTHORIZED');
  });

  it('revokes ALL sessions when an already-rotated token is reused', async () => {
    const reg = await register(customer).expect(201);
    const sessionA = refreshCookie(reg);
    const otherDevice = await login('test.customer@example.com', customer.password).expect(200);
    const sessionB = refreshCookie(otherDevice);

    const rotated = await refresh(sessionA).expect(200);
    const sessionA2 = refreshCookie(rotated);

    const attack = await refresh(sessionA);
    expect(attack.status).toBe(401);
    expect(attack.body.error.message).toMatch(/reuse detected/i);

    const stored = await User.findById(reg.body.data.user._id).select('+refreshTokens');
    expect(stored.refreshTokens).toHaveLength(0);

    expect((await refresh(sessionA2)).status).toBe(401);
    expect((await refresh(sessionB)).status).toBe(401);
  });

  it('answers 401 without a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('keeps at most 5 refresh tokens per user', async () => {
    await register(customer).expect(201);
    for (let i = 0; i < 6; i += 1) {
      await login('test.customer@example.com', customer.password).expect(200);
    }
    const stored = await User.findOne({ email: 'test.customer@example.com' }).select(
      '+refreshTokens',
    );
    expect(stored.refreshTokens).toHaveLength(5);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie and revokes the refresh token', async () => {
    const reg = await register(customer).expect(201);
    const cookie = refreshCookie(reg);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { loggedOut: true } });

    const cleared = refreshSetCookie(res);
    expect(cleared).toMatch(new RegExp(`^${REFRESH_COOKIE_NAME}=;`));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).toMatch(/Path=\/api\/auth/);

    const stored = await User.findById(reg.body.data.user._id).select('+refreshTokens');
    expect(stored.refreshTokens).toHaveLength(0);
  });
});

describe('PATCH /api/auth/me', () => {
  it('updates name, phone and avatar and refuses other fields', async () => {
    const { body } = await register(customer).expect(201);
    const auth = `Bearer ${body.data.accessToken}`;

    const ok = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', auth)
      .send({ name: 'Sita K. Sharma', avatar: 'https://example.com/a.png', phone: null });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).toMatchObject({
      name: 'Sita K. Sharma',
      avatar: 'https://example.com/a.png',
    });
    expect(ok.body.data.user.phone).toBeUndefined();

    const sneaky = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', auth)
      .send({ role: 'admin' });
    expect(sneaky.status).toBe(422);
  });
});

describe('saved addresses', () => {
  it('creates, updates and deletes addresses keeping exactly one default', async () => {
    const { body } = await register(customer).expect(201);
    const auth = `Bearer ${body.data.accessToken}`;
    const api = (method, path) =>
      request(app)[method](`/api/auth/me/addresses${path}`).set('Authorization', auth);

    const home = await api('post', '').send({
      label: 'Home',
      addressText: 'Baluwatar, Kathmandu',
      lng: 85.3313,
      lat: 27.7286,
    });
    expect(home.status).toBe(201);
    expect(home.body.data.address).toMatchObject({
      label: 'Home',
      isDefault: true,
      location: { type: 'Point', coordinates: [85.3313, 27.7286] },
    });

    const office = await api('post', '').send({
      label: 'Office',
      addressText: 'Pulchowk, Lalitpur',
      lng: '85.3188',
      lat: '27.6789',
      isDefault: true,
    });
    expect(office.status).toBe(201);
    const defaults = office.body.data.addresses.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].label).toBe('Office');

    const homeId = home.body.data.address._id;
    const officeId = office.body.data.address._id;

    const patched = await api('patch', `/${homeId}`).send({
      isDefault: true,
      label: 'Home sweet home',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data.addresses.filter((a) => a.isDefault).map((a) => a._id)).toEqual([
      homeId,
    ]);

    const removed = await api('delete', `/${homeId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.addresses).toHaveLength(1);
    expect(removed.body.data.addresses[0]).toMatchObject({ _id: officeId, isDefault: true });

    const list = await api('get', '');
    expect(list.body.data.addresses).toHaveLength(1);

    const missing = await api('delete', `/${homeId}`);
    expect(missing.status).toBe(404);
  });

  it('rejects out-of-range coordinates and bare coordinate arrays', async () => {
    const { body } = await register(customer).expect(201);
    const post = (payload) =>
      request(app)
        .post('/api/auth/me/addresses')
        .set('Authorization', `Bearer ${body.data.accessToken}`)
        .send(payload);

    const outOfRange = await post({ label: 'X', addressText: 'Nowhere', lng: 200, lat: 27.7 });
    expect(outOfRange.status).toBe(422);
    expect(outOfRange.body.error.details[0].field).toBe('lng');

    const bareArray = await post({ label: 'X', addressText: 'Nowhere', coordinates: [85.3, 27.7] });
    expect(bareArray.status).toBe(422);
  });

  it('rejects a malformed address id', async () => {
    const { body } = await register(customer).expect(201);
    const res = await request(app)
      .delete('/api/auth/me/addresses/not-an-id')
      .set('Authorization', `Bearer ${body.data.accessToken}`);
    expect(res.status).toBe(422);
  });
});

describe('app basics', () => {
  it('GET /api/health reports ok and db up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', db: 'up' });
    expect(res.body.data.uptime).toEqual(expect.any(Number));
  });

  it('unknown routes get the 404 envelope', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('malformed JSON gets 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
