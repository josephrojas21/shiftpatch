import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
import { hash } from 'bcryptjs';
import { PostgresUnitOfWork, pool } from '../src/server/infrastructure/database';
import type { User, Shift, Tables } from '../src/server/domain/models';
const passwordHash = await hash('Trial2026!', 12);
const users: User[] = [
  {
    id: 'agency-a',
    name: 'Sunrise Health Staffing',
    email: 'admin@sunrisehealth.example',
    role: 'agency',
    passwordHash,
  },
  {
    id: 'agency-b',
    name: 'Metro Care Partners',
    email: 'admin@metrocare.example',
    role: 'agency',
    passwordHash,
  },
  {
    id: 'nurse-1',
    name: 'Maria Lopez',
    email: 'maria.lopez@example.com',
    role: 'nurse',
    passwordHash,
  },
  {
    id: 'nurse-2',
    name: 'James Cook',
    email: 'james.cook@example.com',
    role: 'nurse',
    passwordHash,
  },
  { id: 'admin-1', name: 'Alex Kim', email: 'alex.kim@example.com', role: 'admin', passwordHash },
];
const shifts: Shift[] = [
  {
    id: 'shift-1',
    agencyId: 'agency-a',
    agencyName: users[0].name,
    role: 'RN',
    date: '2026-10-02',
    startTime: '19:00',
    endTime: '07:00',
    status: 'open',
    claimedBy: null,
  },
  {
    id: 'shift-2',
    agencyId: 'agency-a',
    agencyName: users[0].name,
    role: 'LPN',
    date: '2026-10-03',
    startTime: '07:00',
    endTime: '19:00',
    status: 'filled',
    claimedBy: 'nurse-1',
  },
  {
    id: 'shift-3',
    agencyId: 'agency-b',
    agencyName: users[1].name,
    role: 'RN',
    date: '2026-10-04',
    startTime: '19:00',
    endTime: '07:00',
    status: 'open',
    claimedBy: null,
  },
];
try {
  await new PostgresUnitOfWork().run(async (r) => {
    await r.lock('seed');
    const insert = async <K extends keyof Tables>(table: K, value: Tables[K]) => {
      if (!(await r.get(table, value.id))) await r.save(table, value);
    };
    for (const user of users) await insert('users', user);
    for (const shift of shifts) await insert('shifts', shift);
    for (const [index, expiry] of ['2027-01-01', '2026-06-01'].entries())
      await insert('credentials', {
        id: `seed-license-${index + 1}`,
        nurseId: `nurse-${index + 1}`,
        nurseName: users[index + 2].name,
        type: 'license',
        fileName: null,
        expiresAt: expiry,
        status: 'approved',
        uploadedAt: '2026-10-01T00:00:00.000Z',
        hasFile: false,
      });
    const current = await r.get('shifts', 'shift-2');
    if (
      current?.status === 'filled' &&
      current.claimedBy === 'nurse-1' &&
      !(await r.list('assignments')).some((a) => a.shiftId === 'shift-2')
    )
      await insert('assignments', {
        id: 'assignment-seed-2',
        shiftId: 'shift-2',
        nurseId: 'nurse-1',
        nurseName: 'Maria Lopez',
        agencyId: 'agency-a',
        agencyName: users[0].name,
        role: 'LPN',
        date: '2026-10-03',
        startTime: '07:00',
        endTime: '19:00',
        status: 'active',
      });
  });
  console.log('Seed complete (existing records preserved)');
} finally {
  await pool().end();
}
