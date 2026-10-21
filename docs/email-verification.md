# Email verification

Verified on 2026-10-21 against https://shiftpatch-iota.vercel.app/.

- Resend credentials were configured through Vercel production environment variables. No API key is stored in this document or Git.
- Demo email uses `onboarding@resend.dev` and routes notifications to the controlled account inbox through `DEMO_EMAIL_TO`. This is a demo configuration, not verified sending to arbitrary recipients.
- Initial processing accepted 12 messages and failed 12. The adapter was updated to pace serialized attempts by 600 ms and log provider error codes without recipient details or message contents. The original failures did not preserve provider codes, so their exact cause was not established.
- Production deployment `dpl_7NPfUQvfPURCuCzbf6Ppr1vGUgYm` contains commit `63b0c2f` with this change.
- Retried through the existing synthetic shift `5372c8ec-428b-4ce7-bde3-519c11b7385a`, leaving it open after cancellation. Original seed shifts were not modified.
- Final outbox snapshot: 28 sent, zero pending, zero failed. `sent` means Resend accepted the request; it is not an inbox-delivery webhook status.
- The user separately confirmed receiving a ShiftPatch message in the controlled inbox.
- Validation: lint, types, 33 unit/component/database tests, production build and all 8 local browser E2E tests passed.

The outbox remains durable with provider idempotency keys and retries. Daily cron provides recovery; successful staffing mutations also trigger processing after the response. A verified custom domain is required to send beyond the Resend account's own inbox when moving out of demo mode.
