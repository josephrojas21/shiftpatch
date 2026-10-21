import { beforeEach, describe, expect, it, vi } from 'vitest';
const { after, processMail } = vi.hoisted(() => ({ after: vi.fn(), processMail: vi.fn() }));
vi.mock('next/server', () => ({ after }));
vi.mock('../../src/server/composition', () => ({ service: { processMail } }));
import { scheduleEmailDelivery } from '../../src/server/infrastructure/http/email-delivery';
describe('post-response delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('schedules work rather than delaying the mutation response', async () => {
    processMail.mockResolvedValue({ processed: 2 });
    scheduleEmailDelivery();
    expect(processMail).not.toHaveBeenCalled();
    const callback = after.mock.calls[0][0];
    await callback();
    expect(processMail).toHaveBeenCalledOnce();
  });
  it('contains delivery failure so persisted outbox can recover on cron', async () => {
    processMail.mockRejectedValue(new Error('provider unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    scheduleEmailDelivery();
    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
    log.mockRestore();
  });
});
