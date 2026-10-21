import { describe, it, expect } from 'vitest';
import {
  credentialValid,
  workedMinutes,
  assertAgency,
  AppError,
  type User,
  type Credential,
} from '../../src/server/domain/models';
const nurse: User = {
  id: 'nurse-1',
  name: 'Maria',
  role: 'nurse',
  email: 'maria@example.com',
  passwordHash: 'hash',
};
const license: Credential = {
  id: 'license',
  nurseId: 'nurse-1',
  nurseName: 'Maria',
  type: 'license',
  fileName: null,
  expiresAt: '2027-01-01',
  status: 'approved',
  uploadedAt: '2026-10-01',
  hasFile: false,
};
describe('business policies', () => {
  it('accepts overnight local times and subtracts unpaid breaks', () =>
    expect(workedMinutes('2026-10-02T19:00', '2026-10-03T07:00', 30)).toBe(690));
  it.each([
    ['2026-10-03T07:00', '2026-10-02T19:00', 0],
    ['2026-10-02T19:00', '2026-10-03T07:00', 720],
    ['2026-10-02T19:00', '2026-10-04T07:00', 0],
    ['2026-02-30T19:00', '2026-03-03T07:00', 0],
    ['2026-99-01T19:00', '2026-10-03T07:00', 0],
  ])('rejects invalid hours %s %s', (a, b, c) =>
    expect(() => workedMinutes(a as string, b as string, c as number)).toThrow(),
  );
  it('requires approved license current today and on shift date', () => {
    expect(credentialValid([license], 'nurse-1', '2026-10-20', '2026-10-02')).toBe(true);
    expect(
      credentialValid([{ ...license, status: 'pending' }], 'nurse-1', '2026-10-20', '2026-10-02'),
    ).toBe(false);
    expect(credentialValid([license], 'nurse-1', '2027-01-02', '2026-10-02')).toBe(false);
    expect(credentialValid([license], 'nurse-1', '2026-10-20', '2027-01-02')).toBe(false);
  });
  it('prevents nurse and cross-agency administrative actions', () => {
    expect(() => assertAgency(nurse, 'agency-a')).toThrow(AppError);
    expect(() => assertAgency({ ...nurse, role: 'agency', id: 'agency-b' }, 'agency-a')).toThrow(
      AppError,
    );
  });
});
