import { z } from 'zod';
export const userRoleSchema = z.enum(['nurse', 'agency', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;
export const userSchema = z.object({ id: z.string(), name: z.string(), role: userRoleSchema });
export type UserDto = z.infer<typeof userSchema>;
export const shiftSchema = z.object({
  id: z.string(),
  agencyId: z.string(),
  agencyName: z.string(),
  role: z.enum(['RN', 'LPN']),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.enum(['open', 'filled']),
  claimedBy: z.string().nullable(),
});
export type ShiftDto = z.infer<typeof shiftSchema>;
export const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(128) });
export const postShiftSchema = z
  .object({
    role: z.enum(['RN', 'LPN']),
    date: z.iso.date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((v) => v.startTime !== v.endTime, {
    message: 'Start and end times must differ',
    path: ['endTime'],
  });
export const cancelSchema = z.object({ reason: z.enum(['advance', 'no-show']) });
export interface CredentialDto {
  id: string;
  nurseId: string;
  nurseName: string;
  type: 'license' | 'tb_test';
  fileName: string | null;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: string;
  hasFile: boolean;
}
export interface AssignmentDto {
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
export interface TimesheetDto {
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
export interface AuditDto {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}
export interface NotificationDto {
  id: string;
  type: string;
  recipient: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  createdAt: string;
  lastError: string | null;
}
export interface ReportDto {
  open: number;
  filled: number;
  cancellations: number;
  noShows: number;
  approvedMinutes: number;
  coverageRate: number;
  shifts: ShiftDto[];
}
export const timesheetInputSchema = z.object({
  assignmentId: z.string().min(1),
  startTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  breakMinutes: z.number().int().min(0).max(1440),
});
export const testIds = {
  loginEmail: 'login-email-input',
  loginPassword: 'login-password-input',
  loginSubmit: 'login-submit-button',
  shiftItem: 'shift-list-item',
  claim: 'shift-claim-button',
  cancel: 'shift-cancel-button',
  credentialUpload: 'credential-upload-input',
  credentialExpiry: 'credential-expiry-date-input',
  postShift: 'agency-post-shift-button',
  submitShift: 'agency-post-shift-submit-button',
  adminTable: 'admin-dashboard-shift-table',
  status: 'admin-shift-status-badge',
  audit: 'audit-log-table',
  timesheet: 'timesheet-table',
  notification: 'notification-banner',
} as const;
