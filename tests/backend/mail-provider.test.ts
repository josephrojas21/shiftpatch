import { afterEach, expect, it, vi } from 'vitest';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
import { mail } from '../../src/server/infrastructure/providers';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  send.mockReset();
});

it('paces sequential deliveries and preserves recipient routing and idempotency', async () => {
  vi.useFakeTimers();
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('EMAIL_FROM', 'ShiftPatch <onboarding@resend.dev>');
  vi.stubEnv('DEMO_EMAIL_TO', 'controlled@example.com');
  send.mockResolvedValue({ data: { id: 'provider-id' }, error: null });
  const first = mail.send('nurse@example.com', 'Shift claimed', 'Test body', 'outbox-1');
  await vi.advanceTimersByTimeAsync(599);
  expect(send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await first;
  expect(send).toHaveBeenCalledWith(
    {
      from: 'ShiftPatch <onboarding@resend.dev>',
      to: 'controlled@example.com',
      subject: 'Shift claimed',
      text: 'Test body',
    },
    { idempotencyKey: 'outbox-1' },
  );
  const second = mail.send('nurse@example.com', 'Shift cancelled', 'Test body', 'outbox-2');
  await vi.advanceTimersByTimeAsync(599);
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(send).toHaveBeenCalledTimes(2);
});
