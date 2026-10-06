import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createApp } from '../src/app.js';

describe('Auth API', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createApp();
  });

  it('registers a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'plumber@example.com',
      password: 'password123',
      fullName: 'Bob the Plumber',
      businessName: 'Bob’s Plumbing',
      businessType: 'plumbing',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('plumber@example.com');
    expect(res.body.user.businessName).toBe('Bob’s Plumbing');
    expect(res.body.provider).toBe('local');
  });

  it('logs in with correct credentials', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'electric@example.com',
      password: 'password123',
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'electric@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'electric@example.com',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  it('rejects duplicate registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'plumber@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(409);
  });

  it('protects /me and returns the profile', async () => {
    const noAuth = await request(app).get('/api/auth/me');
    expect(noAuth.status).toBe(401);

    const reg = await request(app).post('/api/auth/register').send({
      email: 'roofer@example.com',
      password: 'password123',
    });
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('roofer@example.com');
  });

  it('updates the profile via PATCH /profile', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'hvac@example.com',
      password: 'password123',
    });
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ fullName: 'Cool Air HVAC', businessType: 'hvac' });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Cool Air HVAC');
    expect(res.body.user.businessType).toBe('hvac');
  });

  it('changes the password', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'password@example.com',
      password: 'password123',
    });
    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ currentPassword: 'password123', newPassword: 'newpassword456' });
    expect(change.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({
      email: 'password@example.com',
      password: 'password123',
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({
      email: 'password@example.com',
      password: 'newpassword456',
    });
    expect(newLogin.status).toBe(200);
  });

  it('reset-password never leaks whether an email exists', async () => {
    const existing = await request(app).post('/api/auth/reset-password').send({ email: 'plumber@example.com' });
    const missing = await request(app).post('/api/auth/reset-password').send({ email: 'ghost@example.com' });
    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body.message).toBe(missing.body.message);
  });
});