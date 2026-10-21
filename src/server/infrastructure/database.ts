import { Pool, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableColumns, sql } from 'drizzle-orm';
import * as schema from './schema';
import type { Tables } from '../domain/models';
import type { Repository, UnitOfWork } from '../application/ports';
let shared: Pool | undefined;
export function pool() {
  if (!shared) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    shared = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
    });
    if (process.env.VERCEL) attachDatabasePool(shared);
  }
  return shared;
}
export class PgRepository implements Repository {
  private db;
  constructor(client: PoolClient) {
    this.db = drizzle(client);
  }
  private projection(name: keyof Tables) {
    return sql.join(
      Object.entries(getTableColumns(schema[name])).map(([key, column]) => {
        const identifier = sql.identifier(column.name);
        let value = sql`${identifier}`;
        if (key === 'windowStart') value = sql`${identifier}::float8`;
        if (key === 'date' || key === 'expiresAt')
          value = sql`to_char(${identifier}, 'YYYY-MM-DD')`;
        if (key === 'startTime' || key === 'endTime')
          value =
            name === 'timesheets'
              ? sql`to_char(${identifier}, 'YYYY-MM-DD"T"HH24:MI')`
              : sql`to_char(${identifier}, 'HH24:MI')`;
        return sql`${value} AS ${sql.identifier(key)}`;
      }),
      sql`, `,
    );
  }
  async list<K extends keyof Tables>(name: K): Promise<Tables[K][]> {
    const result = await this.db.execute(
      sql`SELECT ${this.projection(name)} FROM ${sql.identifier(name)}`,
    );
    return result.rows as unknown as Tables[K][];
  }
  async get<K extends keyof Tables>(
    name: K,
    id: string,
    lock = false,
  ): Promise<Tables[K] | undefined> {
    const result = await this.db.execute(
      sql`SELECT ${this.projection(name)} FROM ${sql.identifier(name)} WHERE id=${id} ${lock ? sql`FOR UPDATE` : sql``}`,
    );
    return result.rows[0] as unknown as Tables[K] | undefined;
  }
  async save<K extends keyof Tables>(name: K, value: Tables[K]) {
    const columns = getTableColumns(schema[name]);
    const record = value as unknown as Record<string, unknown>;
    const entries = Object.entries(columns).filter(([key]) => record[key] !== undefined);
    const names = entries.map(([, column]) => sql.identifier(column.name));
    const values = entries.map(([key]) =>
      key === 'metadata' ? sql`${JSON.stringify(record[key])}::jsonb` : sql`${record[key]}`,
    );
    const updates = entries
      .filter(([key]) => key !== 'id')
      .map(
        ([, column]) => sql`${sql.identifier(column.name)}=excluded.${sql.identifier(column.name)}`,
      );
    await this.db.execute(
      sql`INSERT INTO ${sql.identifier(name)} (${sql.join(names, sql`, `)}) VALUES (${sql.join(values, sql`, `)}) ON CONFLICT (id) DO UPDATE SET ${sql.join(updates, sql`, `)}`,
    );
  }
  async lock(key: string) {
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key},0))`);
  }
}
export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private getPool: () => Pool = pool) {}
  async run<T>(work: (repo: Repository) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PgRepository(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
