import { config } from 'dotenv';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
config({ path: '.env.local', quiet: true });
if (process.env.BASE_URL)
  throw new Error('Mutating E2E tests must run locally, not against a remote BASE_URL.');
if (!process.env.TEST_DATABASE_URL)
  throw new Error('Set TEST_DATABASE_URL to an isolated PostgreSQL test database.');
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const schema = `e2e_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set('options', `-c search_path=${schema}`);
const portProbe = createServer();
await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
const testPort = (portProbe.address() as import('node:net').AddressInfo).port;
await new Promise<void>((resolve) => portProbe.close(() => resolve()));
const useRealBlob = process.env.E2E_REAL_BLOB === '1';
if (useRealBlob && !process.env.BLOB_READ_WRITE_TOKEN)
  throw new Error('E2E_REAL_BLOB=1 requires a private Blob test token.');
const env = {
  ...process.env,
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  DEMO_EMAIL_TO: '',
  NEXT_PUBLIC_POSTHOG_KEY: '',
  BLOB_READ_WRITE_TOKEN: useRealBlob ? process.env.BLOB_READ_WRITE_TOKEN! : '',
  DATABASE_URL: url.toString(),
  DATABASE_URL_UNPOOLED: url.toString(),
  AUTH_SECRET: 'isolated-e2e-secret-' + randomBytes(32).toString('hex'),
  E2E_ISOLATED: 'true',
  E2E_PORT: String(testPort),
};
function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`E2E command exited with ${code}`)),
    );
  });
}
try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await run(['--import', 'tsx', 'scripts/migrate.ts']);
  await run(['--import', 'tsx', 'scripts/seed.ts']);
  await run(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)]);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'E2E failed');
  process.exitCode = 1;
} finally {
  try {
    if (useRealBlob) {
      const result = await pool.query(
        `SELECT storage_key FROM "${schema}".credentials WHERE storage_key IS NOT NULL`,
      );
      const { del } = await import('@vercel/blob');
      for (const row of result.rows) await del(row.storage_key);
    }
  } catch {
    console.error('Could not clean up test document objects; inspect the test store.');
  }
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
