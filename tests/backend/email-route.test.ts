import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '../../src/server/domain/models';
const { service, schedule } = vi.hoisted(() => ({
  service: { authenticate: vi.fn(), submitTimesheet: vi.fn() },
  schedule: vi.fn(),
}));
vi.mock('../../src/server/composition', () => ({ service }));
vi.mock('../../src/server/infrastructure/http/email-delivery', () => ({
  scheduleEmailDelivery: schedule,
}));
import { handle } from '../../src/server/infrastructure/http/handler';

beforeEach(() => {
  vi.clearAllMocks();
  service.authenticate.mockResolvedValue({ id: 'nurse-1', role: 'nurse' });
});
const request = () =>
  new NextRequest('http://localhost/api/timesheets/sheet-1/submit', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
  });
it('schedules delivery after successful timesheet submission', async () => {
  service.submitTimesheet.mockResolvedValue({ id: 'sheet-1', status: 'submitted' });
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(service.submitTimesheet).toHaveBeenCalledWith({ id: 'nurse-1', role: 'nurse' }, 'sheet-1');
  expect(schedule).toHaveBeenCalledOnce();
});
it('does not schedule email for a rejected submission', async () => {
  service.submitTimesheet.mockRejectedValue(new AppError(409, 'Assignment was cancelled'));
  expect((await handle(request())).status).toBe(409);
  expect(schedule).not.toHaveBeenCalled();
});
