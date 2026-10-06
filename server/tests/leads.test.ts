import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createApp } from '../src/app.js';
import { authToken } from './helpers.js';

describe('Leads API', () => {
  let app: express.Express;
  let token: string;

  beforeAll(async () => {
    app = createApp();
    token = await authToken(app, 'leads@example.com');
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('can create a lead', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set(auth())
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@client.com',
        phone: '555-0100',
        service: 'plumbing',
        message: 'Leaky faucet',
        source: 'website',
      });
    expect(res.status).toBe(201);
    expect(res.body.lead.email).toBe('jane@client.com');
    expect(res.body.lead.status).toBe('new');
  });

  it('lists leads with filters', async () => {
    await request(app).post('/api/leads').set(auth()).send({ email: 'a@client.com', status: 'qualified' });
    await request(app).post('/api/leads').set(auth()).send({ email: 'b@client.com', status: 'new' });

    const all = await request(app).get('/api/leads').set(auth());
    expect(all.body.leads.length).toBeGreaterThanOrEqual(3);

    const qualified = await request(app).get('/api/leads?status=qualified').set(auth());
    expect(qualified.body.leads.every((l: { status: string }) => l.status === 'qualified')).toBe(true);

    const search = await request(app).get('/api/leads?q=jane').set(auth());
    expect(search.body.leads.length).toBeGreaterThanOrEqual(1);
    expect(search.body.leads.some((l: { email: string }) => l.email === 'jane@client.com')).toBe(true);
  });

  it('updates a lead', async () => {
    const created = await request(app)
      .post('/api/leads')
      .set(auth())
      .send({ email: 'update@client.com', firstName: 'Sam' });
    const id = created.body.lead.id;

    const updated = await request(app)
      .patch(`/api/leads/${id}`)
      .set(auth())
      .send({ status: 'contacted', estimatedValue: 950 });
    expect(updated.status).toBe(200);
    expect(updated.body.lead.status).toBe('contacted');
    expect(updated.body.lead.estimatedValue).toBe(950);
  });

  it('deletes a lead', async () => {
    const created = await request(app)
      .post('/api/leads')
      .set(auth())
      .send({ email: 'delete@client.com' });
    const id = created.body.lead.id;

    const del = await request(app).delete(`/api/leads/${id}`).set(auth());
    expect(del.status).toBe(200);

    const get = await request(app).get(`/api/leads/${id}`).set(auth());
    expect(get.status).toBe(404);
  });

  it('prevents cross-user access to leads', async () => {
    const otherToken = await authToken(app, 'other@example.com');
    const created = await request(app)
      .post('/api/leads')
      .set(auth())
      .send({ email: 'private@client.com' });
    const id = created.body.lead.id;

    const read = await request(app)
      .get(`/api/leads/${id}`)
      .set({ Authorization: `Bearer ${otherToken}` });
    expect(read.status).toBe(404);
  });

  it('sends a welcome email (console provider when no Resend key)', async () => {
    const created = await request(app)
      .post('/api/leads')
      .set(auth())
      .send({ email: 'welcome@client.com', firstName: 'Wanda', source: 'website' });
    const id = created.body.lead.id;

    const res = await request(app).post(`/api/leads/${id}/send-welcome`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBe('console');
    expect(res.body.logId).toBeTruthy();
  });

  it('converts a won lead into a client and project', async () => {
    const created = await request(app)
      .post('/api/leads')
      .set(auth())
      .send({
        firstName: 'Wendy',
        lastName: 'Winner',
        email: 'wendy@won.com',
        service: 'electrical',
        estimatedValue: 1500,
      });
    const id = created.body.lead.id;

    const won = await request(app).patch(`/api/leads/${id}`).set(auth()).send({ status: 'won' });
    expect(won.status).toBe(200);
    expect(won.body.converted.clientId).toBeTruthy();
    expect(won.body.converted.projectId).toBeTruthy();

    const clients = await request(app).get('/api/clients').set(auth());
    expect(clients.body.clients.some((c: { email: string }) => c.email === 'wendy@won.com')).toBe(true);

    const projects = await request(app).get('/api/projects').set(auth());
    expect(projects.body.projects.some((p: { leadId: string }) => p.leadId === id)).toBe(true);
  });
});