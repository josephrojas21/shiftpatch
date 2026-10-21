export type Role = 'nurse' | 'agency' | 'admin';
export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  passwordHash: string;
}
export interface Shift {
  id: string;
  agencyId: string;
  agencyName: string;
  role: 'RN' | 'LPN';
  date: string;
  startTime: string;
  endTime: string;
  status: 'open' | 'filled';
  claimedBy: string | null;
}
export interface Assignment {
  id: string;
  shiftId: string;
  nurseId: string;
  nurseName: string;
  agencyId: string;
  agencyName: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'active' | 'cancelled';
}
export interface Credential {
  id: string;
  nurseId: string;
  nurseName: string;
  type: 'license' | 'tb_test';
  fileName: string | null;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: string;
  hasFile: boolean;
  storageKey?: string;
  contentType?: string;
}
export interface Timesheet {
  id: string;
  assignmentId: string;
  nurseId: string;
  nurseName: string;
  agencyId: string;
  agencyName: string;
  shiftId: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalMinutes: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  reviewReason: string | null;
}
export interface Audit {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}
export interface Notification {
  id: string;
  type: string;
  recipient: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  createdAt: string;
  lastError: string | null;
  nextAttemptAt?: string;
  subject: string;
  body: string;
}
export interface Cancellation {
  id: string;
  shiftId: string;
  agencyId: string;
  date: string;
  reason: 'advance' | 'no-show';
  previousNurseId: string;
  createdAt: string;
}
export interface RateLimit {
  id: string;
  count: number;
  windowStart: number;
}
export interface Tables {
  users: User;
  shifts: Shift;
  assignments: Assignment;
  credentials: Credential;
  timesheets: Timesheet;
  audit: Audit;
  outbox: Notification;
  cancellations: Cancellation;
  rate_limits: RateLimit;
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertRole(user: User, ...roles: Role[]) {
  if (!roles.includes(user.role)) throw new AppError(403, 'Forbidden');
}
export function assertAgency(user: User, agencyId: string) {
  if (user.role !== 'admin' && !(user.role === 'agency' && user.id === agencyId))
    throw new AppError(403, 'Forbidden');
}
export function credentialValid(
  credentials: Credential[],
  nurseId: string,
  today: string,
  date: string,
) {
  return credentials.some(
    (c) =>
      c.nurseId === nurseId &&
      c.type === 'license' &&
      c.status === 'approved' &&
      c.expiresAt >= today &&
      c.expiresAt >= date,
  );
}
export function workedMinutes(start: string, end: string, rest: number) {
  const valid = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s)) return false;
    const date = new Date(s + 'Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === s;
  };
  if (!valid(start) || !valid(end) || !Number.isInteger(rest) || rest < 0)
    throw new AppError(400, 'Invalid timesheet hours');
  const elapsed = (Date.parse(end + 'Z') - Date.parse(start + 'Z')) / 60000;
  if (elapsed <= 0 || elapsed > 1440 || rest >= elapsed)
    throw new AppError(400, 'Timesheet must span 1–1440 minutes with a shorter break');
  return elapsed - rest;
}
