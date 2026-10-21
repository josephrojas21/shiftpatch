'use client';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock3, Pencil, Plus, Send, X } from 'lucide-react';
import { Badge, Empty, ErrorState, Field, Modal, Spinner, Submit } from '@/components/ui';
import { testIds, type AssignmentDto, type TimesheetDto } from '@/contracts';
import { api, displayDate, hours, json, nextDate } from '../shared/api';
import { track } from '../shared/analytics';
import { useAction, useWorkspace } from '../shared/workspace';
export function Timesheets() {
  const { user } = useWorkspace();
  const [editing, setEditing] = useState<TimesheetDto | 'new' | null>(null);
  const [rejecting, setRejecting] = useState<TimesheetDto | null>(null);
  const sheets = useQuery({
    queryKey: ['timesheets', user.id],
    queryFn: () => api<{ timesheets: TimesheetDto[] }>('/api/timesheets'),
    refetchInterval: 10000,
  });
  const assignments = useQuery({
    queryKey: ['assignments', user.id],
    queryFn: () => api<{ assignments: AssignmentDto[] }>('/api/assignments'),
    enabled: user.role === 'nurse',
    refetchInterval: 10000,
  });
  const submit = useAction(
    (id: string) => api(`/api/timesheets/${id}/submit`, { method: 'POST' }),
    'Timesheet submitted for review.',
    () => track('timesheet_submitted'),
  );
  const approve = useAction(
    (id: string) =>
      api(`/api/timesheets/${id}/review`, { method: 'POST', body: json({ status: 'approved' }) }),
    'Timesheet approved. Hours are now locked.',
  );
  const available = (assignments.data?.assignments ?? []).filter(
    (assignment) =>
      assignment.status === 'active' &&
      !sheets.data?.timesheets.some((sheet) => sheet.assignmentId === assignment.id),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">EVERY HOUR COUNTS</span>
          <h1>
            Timesheets<span className="heading-dot">.</span>
          </h1>
          <p>
            {user.role === 'nurse'
              ? 'Record the care you delivered. Track every approval.'
              : 'Review actual hours and keep your staffing records accurate.'}
          </p>
        </div>
        {user.role === 'nurse' && (
          <button
            className="button primary"
            disabled={!available.length}
            onClick={() => setEditing('new')}
          >
            <Plus size={18} />
            Record hours
          </button>
        )}
      </div>
      <div className="info-strip">
        <Clock3 size={19} />
        <span>
          Record actual hours worked in facility-local time. Approved timesheets are locked.
        </span>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>{user.role === 'nurse' ? 'Your recorded hours' : 'Hours for review'}</h2>
            <p>{sheets.data?.timesheets.length ?? 0} timesheets in this workspace</p>
          </div>
        </div>
        {sheets.isPending ? (
          <Spinner />
        ) : sheets.error ? (
          <ErrorState error={sheets.error} retry={() => void sheets.refetch()} />
        ) : (
          <>
            <div className="table-scroll">
              <table data-testid={testIds.timesheet}>
                <thead>
                  <tr>
                    <th>{user.role === 'nurse' ? 'Agency' : 'Nurse / Agency'}</th>
                    <th>Worked</th>
                    <th>Hours</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.data.timesheets.map((sheet) => (
                    <tr key={sheet.id}>
                      <td>
                        <strong>
                          {user.role === 'nurse' ? sheet.agencyName : sheet.nurseName}
                        </strong>
                        <small>{user.role === 'nurse' ? sheet.shiftId : sheet.agencyName}</small>
                      </td>
                      <td>
                        {displayDate(sheet.startTime.slice(0, 10))}
                        <small>
                          {sheet.startTime.slice(11, 16)} – {sheet.endTime.slice(11, 16)}
                          {sheet.endTime.slice(0, 10) !== sheet.startTime.slice(0, 10)
                            ? ' (+1 day)'
                            : ''}
                        </small>
                      </td>
                      <td>
                        <strong>{hours(sheet.totalMinutes)}</strong>
                        <small>{sheet.breakMinutes} min break</small>
                      </td>
                      <td>
                        <Badge status={sheet.status} />
                        {sheet.reviewReason && (
                          <small className="review-reason">{sheet.reviewReason}</small>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {user.role === 'nurse' &&
                            ['draft', 'rejected'].includes(sheet.status) && (
                              <>
                                <button
                                  className="button compact secondary"
                                  onClick={() => setEditing(sheet)}
                                >
                                  <Pencil size={14} />
                                  Edit
                                </button>
                                <button
                                  className="button compact primary"
                                  disabled={submit.isPending}
                                  onClick={() => submit.mutate(sheet.id)}
                                >
                                  <Send size={14} />
                                  Submit
                                </button>
                              </>
                            )}
                          {user.role !== 'nurse' && sheet.status === 'submitted' && (
                            <>
                              <button
                                className="button compact primary"
                                disabled={approve.isPending}
                                onClick={() => approve.mutate(sheet.id)}
                              >
                                <Check size={14} />
                                Approve
                              </button>
                              <button
                                className="button compact secondary"
                                onClick={() => setRejecting(sheet)}
                              >
                                <X size={14} />
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheets.data.timesheets.length === 0 && (
              <Empty title="A fresh timesheet">
                {user.role === 'nurse'
                  ? 'Record hours for a confirmed assignment to get started.'
                  : 'Submitted timesheets will appear here for your review.'}
              </Empty>
            )}
          </>
        )}
        {assignments.error && (
          <ErrorState error={assignments.error} retry={() => void assignments.refetch()} />
        )}
      </section>
      {editing && (
        <EditTimesheet
          sheet={editing === 'new' ? undefined : editing}
          assignments={assignments.data?.assignments ?? []}
          available={available}
          onClose={() => setEditing(null)}
        />
      )}{' '}
      {rejecting && <RejectTimesheet sheet={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}
function EditTimesheet({
  sheet,
  assignments,
  available,
  onClose,
}: {
  sheet?: TimesheetDto;
  assignments: AssignmentDto[];
  available: AssignmentDto[];
  onClose: () => void;
}) {
  const [assignmentId, setAssignmentId] = useState(sheet?.assignmentId ?? available[0]?.id ?? '');
  const assignment = assignments.find((item) => item.id === assignmentId);
  const [localError, setLocalError] = useState('');
  const save = useAction(
    (body: unknown) =>
      api(sheet ? `/api/timesheets/${sheet.id}` : '/api/timesheets', {
        method: sheet ? 'PATCH' : 'POST',
        body: json(body),
      }),
    'Timesheet draft saved.',
    onClose,
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startTime = String(form.get('startTime'));
    const endTime = String(form.get('endTime'));
    const breakMinutes = Number(form.get('breakMinutes'));
    const duration = (Date.parse(`${endTime}:00Z`) - Date.parse(`${startTime}:00Z`)) / 60000;
    if (duration <= 0 || breakMinutes >= duration) {
      setLocalError('End must be after start, and break must be shorter than the shift.');
      return;
    }
    setLocalError('');
    save.mutate({ assignmentId, startTime, endTime, breakMinutes });
  }
  return (
    <Modal
      title={sheet ? 'Edit recorded hours' : 'Record your hours'}
      description="Use your actual start and end times, including the end date for overnight shifts."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label="Assignment">
          <select
            value={assignmentId}
            disabled={!!sheet}
            onChange={(event) => setAssignmentId(event.target.value)}
            required
          >
            {(sheet ? assignments.filter((a) => a.id === sheet.assignmentId) : available).map(
              (item) => (
                <option key={item.id} value={item.id}>
                  {item.agencyName} · {item.date} · {item.role}
                </option>
              ),
            )}
          </select>
        </Field>
        <div className="form-stack" key={assignmentId}>
          <Field label="Actual start">
            <input
              type="datetime-local"
              name="startTime"
              defaultValue={
                sheet?.startTime.slice(0, 16) ??
                (assignment ? `${assignment.date}T${assignment.startTime}` : '')
              }
              required
            />
          </Field>
          <Field label="Actual end">
            <input
              type="datetime-local"
              name="endTime"
              defaultValue={
                sheet?.endTime.slice(0, 16) ??
                (assignment
                  ? `${assignment.endTime <= assignment.startTime ? nextDate(assignment.date) : assignment.date}T${assignment.endTime}`
                  : '')
              }
              required
            />
          </Field>
          <Field label="Unpaid break (minutes)">
            <input
              type="number"
              name="breakMinutes"
              min="0"
              max="1440"
              step="1"
              defaultValue={sheet?.breakMinutes ?? 0}
              required
            />
          </Field>
        </div>
        {localError && (
          <p className="inline-error" role="alert">
            {localError}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <Submit busy={save.isPending}>Save draft</Submit>
        </div>
      </form>
    </Modal>
  );
}
function RejectTimesheet({ sheet, onClose }: { sheet: TimesheetDto; onClose: () => void }) {
  const reject = useAction(
    (reason: string) =>
      api(`/api/timesheets/${sheet.id}/review`, {
        method: 'POST',
        body: json({ status: 'rejected', reason }),
      }),
    'Timesheet returned for correction.',
    onClose,
  );
  return (
    <Modal
      title="Return for correction"
      description={`Let ${sheet.nurseName} know what needs to change.`}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          reject.mutate(String(new FormData(event.currentTarget).get('reason')));
        }}
      >
        <Field label="Reason">
          <textarea name="reason" required minLength={1} maxLength={500} rows={4} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Go back
          </button>
          <Submit busy={reject.isPending}>Return timesheet</Submit>
        </div>
      </form>
    </Modal>
  );
}
