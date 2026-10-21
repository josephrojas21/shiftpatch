# ShiftPatch

Healthcare shift coordination for nurses, staffing agencies and operations administrators. TypeScript/Next.js application with a hexagonal backend and PostgreSQL persistence. This trial deployment uses synthetic records only.

## Run locally

Requirements: Node 22+, npm, PostgreSQL 17 (Docker recommended).

```sh
npm ci
cp .env.example .env.local
# Set DATABASE_URL, DATABASE_URL_UNPOOLED and a random AUTH_SECRET (32+ chars).
npm run db:migrate
npm run db:seed
npm run dev
```

Use a dedicated local database. The seed inserts missing records and never overwrites existing data. Do not reset the public demo to run tests. Database migrations use the unpooled connection; application traffic uses the pooled URL on Neon.

All demo passwords are `Trial2026!`:

| Role                   | Email                       |
| ---------------------- | --------------------------- |
| Nurse, valid licence   | maria.lopez@example.com     |
| Nurse, expired licence | james.cook@example.com      |
| Sunrise agency         | admin@sunrisehealth.example |
| Metro agency           | admin@metrocare.example     |
| Administrator          | alex.kim@example.com        |

## Architecture

`src/server/domain` contains pure rules. `application` coordinates use cases and dependency ports. `infrastructure` implements PostgreSQL, private files, JWT and email. `composition` wires them. Next.js HTTP adapters expose the exact trial contract. The frontend is feature-organized and depends on public contracts, never database modules.

`npm run lint` checks both ESLint rules and resolved import boundaries. The latter catches relative imports as well as aliases. Claims acquire transactional locks; assignments, audit and outbox are committed together. PostgreSQL constraints reinforce state consistency. In-memory repositories are not used as a runtime persistence fallback.

See [approved plan](PLAN.md), [exact supplied specification](docs/technical-spec.md) and [additional API contracts](docs/api-additions.md).

## Product decisions

- Facility-local date/time strings are not timezone converted. Overnight shifts end the following day. Fixed historical seed dates remain visible and actionable.
- Nurses may cancel their own assignments in advance. Owning agencies and administrators may also report no-shows. Cancellation reopens the shift while preserving its assignment history.
- A current, approved licence is required to claim. Uploaded documents await administrator review; TB is not an extra eligibility rule absent from the provided seed.
- Initial licences contain verified demo metadata but no fabricated document. ZIP manifests explicitly identify missing documents.
- Timesheets record actual hours with unpaid breaks. They are submitted, approved or returned with a reason; approved records are locked.
- Dashboard refreshes every 10 seconds while active, on focus and following mutations. This is polling, not instantaneous push.
- Private documents are accessed through authenticated endpoints. Administrator exports are audit logged. Do not upload real clinical data to this trial.
- Public registries are business context; no scraping or outreach is implemented.

## Optional external configuration

The code supports these integrations, but absence of credentials is not a successful delivery:

- `BLOB_READ_WRITE_TOKEN`: private Vercel Blob storage for uploads/downloads. Never use a public store for credentials.
- `RESEND_API_KEY`, `EMAIL_FROM`, `DEMO_EMAIL_TO`: verified sender and controlled demo inbox. Seed email addresses are unchanged; they are not real recipients. Email failures do not roll back staffing actions.
- `CRON_SECRET`: protects `/api/jobs/email`. The outbox retains pending work without consuming retry attempts when the provider is unconfigured. Configure a scheduler appropriate to the hosting plan.
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`: explicit product events only; autocapture and session replay disabled. No names, email addresses or document contents.

For Vercel, link the intended project, configure environments, then pull into a separate ignored file if local database settings should be preserved. Never commit `.env*` secrets, `.vercel`, authentication traces or database dumps.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database for integration tests. They use an isolated schema, and drop only that test schema. Unit tests alone do not prove PostgreSQL concurrency.

The E2E runner creates a fresh random schema in TEST_DATABASE_URL, migrates and seeds it, starts the production build on port 3000, and removes only that schema afterward. It refuses remote BASE_URL targets and existing servers. E2E tests never reset the public evaluation data. The API contract suite contains literal expectations independent of production DTOs. Browser tests cover the three roles, expired credentials, cancellation, timesheet approval, report/export controls and mobile navigation.

CI runs migrations, seed, lint/boundaries, types, unit/database tests, build, Playwright and production dependency audit against a PostgreSQL service. Passing CI must be verified on the actual remote run.

## Agent workflow and handoff

[AGENTS.md](AGENTS.md) is the actual working agreement. Frontend and backend agents work in separate directories after contracts are agreed. Coordinator integrates, checks independent tests and owns deployment. Changes to shared contracts require coordination.

The founder video outline is in [docs/founder-demo.md](docs/founder-demo.md). Export all original AI sessions, including delegated work, without edits using the tool used for those sessions; a generated summary is not a substitute. Keep transcripts out of a public repository if they contain private operational context. The candidate records the Loom and sends the recruiter packet.

The included Vercel Hobby-compatible recovery cron runs daily at 12:00 UTC. When email is configured, successful staffing actions also trigger best-effort processing after the response. Pending deliveries remain durable; on higher-frequency hosting plans the recovery schedule can be shortened. Provider verification is deliberately pending until credentials and a controlled inbox are configured.

Migrations are explicit ordered SQL files in `drizzle/`; the migration runner tracks each filename and serializes execution with a PostgreSQL advisory lock. Schema changes must update both the Drizzle column definitions and a new SQL migration. Do not run schema push or generate a second baseline against the evaluation database.
