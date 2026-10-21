import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PostgresUnitOfWork } from '../../src/server/infrastructure/database';
import { ShiftPatch } from '../../src/server/application/service';
import type { Dependencies } from '../../src/server/application/ports';
import type { User, Shift } from '../../src/server/domain/models';
const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)('PostgreSQL transactions and application contracts', () => {
  const namespace = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString });
  const db = new Pool({ connectionString, options: `-c search_path=${namespace}` });
  const uow = new PostgresUnitOfWork(() => db);
  const nurse: User = {
    id: 'nurse-1',
    name: 'Maria Lopez',
    role: 'nurse',
    email: 'maria.lopez@example.com',
    passwordHash: 'hash',
  };
  const agency: User = {
    id: 'agency-a',
    name: 'Sunrise Health Staffing',
    role: 'agency',
    email: 'admin@sunrisehealth.example',
    passwordHash: 'hash',
  };
  const shift: Shift = {
    id: 'shift-1',
    agencyId: 'agency-a',
    agencyName: 'Sunrise Health Staffing',
    role: 'RN',
    date: '2026-10-02',
    startTime: '19:00',
    endTime: '07:00',
    status: 'open',
    claimedBy: null,
  };
  const deps: Dependencies = {
    uow,
    id: randomUUID,
    now: () => new Date('2026-10-20T12:00:00Z'),
    identity: {
      verify: async () => true,
      read: async () => nurse.id,
      sign: async () => 'test-token',
    },
    files: { put: async () => '', get: async () => new Uint8Array(), remove: async () => {} },
    mail: {
      configured: () => true,
      send: async () => {
        throw new Error('unavailable');
      },
    },
  };
  const service = new ShiftPatch(deps);
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${namespace}`);
    await db.query(await readFile('drizzle/0000_initial.sql', 'utf8'));
    await db.query(await readFile('drizzle/0001_local_dates.sql', 'utf8'));
  });
  afterAll(async () => {
    await db.end();
    await admin.query(`DROP SCHEMA ${namespace} CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    await db.query('TRUNCATE users CASCADE');
    await db.query('TRUNCATE outbox,rate_limits');
    await uow.run(async (r) => {
      await r.save('users', nurse);
      await r.save('users', agency);
      await r.save('users', {
        ...nurse,
        id: 'nurse-2',
        name: 'James Cook',
        email: 'james.cook@example.com',
      });
      await r.save('shifts', shift);
      await r.save('credentials', {
        id: 'license-1',
        nurseId: nurse.id,
        nurseName: nurse.name,
        type: 'license',
        fileName: null,
        expiresAt: '2027-01-01',
        status: 'approved',
        uploadedAt: '2026-10-01',
        hasFile: false,
      });
    });
  });
  it('returns independent literal shift contract and allows historical seed dates', async () => {
    expect(await service.claim(nurse, 'shift-1')).toEqual({
      id: 'shift-1',
      agencyId: 'agency-a',
      agencyName: 'Sunrise Health Staffing',
      role: 'RN',
      date: '2026-10-02',
      startTime: '19:00',
      endTime: '07:00',
      status: 'filled',
      claimedBy: 'nurse-1',
    });
  });
  it('permits exactly one concurrent claim and commits one audit/outbox', async () => {
    await uow.run(async (r) => {
      const credential = await r.get('credentials', 'license-1');
      await r.save('credentials', { ...credential!, id: 'license-2', nurseId: 'nurse-2' });
    });
    const results = await Promise.allSettled([
      service.claim(nurse, 'shift-1'),
      service.claim({ ...nurse, id: 'nurse-2' }, 'shift-1'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await db.query('SELECT * FROM assignments')).rowCount).toBe(1);
    expect((await db.query('SELECT * FROM audit')).rowCount).toBe(1);
    expect((await db.query('SELECT * FROM outbox')).rowCount).toBe(2);
  });
  it('rejects invalid credentials with exact message and no side effects', async () => {
    await expect(service.claim({ ...nurse, id: 'nurse-2' }, 'shift-1')).rejects.toMatchObject({
      status: 403,
      message: 'Credential expired, cannot claim shift',
    });
    expect((await db.query('SELECT * FROM audit')).rowCount).toBe(0);
    expect((await service.shifts(nurse))[0].status).toBe('open');
  });
  it('rolls back a claim if audit storage fails', async () => {
    await db.query("ALTER TABLE audit ADD CONSTRAINT test_fail CHECK(action <> 'shift.claimed')");
    try {
      await expect(service.claim(nurse, 'shift-1')).rejects.toThrow();
      expect((await service.shifts(nurse))[0].status).toBe('open');
      expect((await db.query('SELECT * FROM assignments')).rowCount).toBe(0);
    } finally {
      await db.query('ALTER TABLE audit DROP CONSTRAINT test_fail');
    }
  });
  it('reopens cancelled shifts and keeps previous assignment', async () => {
    await service.claim(nurse, 'shift-1');
    const cancelled = await service.cancel(agency, 'shift-1', 'no-show');
    expect(cancelled).toMatchObject({
      status: 'open',
      claimedBy: null,
      cancellation: { reason: 'no-show', previousNurseId: 'nurse-1' },
    });
    expect((await service.assignments(nurse))[0].status).toBe('cancelled');
  });
  it('enforces real timesheet review and immutable approved hours', async () => {
    await service.claim(nurse, 'shift-1');
    const [assignment] = await service.assignments(nurse);
    const sheet = await service.createTimesheet(nurse, {
      assignmentId: assignment.id,
      startTime: '2026-10-02T19:00',
      endTime: '2026-10-03T07:00',
      breakMinutes: 30,
    });
    expect(sheet.totalMinutes).toBe(690);
    await service.submitTimesheet(nurse, sheet.id);
    await expect(
      service.reviewTimesheet({ ...agency, id: 'agency-b' }, sheet.id, 'approved'),
    ).rejects.toMatchObject({ status: 403 });
    await service.reviewTimesheet(agency, sheet.id, 'approved');
    await expect(
      service.editTimesheet(nurse, sheet.id, {
        startTime: '2026-10-02T19:00',
        endTime: '2026-10-03T08:00',
        breakMinutes: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('records provider failure without reverting successful claim', async () => {
    await service.claim(nurse, 'shift-1');
    await service.processMail();
    expect((await service.shifts(nurse))[0].status).toBe('filled');
    const result = await db.query('SELECT status,attempts FROM outbox');
    expect(result.rows[0]).toEqual({ status: 'failed', attempts: 1 });
  });
  it('keeps unconfigured email pending without consuming attempts', async () => {
    await service.claim(nurse, 'shift-1');
    const unconfigured = new ShiftPatch({
      ...deps,
      mail: {
        configured: () => false,
        send: async () => {
          throw new Error('must not call');
        },
      },
    });
    await unconfigured.processMail();
    expect((await db.query('SELECT status,attempts,last_error FROM outbox')).rows[0]).toEqual({
      status: 'pending',
      attempts: 0,
      last_error: 'Email provider is not configured',
    });
  });
  it('blocks cancelled assignment timesheet submission and editing', async () => {
    await service.claim(nurse, 'shift-1');
    const [a] = await service.assignments(nurse);
    const input = {
      assignmentId: a.id,
      startTime: '2026-10-02T19:00',
      endTime: '2026-10-03T07:00',
      breakMinutes: 0,
    };
    const sheet = await service.createTimesheet(nurse, input);
    await service.cancel(agency, 'shift-1', 'advance');
    await expect(service.submitTimesheet(nurse, sheet.id)).rejects.toMatchObject({ status: 409 });
    await expect(service.editTimesheet(nurse, sheet.id, input)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('keeps uploaded credentials pending and protects document ownership', async () => {
    const fileService = new ShiftPatch({
      ...deps,
      files: {
        put: async () => '/private/document',
        get: async () => new Uint8Array([1, 2]),
        remove: async () => {},
      },
    });
    const james = { ...nurse, id: 'nurse-2', name: 'James Cook' };
    const doc = await fileService.upload(james, {
      type: 'license',
      expiresAt: '2027-01-01',
      name: 'license.pdf',
      contentType: 'application/pdf',
      bytes: new Uint8Array([1]),
    });
    expect(doc.status).toBe('pending');
    expect(doc).not.toHaveProperty('storageKey');
    await expect(fileService.claim(james, 'shift-1')).rejects.toMatchObject({ status: 403 });
    await expect(fileService.download(nurse, doc.id)).rejects.toMatchObject({ status: 403 });
    await expect(fileService.download(agency, doc.id)).rejects.toMatchObject({ status: 403 });
    const administrator = {
      ...nurse,
      id: 'admin-1',
      role: 'admin' as const,
      email: 'admin@example.com',
    };
    await uow.run((r) => r.save('users', administrator));
    await fileService.reviewCredential(administrator, doc.id, 'approved');
    expect((await fileService.claim(james, 'shift-1')).claimedBy).toBe('nurse-2');
    expect((await fileService.download(james, doc.id)).bytes).toEqual(new Uint8Array([1, 2]));
  });
});
