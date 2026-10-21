import { test, expect } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
test('private document upload, approval, authorized download and ZIP export', async ({
  request,
}) => {
  test.skip(
    !process.env.BLOB_READ_WRITE_TOKEN,
    'Requires a real private Blob test connection; provider unit tests still run in CI.',
  );
  async function login(email: string) {
    const r = await request.post('/api/auth/login', { data: { email, password: 'Trial2026!' } });
    expect(r.status()).toBe(200);
    return (await r.json()).token as string;
  }
  const nurse = await login('maria.lopez@example.com');
  const other = await login('james.cook@example.com');
  const admin = await login('alex.kim@example.com');
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=',
    'base64',
  );
  const upload = await request.post('/api/credentials', {
    headers: { Authorization: `Bearer ${nurse}` },
    multipart: {
      type: 'tb_test',
      expiresAt: '2027-01-01',
      file: { name: 'synthetic-test.png', mimeType: 'image/png', buffer: bytes },
    },
  });
  expect(upload.status()).toBe(201);
  const credential = await upload.json();
  expect(credential.status).toBe('pending');
  expect(credential).not.toHaveProperty('storageKey');
  const denied = await request.get(`/api/credentials/${credential.id}/download`, {
    headers: { Authorization: `Bearer ${other}` },
  });
  expect(denied.status()).toBe(403);
  const approved = await request.post(`/api/credentials/${credential.id}/review`, {
    headers: { Authorization: `Bearer ${admin}` },
    data: { status: 'approved' },
  });
  expect(approved.status()).toBe(200);
  const downloaded = await request.get(`/api/credentials/${credential.id}/download`, {
    headers: { Authorization: `Bearer ${nurse}` },
  });
  expect(downloaded.status()).toBe(200);
  expect(await downloaded.body()).toEqual(bytes);
  expect(downloaded.headers()['cache-control']).toContain('no-store');
  const exported = await request.get('/api/admin/exports/documents?nurseId=nurse-1', {
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(exported.status()).toBe(200);
  const archive = unzipSync(await exported.body());
  const manifest = JSON.parse(strFromU8(archive['manifest.json']));
  expect(manifest).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ nurseId: 'nurse-1', type: 'tb_test', status: 'approved' }),
      expect.objectContaining({ type: 'license', status: 'missing' }),
    ]),
  );
});
