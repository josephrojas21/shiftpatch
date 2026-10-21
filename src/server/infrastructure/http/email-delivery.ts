import { after } from 'next/server';
import { service } from '../../composition';

/** Delivery is best effort after commit/response; the persisted outbox remains the source of truth. */
export function scheduleEmailDelivery() {
  after(async () => {
    try {
      await service.processMail();
    } catch {
      // Cron retries persisted work; never expose provider details or roll back the user's action.
      console.error('Email processing deferred to scheduled recovery');
    }
  });
}
