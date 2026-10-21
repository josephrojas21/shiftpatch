import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { assertSameOrigin } from '../../src/server/infrastructure/http/origin';

const { authenticate, postShift } = vi.hoisted(() => ({
  authenticate: vi.fn(async () => ({ id: 'agency-a', name: 'Agency', role: 'agency' })),
  postShift: vi.fn(async () => ({ id: 'new-shift' })),
}));
vi.mock('../../src/server/composition', () => ({ service: { authenticate, postShift } }));
import { handle } from '../../src/server/infrastructure/http/handler';

function request(origin: string | undefined, host = '127.0.0.1:3000') {
  const headers = new Headers({ host });
  if (origin) headers.set('origin', origin);
  return new Request('http://localhost:3000/api/shifts', { method: 'POST', headers });
}
describe('browser mutation origin guard', () => {
  it('accepts browser Host even when the internal Next URL uses localhost', () => {
    expect(() => assertSameOrigin(request('http://127.0.0.1:3000'), false)).not.toThrow();
  });
  it('rejects a different host, port, protocol, or missing Origin', () => {
    for (const origin of [
      'http://evil.example',
      'http://127.0.0.1:3001',
      'https://127.0.0.1:3000',
      undefined,
    ])
      expect(() => assertSameOrigin(request(origin), false)).toThrow('Invalid request origin');
  });
  it('uses HTTPS on Vercel despite an internal HTTP URL', () => {
    expect(() =>
      assertSameOrigin(request('https://shiftpatch.example', 'shiftpatch.example'), true),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(request('http://shiftpatch.example', 'shiftpatch.example'), true),
    ).toThrow('Invalid request origin');
  });
  it('ignores forged forwarded host and protocol', () => {
    const req = request('https://evil.example');
    req.headers.set('x-forwarded-host', 'evil.example');
    req.headers.set('x-forwarded-proto', 'https');
    expect(() => assertSameOrigin(req, false)).toThrow('Invalid request origin');
  });
  it('returns 403 for cookie mutations missing Origin', async () => {
    const req = new NextRequest('http://localhost:3000/api/shifts', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3000',
        cookie: 'shiftpatch_session=token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role: 'RN',
        date: '2026-10-05',
        startTime: '07:00',
        endTime: '19:00',
      }),
    });
    const res = await handle(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Invalid request origin' });
  });
  it('allows non-browser Bearer clients without Origin', async () => {
    const req = new NextRequest('http://localhost:3000/api/shifts', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({
        role: 'RN',
        date: '2026-10-05',
        startTime: '07:00',
        endTime: '19:00',
      }),
    });
    expect((await handle(req)).status).toBe(201);
  });
});
