// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './auth/login';
import { Shifts } from './shifts/shifts';
import { WorkspaceProvider } from './shared/workspace';
import { nextDate, hours, displayDate } from './shared/api';
import { Credentials } from './credentials/credentials';
const nurse = { id: 'nurse-1', name: 'Maria Lopez', role: 'nurse' as const };
function wrapper(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceProvider user={nurse}>{component}</WorkspaceProvider>
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
  vi.unstubAllGlobals();
});
describe('frontend compatibility and user feedback', () => {
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
