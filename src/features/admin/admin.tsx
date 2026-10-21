'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Mail,
  UsersRound,
} from 'lucide-react';
import { Badge, Empty, ErrorState, Field, Spinner } from '@/components/ui';
import {
  testIds,
  type AuditDto,
  type NotificationDto,
  type ReportDto,
  type ShiftDto,
} from '@/contracts';
import { api, displayDate, hours } from '../shared/api';
import { CancelShift, Stat } from '../shifts/shifts';
export function Overview() {
  const [agencyId, setAgencyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cancelling, setCancelling] = useState<ShiftDto | null>(null);
  const params = new URLSearchParams();
  if (agencyId) params.set('agencyId', agencyId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const filter = params.toString();
  const query = useQuery({
    queryKey: ['report', filter],
    queryFn: () => api<ReportDto>(`/api/admin/report?${filter}`),
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">THE WHOLE PICTURE</span>
          <h1>
            Care coverage<span className="heading-dot">.</span>
          </h1>
          <p>A clear view of your agencies, their shifts, and the people behind them.</p>
        </div>
        <a className="button secondary" download href={`/api/admin/report/export?${filter}`}>
          <Download size={17} />
          Export CSV
        </a>
      </div>
      <div className="report-filters">
        <Field label="Agency">
          <select value={agencyId} onChange={(event) => setAgencyId(event.target.value)}>
            <option value="">All agencies</option>
            <option value="agency-a">Sunrise Health Staffing</option>
            <option value="agency-b">Metro Care Partners</option>
          </select>
        </Field>
        <Field label="From date">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To date">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
        {filter && (
          <button
            className="text-button"
            onClick={() => {
              setAgencyId('');
              setFrom('');
              setTo('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="stats-grid admin-stats">
            <Stat
              label="Open shifts"
              value={query.data.open}
              detail="Opportunities to connect"
              icon={<CalendarDays size={20} />}
            />
            <Stat
              label="Coverage rate"
              value={`${Math.round(query.data.coverageRate)}%`}
              detail={`${query.data.filled} shifts filled`}
              icon={<UsersRound size={20} />}
            />
            <Stat
              label="Approved hours"
              value={hours(query.data.approvedMinutes)}
              detail="Actual hours delivered"
              icon={<Clock3 size={20} />}
            />
            <Stat
              label="Cancellations"
              value={query.data.cancellations}
              detail={`${query.data.noShows} recorded no-shows`}
              icon={<Activity size={20} />}
            />
          </div>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Shift coverage</h2>
                <p>Agency activity, refreshed every 10 seconds</p>
              </div>
              <span className="live-label">
                <span className="live-dot" />
                Live workspace
              </span>
            </div>
            <div className="table-scroll">
              <table data-testid={testIds.adminTable}>
                <thead>
                  <tr>
                    <th>Agency / Role</th>
                    <th>Date</th>
                    <th>Shift hours</th>
                    <th>Status</th>
                    <th>Assigned nurse</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.shifts.map((shift) => (
                    <tr key={shift.id}>
                      <td>
                        <strong>{shift.agencyName}</strong>
                        <small>
                          {shift.role} · {shift.id}
                        </small>
                      </td>
                      <td>{displayDate(shift.date)}</td>
                      <td>
                        {shift.startTime} – {shift.endTime}
                        {shift.endTime <= shift.startTime && <small>Ends next day</small>}
                      </td>
                      <td>
                        <span data-testid={testIds.status}>
                          <Badge status={shift.status} />
                        </span>
                      </td>
                      <td>
                        {shift.claimedBy === 'nurse-1'
                          ? 'Maria Lopez'
                          : shift.claimedBy === 'nurse-2'
                            ? 'James Cook'
                            : (shift.claimedBy ?? 'Unassigned')}
                      </td>
                      <td>
                        {shift.status === 'filled' && (
                          <button
                            className="button compact secondary"
                            data-testid={testIds.cancel}
                            onClick={() => setCancelling(shift)}
                          >
                            Cancel shift
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {query.data.shifts.length === 0 && (
              <Empty title="No shifts for these filters">
                Choose another agency or date range.
              </Empty>
            )}
          </section>
        </>
      )}
      {cancelling && <CancelShift shift={cancelling} onClose={() => setCancelling(null)} />}
    </>
  );
}
export function Audit() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['audit', page],
    queryFn: () => api<{ events: AuditDto[]; total: number }>(`/api/admin/audit?page=${page}`),
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">ACCOUNTABILITY, BUILT IN</span>
          <h1>
            Audit trail<span className="heading-dot">.</span>
          </h1>
          <p>A durable record of the changes that keep your workspace moving.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Workspace activity</h2>
            <p>{query.data?.total ?? 0} recorded events</p>
          </div>
        </div>
        {query.isPending ? (
          <Spinner />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            <div className="table-scroll">
              <table data-testid={testIds.audit}>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Performed by</th>
                    <th>Record</th>
                    <th>Timestamp (UTC)</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong>{event.action.replaceAll('_', ' ').replaceAll('.', ' / ')}</strong>
                      </td>
                      <td>
                        {event.actorName}
                        <small>{event.actorId}</small>
                      </td>
                      <td className="mono">{event.targetId}</td>
                      <td>{event.createdAt.replace('T', ' ').slice(0, 19)}</td>
                      <td>
                        <details>
                          <summary>View details</summary>
                          <pre className="audit-details">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {query.data.events.length === 0 && (
              <Empty title="All quiet for now">New workspace actions will appear here.</Empty>
            )}
            <div className="panel-footer">
              <span>Page {page}</span>
              <div className="row-actions">
                <button
                  className="button compact secondary"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <button
                  className="button compact secondary"
                  disabled={query.data.events.length === 0 || page * 50 >= query.data.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
export function Notifications() {
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ notifications: NotificationDto[] }>('/api/admin/notifications'),
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">KEEP EVERYONE IN THE LOOP</span>
          <h1>
            Notifications<span className="heading-dot">.</span>
          </h1>
          <p>Delivery status for assignment, cancellation and timesheet emails.</p>
        </div>
      </div>
      <div className="info-strip">
        <Mail size={19} />
        <span>
          Emails are queued with each action. Delivery failures never undo a confirmed shift.
        </span>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Email delivery</h2>
          <span className="live-label">
            <span className="live-dot" />
            Updates every 10s
          </span>
        </div>
        {query.isPending ? (
          <Spinner />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Notification</th>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Queued at (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.notifications.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.type.replaceAll('_', ' ').replaceAll('.', ' / ')}</strong>
                        {item.lastError && (
                          <small className="review-reason">{item.lastError}</small>
                        )}
                      </td>
                      <td>{item.recipient}</td>
                      <td>
                        <Badge status={item.status} />
                      </td>
                      <td>{item.attempts}</td>
                      <td>{item.createdAt.replace('T', ' ').slice(0, 19)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {query.data.notifications.length === 0 && (
              <Empty title="No emails queued yet">
                Workspace actions will create notifications here.
              </Empty>
            )}
          </>
        )}
      </section>
    </>
  );
}
