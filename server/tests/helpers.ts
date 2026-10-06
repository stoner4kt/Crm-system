import request from 'supertest';
import type express from 'express';

export function register(agent: ReturnType<typeof request.agent>, email: string) {
  return agent.post('/api/auth/register').send({
    email,
    password: 'password123',
    fullName: 'Test Owner',
    businessName: 'Test Plumbing Co',
    businessType: 'plumbing',
  });
}

export function login(agent: ReturnType<typeof request.agent>, email: string) {
  return agent.post('/api/auth/login').send({ email, password: 'password123' });
}

export async function authToken(app: express.Express, email: string): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({
    email,
    password: 'password123',
    fullName: 'Test Owner',
    businessName: 'Test Plumbing Co',
    businessType: 'plumbing',
  });
  return res.body.token as string;
}