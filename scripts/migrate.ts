import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL required');
const pool = new Pool({ connectionString });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(820174)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
  );
  const directory = new URL('../drizzle/', import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of migrations) {
    const name = file.replace(/\.sql$/, '');
    const existing = await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name]);
    if (!existing.rowCount) {
      await client.query(await readFile(new URL(file, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
  }
  await client.query('COMMIT');
  console.log('Migrations complete');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
