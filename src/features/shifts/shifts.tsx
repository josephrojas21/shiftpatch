'use client';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  ListFilter,
  Moon,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import {
  Badge,
  Empty,
  ErrorState,
  Field,
  FormError,
  Modal,
  Spinner,
  Submit,
} from '@/components/ui';
import { postShiftSchema, testIds, type ShiftDto, type AssignmentDto } from '@/contracts';
import { api, displayDate, json } from '../shared/api';
import { useAction, useWorkspace } from '../shared/workspace';
import { track } from '../shared/analytics';
export function Shifts({ mine = false }: { mine?: boolean }) {
  const { user } = useWorkspace();
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [posting, setPosting] = useState(false);
  const [cancelling, setCancelling] = useState<ShiftDto | null>(null);
  const path = user.role === 'agency' ? `/api/agencies/${user.id}/shifts` : '/api/shifts';
  const query = useQuery({
    queryKey: ['shifts', user.id],
    queryFn: () => api<{ shifts: ShiftDto[] }>(path),
    refetchInterval: 10000,
  });
  const claim = useAction(
    (id: string) => api(`/api/shifts/${id}/claim`, { method: 'POST' }),
    'Shift claimed. You’re on the schedule.',
    () => track('shift_claimed'),
  );
  const assignments = useQuery({
    queryKey: ['assignments', user.id],
    queryFn: () => api<{ assignments: AssignmentDto[] }>('/api/assignments'),
    enabled: user.role === 'agency',
    refetchInterval: 10000,
  });
  const activeAssignments = new Map(
    (assignments.data?.assignments ?? [])
      .filter((a) => a.status === 'active')
      .map((a) => [a.shiftId, a]),
  );
  if (query.isPending) return <Spinner label="Finding your shifts…" />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const shifts = query.data.shifts.filter((shift) => !mine || shift.claimedBy === user.id);
  const visible = shifts.filter(
    (shift) =>
      (role === 'all' || shift.role === role) &&
      (status === 'all' || shift.status === status) &&
      `${shift.agencyName} ${shift.role} ${shift.date}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const open = shifts.filter((s) => s.status === 'open').length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">
            {mine
              ? 'YOUR SCHEDULE'
              : user.role === 'agency'
                ? 'STAFFING WORKSPACE'
                : 'FIND YOUR NEXT OPPORTUNITY'}
          </span>
          <h1>
            {mine
              ? 'My shifts'
              : user.role === 'agency'
                ? 'Your agency’s shifts'
                : 'Shift marketplace'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {mine
              ? 'The care teams counting on you. All in one place.'
              : user.role === 'agency'
                ? 'Build a reliable team, one well-covered shift at a time.'
                : 'Meaningful work. A schedule that works for you.'}
          </p>
        </div>
        {user.role === 'agency' && (
          <button
            className="button primary"
            data-testid={testIds.postShift}
            onClick={() => setPosting(true)}
          >
            <Plus size={18} />
            Post a shift
          </button>
        )}
      </div>
      <div className="stats-grid">
        <Stat
          label="Available shifts"
          value={open}
          detail="Ready to be claimed"
          icon={<CalendarDays size={20} />}
        />
        <Stat
          label={mine ? 'Your confirmed shifts' : 'Covered shifts'}
          value={shifts.length - open}
          detail="Care teams connected"
          icon={<Building2 size={20} />}
        />
        <div className="stat-card note-card">
          <div>
            <span className="eyebrow">GOOD CARE STARTS HERE</span>
            <h3>{mine ? 'Make every hour count.' : 'Your next shift matters.'}</h3>
            <p>
              {mine
                ? 'Record your actual hours in Timesheets.'
                : 'All shift times are facility-local.'}
            </p>
          </div>
          <ArrowUpRight size={28} />
        </div>
      </div>
      <section className="panel">
        {assignments.error && (
          <ErrorState error={assignments.error} retry={() => void assignments.refetch()} />
        )}
        <div className="panel-title">
          <div>
            <h2>{mine ? 'Your confirmed schedule' : 'Explore shifts'}</h2>
            <p>
              {visible.length} {visible.length === 1 ? 'shift' : 'shifts'} matching your view
            </p>
          </div>
          <span className="live-label">
            <span className="live-dot" /> Updates every 10s
          </span>
        </div>
        <div className="filter-bar">
          <label className="search-input">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search shifts"
              placeholder="Search agency, role or date…"
            />
          </label>
          <label className="filter-select">
            <ListFilter size={16} />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              <option>RN</option>
              <option>LPN</option>
            </select>
          </label>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="filled">Filled</option>
          </select>
        </div>
        <div className="shift-list">
          {visible.map((shift) => (
            <article className="shift-card" key={shift.id} data-testid={testIds.shiftItem}>
              <div className={`role-icon ${shift.role.toLowerCase()}`}>{shift.role}</div>
              <div className="shift-main">
                <div className="shift-title">
                  <h3>{shift.role === 'RN' ? 'Registered Nurse' : 'Licensed Practical Nurse'}</h3>
                  <Badge status={shift.status} />
                </div>
                <p>
                  <Building2 size={14} />
                  {shift.agencyName}
                </p>
                <div className="shift-details">
                  <span>
                    <CalendarDays size={15} />
                    {displayDate(shift.date)}
                  </span>
                  <span>
                    <Clock3 size={15} />
                    {shift.startTime} – {shift.endTime}
                    {shift.endTime <= shift.startTime ? ' (+1 day)' : ''}
                  </span>
                  <span>
                    {shift.endTime <= shift.startTime ? <Moon size={15} /> : <Sun size={15} />}{' '}
                    {shift.endTime <= shift.startTime ? 'Night shift' : 'Day shift'}
                  </span>
                </div>
              </div>
              <div className="shift-action">
                {user.role === 'nurse' && shift.status === 'open' ? (
                  <button
                    data-testid={testIds.claim}
                    className="button primary"
                    disabled={claim.isPending}
                    onClick={() => claim.mutate(shift.id)}
                  >
                    Claim shift <ArrowUpRight size={16} />
                  </button>
                ) : shift.status === 'filled' &&
                  (shift.claimedBy === user.id || user.role !== 'nurse') ? (
                  <>
                    <span className="assigned-label">
                      {shift.claimedBy === user.id
                        ? 'You’re assigned'
                        : activeAssignments.get(shift.id)?.nurseId === shift.claimedBy
                          ? `Assigned: ${activeAssignments.get(shift.id)!.nurseName}`
                          : 'Nurse assigned'}
                    </span>
                    <button
                      className="button subtle"
                      data-testid={testIds.cancel}
                      onClick={() => setCancelling(shift)}
                    >
                      Cancel shift
                    </button>
                  </>
                ) : (
                  <span className="unavailable">
                    {shift.status === 'filled' ? 'Shift covered' : 'Awaiting a nurse'}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
        {visible.length === 0 && (
          <Empty title="No shifts in this view">
            {mine
              ? 'Claim an available shift in the marketplace to build your schedule.'
              : 'Try changing your filters, or check back for new opportunities.'}
          </Empty>
        )}
        <div className="panel-footer">
          <ShieldNote />{' '}
          <span>
            Showing {visible.length} of {shifts.length} shifts
          </span>
        </div>
      </section>
      {posting && <PostShift onClose={() => setPosting(false)} />}{' '}
      {cancelling && <CancelShift shift={cancelling} onClose={() => setCancelling(null)} />}
    </>
  );
}
function ShieldNote() {
  return (
    <span>
      <Clock3 size={14} /> Facility-local times · No timezone conversion
    </span>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function PostShift({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState('');
  const post = useAction(
    (body: unknown) => api('/api/shifts', { method: 'POST', body: json(body) }),
    'Shift published to the marketplace.',
    () => {
      track('shift_published');
      onClose();
    },
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = postShiftSchema.safeParse(Object.fromEntries(form));
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError('');
    post.mutate(result.data);
  }
  return (
    <Modal
      title="Post a new shift"
      description="Give your next great team member a place to start."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <Field label="Nursing role">
          <select name="role">
            <option value="RN">Registered Nurse (RN)</option>
            <option value="LPN">Licensed Practical Nurse (LPN)</option>
          </select>
        </Field>
        <Field label="Shift date">
          <input name="date" type="date" required />
        </Field>
        <div className="form-row">
          <Field label="Start time">
            <input name="startTime" type="time" defaultValue="07:00" required />
          </Field>
          <Field label="End time">
            <input name="endTime" type="time" defaultValue="19:00" required />
          </Field>
        </div>
        <p className="form-help">
          Times are local to the facility. An earlier end time means the shift ends the next day.
        </p>
        <FormError error={error || post.error} />
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Go back
          </button>
          <Submit busy={post.isPending} testId={testIds.submitShift}>
            Publish shift <Plus size={16} />
          </Submit>
        </div>
      </form>
    </Modal>
  );
}
export function CancelShift({ shift, onClose }: { shift: ShiftDto; onClose: () => void }) {
  const { user } = useWorkspace();
  const [reason, setReason] = useState('advance');
  const cancel = useAction(
    () => api(`/api/shifts/${shift.id}/cancel`, { method: 'POST', body: json({ reason }) }),
    'Shift reopened. The cancellation is recorded.',
    () => {
      track('shift_cancelled');
      onClose();
    },
  );
  return (
    <Modal
      title="Cancel this assignment?"
      description={`${shift.role} · ${shift.agencyName} · ${displayDate(shift.date)}`}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          cancel.mutate();
        }}
      >
        <p className="form-help">
          This shift will be available for another nurse. The previous assignment will remain in the
          audit history.
        </p>
        <Field label="Cancellation reason">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="advance">Cancelled in advance</option>
            {user.role !== 'nurse' && <option value="no-show">Nurse did not show up</option>}
          </select>
        </Field>
        <FormError error={cancel.error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Keep assignment
          </button>
          <Submit busy={cancel.isPending}>Confirm cancellation</Submit>
        </div>
      </form>
    </Modal>
  );
}
