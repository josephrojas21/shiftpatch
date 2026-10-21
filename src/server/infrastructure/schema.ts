import {
  pgTable,
  text,
  date,
  time,
  timestamp,
  integer,
  boolean,
  jsonb,
  bigint,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const users = pgTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  role: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
});
export const shifts = pgTable(
  'shifts',
  {
    id: text().primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => users.id),
    agencyName: text('agency_name').notNull(),
    role: text().notNull(),
    date: date({ mode: 'string' }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    status: text().notNull(),
    claimedBy: text('claimed_by').references(() => users.id),
  },
  (t) => [
    index('shifts_agency').on(t.agencyId),
    check(
      'shift_claim_consistent',
      sql`(${t.status}='open' AND ${t.claimedBy} IS NULL) OR (${t.status}='filled' AND ${t.claimedBy} IS NOT NULL)`,
    ),
  ],
);
export const assignments = pgTable(
  'assignments',
  {
    id: text().primaryKey(),
    shiftId: text('shift_id')
      .notNull()
      .references(() => shifts.id),
    nurseId: text('nurse_id')
      .notNull()
      .references(() => users.id),
    nurseName: text('nurse_name').notNull(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => users.id),
    agencyName: text('agency_name').notNull(),
    role: text().notNull(),
    date: date({ mode: 'string' }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    status: text().notNull(),
  },
  (t) => [
    uniqueIndex('active_assignment')
      .on(t.shiftId)
      .where(sql`${t.status}='active'`),
  ],
);
export const credentials = pgTable('credentials', {
  id: text().primaryKey(),
  nurseId: text('nurse_id')
    .notNull()
    .references(() => users.id),
  nurseName: text('nurse_name').notNull(),
  type: text().notNull(),
  fileName: text('file_name'),
  expiresAt: date('expires_at', { mode: 'string' }).notNull(),
  status: text().notNull(),
  uploadedAt: text('uploaded_at').notNull(),
  hasFile: boolean('has_file').notNull(),
  storageKey: text('storage_key'),
  contentType: text('content_type'),
});
export const timesheets = pgTable('timesheets', {
  id: text().primaryKey(),
  assignmentId: text('assignment_id')
    .notNull()
    .unique()
    .references(() => assignments.id),
  nurseId: text('nurse_id')
    .notNull()
    .references(() => users.id),
  nurseName: text('nurse_name').notNull(),
  agencyId: text('agency_id')
    .notNull()
    .references(() => users.id),
  agencyName: text('agency_name').notNull(),
  shiftId: text('shift_id')
    .notNull()
    .references(() => shifts.id),
  startTime: timestamp('start_time', { mode: 'string', withTimezone: false }).notNull(),
  endTime: timestamp('end_time', { mode: 'string', withTimezone: false }).notNull(),
  breakMinutes: integer('break_minutes').notNull(),
  totalMinutes: integer('total_minutes').notNull(),
  status: text().notNull(),
  reviewReason: text('review_reason'),
});
export const audit = pgTable('audit', {
  id: text().primaryKey(),
  actorId: text('actor_id')
    .notNull()
    .references(() => users.id),
  actorName: text('actor_name').notNull(),
  action: text().notNull(),
  targetId: text('target_id').notNull(),
  createdAt: text('created_at').notNull(),
  metadata: jsonb().notNull(),
});
export const outbox = pgTable('outbox', {
  id: text().primaryKey(),
  type: text().notNull(),
  recipient: text().notNull(),
  status: text().notNull(),
  attempts: integer().notNull(),
  createdAt: text('created_at').notNull(),
  lastError: text('last_error'),
  nextAttemptAt: text('next_attempt_at'),
  subject: text().notNull(),
  body: text().notNull(),
});
export const cancellations = pgTable('cancellations', {
  id: text().primaryKey(),
  shiftId: text('shift_id')
    .notNull()
    .references(() => shifts.id),
  agencyId: text('agency_id')
    .notNull()
    .references(() => users.id),
  date: date({ mode: 'string' }).notNull(),
  reason: text().notNull(),
  previousNurseId: text('previous_nurse_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
});
export const rate_limits = pgTable('rate_limits', {
  id: text().primaryKey(),
  count: integer().notNull(),
  windowStart: bigint('window_start', { mode: 'number' }).notNull(),
});
