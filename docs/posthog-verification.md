# PostHog production verification

Verified on 2026-10-21 against https://shiftpatch-iota.vercel.app/.

- Production variables `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` were configured in Vercel, followed by a fresh production build.
- Deployment: `dpl_4kUhohVgaHK9G64697jWgCYCqw6c`, application commit `8dc2157`.
- Region: US. The browser loaded the project's SDK configuration successfully.
- A dedicated synthetic shift was created for verification: `5372c8ec-428b-4ce7-bde3-519c11b7385a`, 2026-11-20, 09:15–17:15, Sunrise. Original seed shifts were not modified. The test shift remains open after cancellation.
- Claim and cancellation actions each produced a POST to `https://us.i.posthog.com/i/v0/e/` with HTTP 200. No browser JavaScript errors occurred. Payloads were compressed and not decoded by the verification script; event names and dashboard visibility still need confirmation in the PostHog UI.
- The PostHog SDK filters automated browsers using user-agent information and `navigator.webdriver`. Initial automated attempts were filtered; the successful check emulated a normal Chrome browser without changing production settings.

## Dashboard check

Open the ShiftPatch project in PostHog and inspect recent events for `shift_claimed` and `shift_cancelled`. Other instrumented events are `shift_published`, `credential_uploaded`, and `timesheet_submitted`; this check does not establish delivery of every event type.

Autocapture, pageview/pageleave capture, and session recording remain disabled in the application. No personal profiles are created. Project configuration values are managed in Vercel, not committed to Git.
