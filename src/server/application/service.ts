import {
  AppError,
  assertRole,
  assertAgency,
  credentialValid,
  workedMinutes,
  type User,
  type Shift,
  type Credential,
  type Tables,
  type Timesheet,
} from '../domain/models';
import type { Dependencies, Repository } from './ports';
type Actor = User;
export class ShiftPatch {
  constructor(private d: Dependencies) {}
  private async required<K extends keyof Tables>(r: Repository, t: K, id: string, lock = false) {
    const value = await r.get(t, id, lock);
    if (!value) throw new AppError(404, 'Not found');
    return value;
  }
  private async audit(
    r: Repository,
    u: Actor,
    action: string,
    targetId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await r.save('audit', {
      id: this.d.id(),
      actorId: u.id,
      actorName: u.name,
      action,
      targetId,
      metadata,
      createdAt: this.d.now().toISOString(),
    });
  }
  private async notify(r: Repository, u: User, type: string, target: string) {
    await r.save('outbox', {
      id: this.d.id(),
      type,
      recipient: u.email,
      status: 'pending',
      attempts: 0,
      createdAt: this.d.now().toISOString(),
      lastError: null,
      subject: `ShiftPatch: ${type}`,
      body: `Your ShiftPatch record ${target} has been updated (${type}). Sign in to review the details.`,
    });
  }
  async login(email: string, password: string) {
    const user = await this.d.uow.run(async (r) => {
      const key = `login:${email.toLowerCase()}`;
      await r.lock(key);
      const entry = await r.get('rate_limits', key);
      const now = this.d.now().getTime();
      const rate =
        !entry || now - entry.windowStart > 900000
          ? { id: key, count: 0, windowStart: now }
          : entry;
      if (rate.count >= 20) throw new AppError(429, 'Too many login attempts. Try again later');
      rate.count++;
      await r.save('rate_limits', rate);
      return (await r.list('users')).find((u) => u.email.toLowerCase() === email.toLowerCase());
    });
    if (!user || !(await this.d.identity.verify(password, user.passwordHash)))
      throw new AppError(401, 'Invalid email or password');
    return {
      token: await this.d.identity.sign(user),
      user: { id: user.id, name: user.name, role: user.role },
    };
  }
  async authenticate(token: string) {
    let id: string;
    try {
      id = await this.d.identity.read(token);
    } catch {
      throw new AppError(401, 'Authentication required');
    }
    return this.d.uow.run(async (r) => {
      const u = await r.get('users', id);
      if (!u) throw new AppError(401, 'Authentication required');
      return u;
    });
  }
  async shifts(u: Actor, agencyId?: string) {
    if (agencyId) assertAgency(u, agencyId);
    return this.d.uow.run(async (r) =>
      (await r.list('shifts'))
        .filter((s) => !agencyId || s.agencyId === agencyId)
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
  async postShift(u: Actor, input: Pick<Shift, 'role' | 'date' | 'startTime' | 'endTime'>) {
    assertRole(u, 'agency');
    return this.d.uow.run(async (r) => {
      const shift: Shift = {
        ...input,
        id: this.d.id(),
        agencyId: u.id,
        agencyName: u.name,
        status: 'open',
        claimedBy: null,
      };
      await r.save('shifts', shift);
      await this.audit(r, u, 'shift.posted', shift.id);
      return shift;
    });
  }
  async claim(u: Actor, id: string) {
    assertRole(u, 'nurse');
    return this.d.uow.run(async (r) => {
      await r.lock(`credentials:${u.id}`);
      const shift = await this.required(r, 'shifts', id, true);
      if (
        !credentialValid(
          await r.list('credentials'),
          u.id,
          this.d.now().toISOString().slice(0, 10),
          shift.date,
        )
      )
        throw new AppError(403, 'Credential expired, cannot claim shift');
      if (shift.status !== 'open') throw new AppError(409, 'Shift is no longer available');
      shift.status = 'filled';
      shift.claimedBy = u.id;
      await r.save('shifts', shift);
      await r.save('assignments', {
        id: this.d.id(),
        shiftId: id,
        nurseId: u.id,
        nurseName: u.name,
        agencyId: shift.agencyId,
        agencyName: shift.agencyName,
        role: shift.role,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: 'active',
      });
      await this.audit(r, u, 'shift.claimed', id);
      await this.notify(r, u, 'Shift claimed', id);
      await this.notify(r, await this.required(r, 'users', shift.agencyId), 'Shift claimed', id);
      return shift;
    });
  }
  async cancel(u: Actor, id: string, reason: 'advance' | 'no-show') {
    return this.d.uow.run(async (r) => {
      const shift = await this.required(r, 'shifts', id, true);
      if (u.role === 'nurse') {
        if (shift.claimedBy !== u.id || reason !== 'advance') throw new AppError(403, 'Forbidden');
      } else assertAgency(u, shift.agencyId);
      if (!shift.claimedBy || shift.status !== 'filled')
        throw new AppError(409, 'Shift is not filled');
      const previousNurseId = shift.claimedBy;
      shift.status = 'open';
      shift.claimedBy = null;
      await r.save('shifts', shift);
      const assignment = (await r.list('assignments')).find(
        (a) => a.shiftId === id && a.status === 'active',
      );
      if (assignment) {
        const locked = await this.required(r, 'assignments', assignment.id, true);
        locked.status = 'cancelled';
        await r.save('assignments', locked);
      }
      await r.save('cancellations', {
        id: this.d.id(),
        shiftId: id,
        agencyId: shift.agencyId,
        date: shift.date,
        reason,
        previousNurseId,
        createdAt: this.d.now().toISOString(),
      });
      await this.audit(r, u, 'shift.cancelled', id, { reason, previousNurseId });
      const nurse = await this.required(r, 'users', previousNurseId);
      await this.notify(r, nurse, 'Shift cancelled', id);
      await this.notify(r, await this.required(r, 'users', shift.agencyId), 'Shift cancelled', id);
      return { ...shift, cancellation: { reason, previousNurseId } };
    });
  }
  async credentials(u: Actor) {
    assertRole(u, 'nurse', 'admin');
    return this.d.uow.run(async (r) =>
      (await r.list('credentials'))
        .filter((c) => u.role === 'admin' || c.nurseId === u.id)
        .map((c) => this.publicCredential(c)),
    );
  }
  async upload(
    u: Actor,
    input: {
      type: 'license' | 'tb_test';
      expiresAt: string;
      name: string;
      contentType: string;
      bytes: Uint8Array;
    },
  ) {
    assertRole(u, 'nurse');
    const id = this.d.id();
    const storageKey = await this.d.files.put(
      `credentials/${u.id}/${id}`,
      input.bytes,
      input.contentType,
    );
    try {
      return await this.d.uow.run(async (r) => {
        await r.lock(`credentials:${u.id}`);
        if ((await r.list('credentials')).filter((c) => c.nurseId === u.id).length >= 20)
          throw new AppError(413, 'Maximum 20 credentials per nurse');
        const c: Credential = {
          id,
          nurseId: u.id,
          nurseName: u.name,
          type: input.type,
          expiresAt: input.expiresAt,
          fileName: input.name,
          status: 'pending',
          uploadedAt: this.d.now().toISOString(),
          hasFile: true,
          storageKey,
          contentType: input.contentType,
        };
        await r.save('credentials', c);
        await this.audit(r, u, 'credential.uploaded', id);
        return this.publicCredential(c);
      });
    } catch (error) {
      await this.d.files.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }
  private publicCredential(c: Credential) {
    return {
      id: c.id,
      nurseId: c.nurseId,
      nurseName: c.nurseName,
      type: c.type,
      fileName: c.fileName,
      expiresAt: c.expiresAt,
      status: c.status,
      uploadedAt: c.uploadedAt,
      hasFile: c.hasFile,
    };
  }
  async reviewCredential(u: Actor, id: string, status: 'approved' | 'rejected') {
    assertRole(u, 'admin');
    return this.d.uow.run(async (r) => {
      const initial = await this.required(r, 'credentials', id);
      await r.lock(`credentials:${initial.nurseId}`);
      const c = await this.required(r, 'credentials', id, true);
      if (c.status !== 'pending') throw new AppError(409, 'Credential has already been reviewed');
      c.status = status;
      await r.save('credentials', c);
      await this.audit(r, u, `credential.${status}`, id);
      return this.publicCredential(c);
    });
  }
  async download(u: Actor, id: string) {
    const c = await this.d.uow.run(async (r) => {
      const c = await this.required(r, 'credentials', id);
      if (u.role !== 'admin' && !(u.role === 'nurse' && c.nurseId === u.id))
        throw new AppError(403, 'Forbidden');
      if (!c.storageKey) throw new AppError(404, 'Document unavailable');
      await this.audit(r, u, 'credential.downloaded', id);
      return c;
    });
    return {
      bytes: await this.d.files.get(c.storageKey!),
      name: c.fileName!,
      contentType: c.contentType!,
    };
  }
  private visible(u: Actor, item: { nurseId: string; agencyId: string }) {
    return (
      u.role === 'admin' || (u.role === 'nurse' ? item.nurseId === u.id : item.agencyId === u.id)
    );
  }
  async assignments(u: Actor) {
    return this.d.uow.run(async (r) =>
      (await r.list('assignments')).filter((a) => this.visible(u, a)),
    );
  }
  async timesheets(u: Actor) {
    return this.d.uow.run(async (r) =>
      (await r.list('timesheets')).filter((t) => this.visible(u, t)),
    );
  }
  async createTimesheet(
    u: Actor,
    input: { assignmentId: string; startTime: string; endTime: string; breakMinutes: number },
  ) {
    assertRole(u, 'nurse');
    return this.d.uow.run(async (r) => {
      const a = await this.required(r, 'assignments', input.assignmentId, true);
      if (a.nurseId !== u.id) throw new AppError(403, 'Forbidden');
      if (a.status !== 'active') throw new AppError(409, 'Assignment was cancelled');
      if ((await r.list('timesheets')).some((t) => t.assignmentId === a.id))
        throw new AppError(409, 'Timesheet already exists');
      const t: Timesheet = {
        id: this.d.id(),
        assignmentId: a.id,
        nurseId: u.id,
        nurseName: u.name,
        agencyId: a.agencyId,
        agencyName: a.agencyName,
        shiftId: a.shiftId,
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
        totalMinutes: workedMinutes(input.startTime, input.endTime, input.breakMinutes),
        status: 'draft',
        reviewReason: null,
      };
      await r.save('timesheets', t);
      await this.audit(r, u, 'timesheet.created', t.id);
      return t;
    });
  }
  async editTimesheet(
    u: Actor,
    id: string,
    input: { startTime: string; endTime: string; breakMinutes: number },
  ) {
    return this.d.uow.run(async (r) => {
      const t = await this.required(r, 'timesheets', id, true);
      if (u.role !== 'nurse' || u.id !== t.nurseId) throw new AppError(403, 'Forbidden');
      if ((await this.required(r, 'assignments', t.assignmentId, true)).status !== 'active')
        throw new AppError(409, 'Assignment was cancelled');
      if (!['draft', 'rejected'].includes(t.status))
        throw new AppError(409, 'Timesheet cannot be edited');
      Object.assign(t, input, {
        totalMinutes: workedMinutes(input.startTime, input.endTime, input.breakMinutes),
        status: 'draft',
        reviewReason: null,
      });
      await r.save('timesheets', t);
      await this.audit(r, u, 'timesheet.edited', id);
      return t;
    });
  }
  async submitTimesheet(u: Actor, id: string) {
    return this.d.uow.run(async (r) => {
      const t = await this.required(r, 'timesheets', id, true);
      if (u.role !== 'nurse' || t.nurseId !== u.id) throw new AppError(403, 'Forbidden');
      if ((await this.required(r, 'assignments', t.assignmentId, true)).status !== 'active')
        throw new AppError(409, 'Assignment was cancelled');
      if (!['draft', 'rejected'].includes(t.status))
        throw new AppError(409, 'Timesheet cannot be submitted');
      t.status = 'submitted';
      await r.save('timesheets', t);
      await this.audit(r, u, 'timesheet.submitted', id);
      await this.notify(r, await this.required(r, 'users', t.agencyId), 'Timesheet submitted', id);
      return t;
    });
  }
  async reviewTimesheet(u: Actor, id: string, status: 'approved' | 'rejected', reason?: string) {
    return this.d.uow.run(async (r) => {
      const t = await this.required(r, 'timesheets', id, true);
      assertAgency(u, t.agencyId);
      if (t.status !== 'submitted') throw new AppError(409, 'Timesheet is not submitted');
      if (status === 'rejected' && !reason?.trim())
        throw new AppError(400, 'Rejection reason is required');
      t.status = status;
      t.reviewReason = reason?.trim() || null;
      await r.save('timesheets', t);
      await this.audit(r, u, `timesheet.${status}`, id);
      await this.notify(r, await this.required(r, 'users', t.nurseId), `Timesheet ${status}`, id);
      return t;
    });
  }
  async report(u: Actor, filter: { agencyId?: string; from?: string; to?: string }) {
    assertRole(u, 'admin');
    return this.d.uow.run(async (r) => {
      const matches = (x: { agencyId: string; date: string }) =>
        (!filter.agencyId || x.agencyId === filter.agencyId) &&
        (!filter.from || x.date >= filter.from) &&
        (!filter.to || x.date <= filter.to);
      const shifts = (await r.list('shifts')).filter(matches);
      const ids = new Set(shifts.map((s) => s.id));
      const cancellations = (await r.list('cancellations')).filter(matches);
      const filled = shifts.filter((s) => s.status === 'filled').length;
      return {
        open: shifts.length - filled,
        filled,
        cancellations: cancellations.length,
        noShows: cancellations.filter((c) => c.reason === 'no-show').length,
        approvedMinutes: (await r.list('timesheets'))
          .filter((t) => t.status === 'approved' && ids.has(t.shiftId))
          .reduce((n, t) => n + t.totalMinutes, 0),
        coverageRate: shifts.length ? Math.round((filled / shifts.length) * 100) : 0,
        shifts,
      };
    });
  }
  async auditLog(u: Actor, page: number) {
    assertRole(u, 'admin');
    return this.d.uow.run(async (r) => {
      const events = (await r.list('audit')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { events: events.slice((page - 1) * 50, page * 50), total: events.length };
    });
  }
  async exportDocuments(u: Actor, nurseId?: string) {
    assertRole(u, 'admin');
    const records = await this.d.uow.run(async (r) => {
      const credentials = (await r.list('credentials')).filter(
        (c) => !nurseId || c.nurseId === nurseId,
      );
      const nurses = (await r.list('users')).filter(
        (n) => n.role === 'nurse' && (!nurseId || n.id === nurseId),
      );
      await this.audit(r, u, 'documents.exported', nurseId || 'all');
      return { credentials, nurses };
    });
    const files: Record<string, Uint8Array> = {};
    let totalBytes = 0;
    const manifest: { nurseId: string; type: string; status: string; file?: string }[] = [];
    for (const n of records.nurses) {
      for (const type of ['license', 'tb_test']) {
        const docs = records.credentials.filter((c) => c.nurseId === n.id && c.type === type);
        if (!docs.length) manifest.push({ nurseId: n.id, type, status: 'missing' });
        for (const c of docs) {
          if (!c.storageKey) {
            manifest.push({ nurseId: n.id, type, status: 'missing' });
            continue;
          }
          const name = `${n.id}/${c.id}-${(c.fileName || 'document').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const bytes = await this.d.files.get(c.storageKey);
          totalBytes += bytes.byteLength;
          if (totalBytes > 20 * 1024 * 1024)
            throw new AppError(413, 'Export exceeds 20 MB; filter by nurse');
          files[name] = bytes;
          manifest.push({ nurseId: n.id, type, status: c.status, file: name });
        }
      }
    }
    return { files, manifest };
  }
  async notifications(u: Actor) {
    assertRole(u, 'admin');
    return this.d.uow.run(async (r) =>
      (await r.list('outbox')).map((n) => ({
        id: n.id,
        type: n.type,
        recipient: n.recipient,
        status: n.status,
        attempts: n.attempts,
        createdAt: n.createdAt,
        lastError: n.lastError,
      })),
    );
  }
  async processMail() {
    return this.d.uow.run(async (r) => {
      await r.lock('email-worker');
      const pending = (await r.list('outbox'))
        .filter(
          (n) =>
            n.status !== 'sent' &&
            n.attempts < 5 &&
            (!n.nextAttemptAt || n.nextAttemptAt <= this.d.now().toISOString()),
        )
        .slice(0, 20);
      for (const n of pending) {
        if (!this.d.mail.configured()) {
          n.status = 'pending';
          n.lastError = 'Email provider is not configured';
          await r.save('outbox', n);
          continue;
        }
        n.attempts++;
        try {
          await this.d.mail.send(n.recipient, n.subject, n.body, n.id);
          n.status = 'sent';
          n.lastError = null;
        } catch {
          n.status = 'failed';
          n.lastError = 'Delivery failed; check provider configuration';
          n.nextAttemptAt = new Date(
            this.d.now().getTime() + 2 ** n.attempts * 60000,
          ).toISOString();
        }
        await r.save('outbox', n);
      }
      return { processed: pending.length };
    });
  }
  async healthy() {
    return this.d.uow.run(async (r) => {
      await r.list('users');
      return true;
    });
  }
}
