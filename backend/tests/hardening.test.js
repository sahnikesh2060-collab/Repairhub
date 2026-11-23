import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { makeCustomer } from './helpers.js';

describe('hardening', () => {
  it('tags every response with a request id, reusing a well-formed incoming one', async () => {
    const fresh = await request(app).get('/api/health');
    expect(fresh.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);

    const echoed = await request(app).get('/api/health').set('X-Request-Id', 'nginx-abc123def');
    expect(echoed.headers['x-request-id']).toBe('nginx-abc123def');

    const bad = await request(app).get('/api/health').set('X-Request-Id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });

  it('sends a Content-Security-Policy that allows OpenStreetMap tiles', async () => {
    const res = await request(app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://tile.openstreetmap.org');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('strips $ operators from the body (no NoSQL injection through login)', async () => {
    await makeCustomer();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $ne: null } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('strips $ operators from the query and keeps one value for repeated parameters', async () => {
    const customer = await makeCustomer();
    const auth = { Authorization: `Bearer ${customer.token}` };

    // The $ne key is removed; the empty object that remains is then rejected by validation.
    const injected = await request(app).get('/api/bookings/my?status[$ne]=x').set(auth);
    expect(injected.status).toBe(422);
    expect(injected.body.error.details[0]).toMatchObject({ field: 'status', in: 'query' });

    const polluted = await request(app).get('/api/bookings/my?status=active&status=past').set(auth);
    expect(polluted.status).toBe(200);
  });

  it('answers CORS only for allow-listed origins', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
