import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createApp } from '../src/app.js';
import { authToken } from './helpers.js';

describe('Clients API', () => {
  let app: express.Express;
  let token: string;

  beforeAll(async () => {
    app = createApp();
    token = await authToken(app, 'clients@example.com');
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('creates and lists clients', async () => {
    const created = await request(app)
      .post('/api/clients')
      .set(auth())
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@client.com',
        phone: '555-1111',
        propertyType: 'residential',
        address: '10 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      });
    expect(created.status).toBe(201);
    expect(created.body.client.email).toBe('alice@client.com');

    const list = await request(app).get('/api/clients').set(auth());
    expect(list.body.clients.length).toBeGreaterThanOrEqual(1);

    const search = await request(app).get('/api/clients?q=alice').set(auth());
    expect(search.body.clients.some((c: { email: string }) => c.email === 'alice@client.com')).toBe(true);
  });

  it('updates a client', async () => {
    const created = await request(app)
      .post('/api/clients')
      .set(auth())
      .send({ firstName: 'Bob', email: 'bob@client.com' });
    const id = created.body.client.id;

    const updated = await request(app)
      .patch(`/api/clients/${id}`)
      .set(auth())
      .send({ lastName: 'Builder', city: 'Dallas' });
    expect(updated.status).toBe(200);
    expect(updated.body.client.lastName).toBe('Builder');
    expect(updated.body.client.city).toBe('Dallas');
  });

  it('refuses to delete a client with projects', async () => {
    const client = await request(app)
      .post('/api/clients')
      .set(auth())
      .send({ firstName: 'Carol', email: 'carol@client.com' });
    const clientId = client.body.client.id;

    await request(app)
      .post('/api/projects')
      .set(auth())
      .send({ clientId, title: 'Roof repair' });

    const del = await request(app).delete(`/api/clients/${clientId}`).set(auth());
    expect(del.status).toBe(409);
  });

  it('deletes a client without projects', async () => {
    const client = await request(app)
      .post('/api/clients')
      .set(auth())
      .send({ firstName: 'Dan', email: 'dan@client.com' });
    const clientId = client.body.client.id;

    const del = await request(app).delete(`/api/clients/${clientId}`).set(auth());
    expect(del.status).toBe(200);
  });

  it('validates required fields', async () => {
    const res = await request(app).post('/api/clients').set(auth()).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});