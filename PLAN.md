# ShiftPatch implementation plan

Approved before implementation: full functional scope, Next.js React, hexagonal TypeScript backend, Neon PostgreSQL, private Blob, email and analytics. Brand ShiftPatch; English UI. No production medical data.

## Architecture and ownership

One deployable Next.js application. Route handlers are thin HTTP adapters; domain is framework independent; application coordinates ports; infrastructure implements PostgreSQL, tokens, documents and email. Coordinator owns contracts/config/CI; frontend agent owns UI; backend agent owns server/API/migrations. Explicit dependency injection, repositories, transactional unit of work and outbox. ESLint enforces boundaries. No event bus needed.

## Sequence and acceptance

1. Shared DTOs and exact specification, repo conventions, CI and env template.
2. Parallel backend and frontend implementation; stable contract docs before either integrates.
3. Real PostgreSQL migration/seed, first build and early deployment.
4. Claims/cancellation concurrency, credentials/review/export, real submitted/approved timesheets, audit/reporting, email outbox, PostHog.
5. Independent HTTP compatibility tests, component tests, real database integration and browser E2E; mobile/accessibility inspection; final deployment.
6. README, agent setup, founder video script, unedited transcript handoff instructions.

## Non-negotiable behavior

- Six specified routes, error messages, seed IDs and 15 test IDs exact. Independent test fixtures must not import production schemas.
- All shift responses have all nine fields. Keep fixed past dates visible/actionable. Times facility-local; overnight ends next day; equal times invalid.
- Claims atomic, credential expiry enforced. No unsupported RN/LPN matching rules.
- Cancellation reopens, preserves assignment history. Nurse advance only own assignment; agency own/admin both reasons.
- Credentials uploaded pending admin review. Initial licence metadata approved with required expiry, no fabricated file. PDF/PNG/JPEG private, bounded, validated, access audited. TB not an additional seed claim requirement.
- Timesheets represent actual work, not scheduled hours; draft/submitted/approved/rejected workflow.
- State, audit and email outbox commit together. Provider failure does not revert operation. Notifications report actual provider status; demo addresses route only to explicit controlled inbox.
- PostgreSQL always for runtime. Seed idempotent and never reset on boot. Tests use isolated database.
- HTTP cookie session plus required Bearer API; same-origin mutation guard; no token in localStorage; login rate limiting persistent.
- Report current open/filled separately from historical cancellations. No sensitive data in PostHog; no autocapture/replay.

## Adopted improvements from alternate review

ESLint dependency boundaries, contract-first parallel work, independent literal compatibility fixtures, repeatable verification commands, early deployment. Rejected memory-only production, reset-on-restart, optional persistence and derived-only timesheets. Express is valid but Next chosen for same-origin Vercel deployment; hexagonal architecture is framework-independent.

## Delivery limits

External email and analytics delivery require configured provider credentials; never claim verified when not configured. No prospect scraping or outbound outreach. Human records Loom and sends recruiter packet. Demo only synthetic data; clinical-production rollout requires separate controls review. ESCALATION.md only for a real issue requiring a product escalation, not automatically.
