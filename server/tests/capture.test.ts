import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createApp } from '../src/app.js';
import { authToken } from './helpers.js';

describe('Email capture + dashboard', () => {
  let app: express.Express;
  let token: string;
  let ownerEmail: string;

  beforeAll(async () => {
    app = createApp();
    ownerEmail = 'capture-owner@example.com';
    token = await authToken(app, ownerEmail);
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('captures a public email and creates a lead for the owner', async () => {
    const res = await request(app).post('/api/capture/public').send({
      email: 'visitor@site.com',
      fullName: 'Vicky Visitor',
      phone: '555-2222',
      message: 'Need a water heater installed',
      businessEmail: ownerEmail,
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.captureId).toBeTruthy();
    expect(res.body.leadId).toBeTruthy();

    // The lead should appear on the owner's dashboard.
    const leads = await request(app).get('/api/leads').set(auth());
    expect(leads.body.leads.some((l: { email: string }) => l.email === 'visitor@site.com')).toBe(true);
    expect(leads.body.leads.find((l: { email: string }) => l.email === 'visitor@site.com').source).toBe('website');
  });

  it('captures without owner email when CAPTURE_OWNER isn’t set (no crash)', async () => {
    const res = await request(app).post('/api/capture/public').send({
      email: 'orphan@site.com',
    });
    expect([200, 201]).toContain(res.status);
  });

  it('logs captures and email events for authenticated users', async () => {
    const captures = await request(app).get('/api/captures').set(auth());
    expect(captures.status).toBe(200);
    expect(captures.body.captures.length).toBeGreaterThanOrEqual(1);

    const emails = await request(app).get('/api/captures/emails').set(auth());
    expect(emails.status).toBe(200);
    // At least one welcome email was logged (console provider) from the capture.
    expect(emails.body.emailLogs.some((e: { template: string }) => e.template === 'lead_welcome')).toBe(true);
  });

  it('returns dashboard stats', async () => {
    const res = await request(app).get('/api/dashboard/stats').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.stats.totalLeads).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.emailsSent).toBeGreaterThanOrEqual(1);
  });

  it('returns dashboard activity', async () => {
    const res = await request(app).get('/api/dashboard/activity').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.captures)).toBe(true);
    expect(Array.isArray(res.body.emailLogs)).toBe(true);
  });

  it('rejects protected dashboard routes without auth', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(401);
  });
});