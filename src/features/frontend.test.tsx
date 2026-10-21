// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './auth/login';
import { Shifts } from './shifts/shifts';
import { WorkspaceProvider } from './shared/workspace';
import { nextDate, hours, displayDate } from './shared/api';
import { Credentials } from './credentials/credentials';
import { Timesheets } from './timesheets/timesheets';
import type { UserDto } from '@/contracts';
const nurse = { id: 'nurse-1', name: 'Maria Lopez', role: 'nurse' as const };
const agency = { id: 'agency-a', name: 'Sunrise Health Staffing', role: 'agency' as const };
function wrapper(component: React.ReactNode, user: UserDto = nurse) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceProvider user={user}>{component}</WorkspaceProvider>
    </QueryClientProvider>,
  );
}
function response(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}
const shift = {
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('frontend compatibility and user feedback', () => {
  it('shows the active assigned nurse to the agency without changing shift fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/assignments'
          ? response({
              assignments: [
                {
                  id: 'old',
                  shiftId: shift.id,
                  nurseId: 'nurse-2',
                  nurseName: 'James Cook',
                  status: 'cancelled',
                },
                {
                  id: 'current',
                  shiftId: shift.id,
                  nurseId: nurse.id,
                  nurseName: nurse.name,
                  status: 'active',
                },
              ],
            })
          : response({ shifts: [{ ...shift, status: 'filled', claimedBy: nurse.id }] }),
      ),
    );
    wrapper(<Shifts />, agency);
    expect(await screen.findByText('Assigned: Maria Lopez')).toBeVisible();
    expect(screen.queryByText(/James Cook/)).not.toBeInTheDocument();
  });
  it('keeps posting errors inside the open dialog', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string, init?: RequestInit) => {
        if (init?.method === 'POST')
          return response({ error: 'Service temporarily unavailable' }, 503);
        return path === '/api/assignments'
          ? response({ assignments: [] })
          : response({ shifts: [] });
      }),
    );
    wrapper(<Shifts />, agency);
    fireEvent.click(await screen.findByTestId('agency-post-shift-button'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Shift date'), {
      target: { value: '2026-10-22' },
    });
    fireEvent.click(within(dialog).getByTestId('agency-post-shift-submit-button'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Service temporarily unavailable',
    );
    expect(dialog).toHaveAttribute('open');
  });
  it('explains cancelled timesheets and removes impossible edit and submit actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/assignments'
          ? response({ assignments: [{ id: 'assignment-1', status: 'cancelled' }] })
          : response({
              timesheets: [
                {
                  id: 'sheet-1',
                  assignmentId: 'assignment-1',
                  agencyName: agency.name,
                  shiftId: shift.id,
                  startTime: '2026-10-02T19:00',
                  endTime: '2026-10-03T07:00',
                  totalMinutes: 720,
                  breakMinutes: 0,
                  status: 'draft',
                  reviewReason: null,
                },
              ],
            }),
      ),
    );
    wrapper(<Timesheets />);
    expect(await screen.findByText('Assignment cancelled')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record hours' })).toBeDisabled();
  });
  it('fills demo credentials without signing in automatically', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    wrapper(<Login />);
    fireEvent.click(screen.getByRole('button', { name: /Maria Lopez/ }));
    expect(screen.getByTestId('login-email-input')).toHaveValue('maria.lopez@example.com');
    expect(screen.getByTestId('login-password-input')).toHaveValue('Trial2026!');
    expect(screen.getByTestId('login-submit-button')).toHaveTextContent('Sign in');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('shows the exact server error when login fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ error: 'Invalid email or password' }, 401)),
    );
    wrapper(<Login />);
    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: 'someone@example.com' },
    });
    fireEvent.change(screen.getByTestId('login-password-input'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('login-submit-button'));
    expect(await screen.findByTestId('notification-banner')).toHaveTextContent(
      'Invalid email or password',
    );
  });
  it('does not show optimistic claim success, and preserves the server failure', async () => {
    let resolveClaim: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveClaim = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => (path.includes('/claim') ? pending : response({ shifts: [shift] }))),
    );
    wrapper(<Shifts />);
    expect(await screen.findByTestId('shift-list-item')).toHaveTextContent(
      'Sunrise Health Staffing',
    );
    fireEvent.click(screen.getByTestId('shift-claim-button'));
    await waitFor(() => expect(screen.getByTestId('shift-claim-button')).toBeDisabled());
    expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument();
    resolveClaim(
      new Response(JSON.stringify({ error: 'Credential expired, cannot claim shift' }), {
        status: 403,
      }),
    );
    expect(await screen.findByTestId('notification-banner')).toHaveTextContent(
      'Credential expired, cannot claim shift',
    );
    expect(screen.getByTestId('shift-list-item')).toHaveTextContent('Open');
  });
  it('filters marketplace results and explains empty views', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ shifts: [shift] })),
    );
    wrapper(<Shifts />);
    await screen.findByTestId('shift-list-item');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), {
      target: { value: 'LPN' },
    });
    expect(screen.queryByTestId('shift-list-item')).not.toBeInTheDocument();
    expect(screen.getByText('No shifts in this view')).toBeVisible();
  });
  it('uses the mandated credential inputs and explains approval', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ credentials: [] })),
    );
    wrapper(<Credentials />);
    expect(screen.getByTestId('credential-upload-input')).toHaveAttribute('type', 'file');
    expect(screen.getByTestId('credential-expiry-date-input')).toHaveAttribute('type', 'date');
    expect(screen.getByText(/Uploads require approval/)).toBeVisible();
    expect(await screen.findByText('Your credentials belong here')).toBeVisible();
  });
  it('preserves facility dates and handles overnight calendar boundaries', () => {
    expect(displayDate('2026-10-02')).toBe('Oct 2, 2026');
    expect(nextDate('2026-12-31')).toBe('2027-01-01');
    expect(hours(675)).toBe('11h 15m');
  });
});
