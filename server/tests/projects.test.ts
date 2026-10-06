import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createApp } from '../src/app.js';
import { authToken } from './helpers.js';

describe('Projects API', () => {
  let app: express.Express;
  let token: string;
  let clientId: string;

  beforeAll(async () => {
    app = createApp();
    token = await authToken(app, 'projects@example.com');
    const client = await request(app)
      .post('/api/clients')
      .set({ Authorization: `Bearer ${token}` })
      .send({ firstName: 'Pat', email: 'pat@project.com' });
    clientId = client.body.client.id;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('creates and lists projects', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set(auth())
      .send({ clientId, title: 'Water heater replacement', scope: 'Replace 50-gallon tank' });
    expect(created.status).toBe(201);
    expect(created.body.project.title).toBe('Water heater replacement');
    expect(created.body.project.clientName).toContain('Pat');

    const list = await request(app).get('/api/projects').set(auth());
    expect(list.body.projects.length).toBeGreaterThanOrEqual(1);
  });

  it('updates project status and priority', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set(auth())
      .send({ clientId, title: 'Panel upgrade' });
    const id = created.body.project.id;

    const updated = await request(app)
      .patch(`/api/projects/${id}`)
      .set(auth())
      .send({ status: 'in_progress', priority: 'high', scheduledDate: '2026-10-15' });
    expect(updated.status).toBe(200);
    expect(updated.body.project.status).toBe('in_progress');
    expect(updated.body.project.priority).toBe('high');
    expect(updated.body.project.scheduledDate).toBe('2026-10-15');
  });

  it('filters by status and client', async () => {
    await request(app)
      .post('/api/projects')
      .set(auth())
      .send({ clientId, title: 'Roof inspection', status: 'completed' });

    const completed = await request(app).get('/api/projects?status=completed').set(auth());
    expect(completed.body.projects.every((p: { status: string }) => p.status === 'completed')).toBe(true);

    const byClient = await request(app).get(`/api/projects?clientId=${clientId}`).set(auth());
    expect(byClient.body.projects.every((p: { clientId: string }) => p.clientId === clientId)).toBe(true);
  });

  it('rejects a project for a client owned by another user', async () => {
    const other = await authToken(app, 'other-projects@example.com');
    const res = await request(app)
      .post('/api/projects')
      .set({ Authorization: `Bearer ${other}` })
      .send({ clientId, title: 'Sneaky job' });
    expect(res.status).toBe(400);
  });

  it('sends a project update email (console provider)', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set(auth())
      .send({ clientId, title: 'Drain line repair' });
    const id = created.body.project.id;

    const res = await request(app)
      .post(`/api/projects/${id}/send-update`)
      .set(auth())
      .send({ message: 'Your drain line repair is scheduled for Thursday morning.' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBe('console');
  });

  it('deletes a project', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set(auth())
      .send({ clientId, title: 'Temporary job' });
    const id = created.body.project.id;

    const del = await request(app).delete(`/api/projects/${id}`).set(auth());
    expect(del.status).toBe(200);

    const get = await request(app).get(`/api/projects/${id}`).set(auth());
    expect(get.status).toBe(404);
  });
});