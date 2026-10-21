import { test, expect, type APIRequestContext } from '@playwright/test';
// These literal expectations intentionally do not import production schemas/fixtures.
const baseKeys = [
  'id',
  'agencyId',
  'agencyName',
  'role',
  'date',
  'startTime',
  'endTime',
  'status',
  'claimedBy',
].sort();
async function login(request: APIRequestContext, email: string) {
  const r = await request.post('/api/auth/login', { data: { email, password: 'Trial2026!' } });
  expect(r.status()).toBe(200);
  return r.json() as Promise<{ token: string; user: { id: string; name: string; role: string } }>;
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
test('login contract and invalid login message', async ({ request }) => {
  const r = await request.post('/api/auth/login', {
    data: { email: 'maria.lopez@example.com', password: 'wrong' },
  });
  expect(r.status()).toBe(401);
  expect(await r.json()).toEqual({ error: 'Invalid email or password' });
  const valid = await login(request, 'maria.lopez@example.com');
  expect(valid.user).toEqual({ id: 'nurse-1', name: 'Maria Lopez', role: 'nurse' });
  expect(typeof valid.token).toBe('string');
});
test('marketplace exposes full seeded shift DTOs and scopes agencies', async ({ request }) => {
  const { token } = await login(request, 'admin@sunrisehealth.example');
  const r = await request.get('/api/shifts', { headers: auth(token) });
  expect(r.status()).toBe(200);
  const { shifts } = await r.json();
  expect(shifts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'shift-1',
        agencyId: 'agency-a',
        agencyName: 'Sunrise Health Staffing',
        role: 'RN',
        date: '2026-10-02',
        startTime: '19:00',
        endTime: '07:00',
      }),
      expect.objectContaining({ id: 'shift-3', agencyId: 'agency-b', date: '2026-10-04' }),
    ]),
  );
  for (const shift of shifts) expect(Object.keys(shift).sort()).toEqual(baseKeys);
  const own = await request.get('/api/agencies/agency-a/shifts', { headers: auth(token) });
  expect(own.status()).toBe(200);
  const body = await own.json();
  expect(body.agencyId).toBe('agency-a');
  expect(body.shifts.every((s: { agencyId: string }) => s.agencyId === 'agency-a')).toBe(true);
  expect(
    (await request.get('/api/agencies/agency-b/shifts', { headers: auth(token) })).status(),
  ).toBe(403);
});
test('post, expired credential, concurrent claim and cancellation', async ({ request }) => {
  const agency = await login(request, 'admin@sunrisehealth.example');
  const maria = await login(request, 'maria.lopez@example.com');
  const james = await login(request, 'james.cook@example.com');
  const posted = await request.post('/api/shifts', {
    headers: auth(agency.token),
    data: { role: 'RN', date: '2026-10-05', startTime: '19:00', endTime: '07:00' },
  });
  expect(posted.status()).toBe(201);
  const shift = await posted.json();
  expect(Object.keys(shift).sort()).toEqual(baseKeys);
  expect(shift).toMatchObject({ agencyId: 'agency-a', status: 'open', claimedBy: null });
  const expired = await request.post(`/api/shifts/${shift.id}/claim`, {
    headers: auth(james.token),
  });
  expect(expired.status()).toBe(403);
  expect(await expired.json()).toEqual({ error: 'Credential expired, cannot claim shift' });
  const attempts = await Promise.all([
    request.post(`/api/shifts/${shift.id}/claim`, { headers: auth(maria.token) }),
    request.post(`/api/shifts/${shift.id}/claim`, { headers: auth(maria.token) }),
  ]);
  expect(attempts.map((x) => x.status()).sort()).toEqual([200, 409]);
  const cancelled = await request.post(`/api/shifts/${shift.id}/cancel`, {
    headers: auth(agency.token),
    data: { reason: 'no-show' },
  });
  expect(cancelled.status()).toBe(200);
  expect(await cancelled.json()).toMatchObject({
    id: shift.id,
    status: 'open',
    claimedBy: null,
    cancellation: { reason: 'no-show', previousNurseId: 'nurse-1' },
  });
});
