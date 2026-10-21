# ShiftPatch

A demo for agencies to publish nursing shifts, nurses to claim them, and administrators to review coverage, credentials and hours.

[Live application](https://shiftpatch-iota.vercel.app/) · [Founder demo](https://www.loom.com/share/04e090279fe34931a74d666fe1d46173)

## Start locally from scratch

You need **Node.js 22.13 or newer**, **npm**, **Git**, and **Docker** running. The steps below use a local PostgreSQL database; no Vercel, Neon, Resend or PostHog account is needed to start the core application.

### 1. Download and install

```sh
git clone https://github.com/josephrojas21/shiftpatch.git
cd shiftpatch
npm ci
```

### 2. Start PostgreSQL

```sh
docker run --name shiftpatch-db \
  -e POSTGRES_USER=shiftpatch \
  -e POSTGRES_PASSWORD=local-demo-only \
  -e POSTGRES_DB=shiftpatch_dev \
  -p 127.0.0.1:55433:5432 \
  -v shiftpatch-local-data:/var/lib/postgresql/data \
  -d postgres:17-alpine
```

Wait until this command says **accepting connections**:

```sh
docker exec shiftpatch-db pg_isready -U shiftpatch -d shiftpatch_dev
```

The password above is only for this local demo database. The Docker volume preserves your data between restarts. On subsequent runs, use `docker start shiftpatch-db` instead of creating it again.

### 3. Configure local variables

```sh
cp .env.example .env.local
```

Open `.env.local` and set these values:

```dotenv
DATABASE_URL=postgresql://shiftpatch:local-demo-only@127.0.0.1:55433/shiftpatch_dev
DATABASE_URL_UNPOOLED=postgresql://shiftpatch:local-demo-only@127.0.0.1:55433/shiftpatch_dev
AUTH_SECRET=replace-with-a-random-value-generated-below
```

Generate a signing secret, then paste the output as the `AUTH_SECRET` value:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Leave the other variables blank for now. `.env.local` is ignored by Git; never commit it. If it already exists, preserve your existing configuration rather than overwriting it.

### 4. Create tables and demo records

```sh
npm run db:migrate
npm run db:seed
```

These commands use your local database. The seed inserts missing records without resetting existing records.

### 5. Start the application

```sh
npm run dev
```

Open **http://localhost:3000** and sign in with an account below. Stop the application with `Ctrl+C`. For later sessions, start Docker and run `npm run dev`; migrations and seed do not need to be repeated unless they change.

### 6. Sign in and try a workflow

All demo accounts use **`Trial2026!`**. These credentials are intentionally public fixtures, not credentials for the developer's GitHub, Vercel or other accounts.

| Role                          | Email                       |
| ----------------------------- | --------------------------- |
| Nurse with a valid licence    | maria.lopez@example.com     |
| Nurse with an expired licence | james.cook@example.com      |
| Sunrise agency                | admin@sunrisehealth.example |
| Metro agency                  | admin@metrocare.example     |
| Administrator                 | alex.kim@example.com        |

Try **Sunrise publishes a shift → Maria claims it → Maria submits worked hours → Sunrise approves → Alex checks the report**. Sign out before switching roles, or use separate browser profiles.

Without external service credentials, shifts, roles, timesheets, reports and audit work locally. Document upload/download needs private Blob storage, emails remain queued, and analytics is disabled. The optional configuration below explains how to enable them. Use synthetic data only.

## Run the tests

Create a separate test database once:

```sh
docker exec shiftpatch-db createdb -U shiftpatch shiftpatch_test
```

Add this line to `.env.local`:

```dotenv
TEST_DATABASE_URL=postgresql://shiftpatch:local-demo-only@127.0.0.1:55433/shiftpatch_test
```

Then run:

```sh
npx playwright install chromium
npm run verify
npm run test:e2e
```

`verify` runs lint, types, unit/database tests and the production build. The E2E command needs that build and starts its own server. On Linux, use `npx playwright install --with-deps chromium` if system browser dependencies are missing.

Tests create and remove isolated schemas in the test database. The default E2E run disables real email and blocks external browser traffic. Two real document tests require explicit Blob opt-in and are otherwise skipped. See the verification section below.

## What was built

- Three roles with authentication and server-side permissions.
- Shift publication, atomic claiming, cancellation and no-show handling.
- Credential uploads with expiry and administrator approval.
- Actual worked hours with rejection, correction and approval.
- Coverage reports, CSV export, audit history and private document ZIPs.
- Durable email notifications through Resend and explicit PostHog events.
- Responsive React interface, PostgreSQL persistence and deployment on Vercel.

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

The E2E runner creates a fresh random schema in TEST_DATABASE_URL, migrates and seeds it, starts the production build on an available local port, and removes only that schema afterward. It refuses remote BASE_URL targets and existing servers. E2E tests never reset the public evaluation data. The API contract suite contains literal expectations independent of production DTOs. Browser tests cover the three roles, expired credentials, cancellation, timesheet approval, report/export controls and mobile navigation.

CI runs migrations, seed, lint/boundaries, types, unit/database tests, build, Playwright and production dependency audit against a PostgreSQL service. Passing CI must be verified on the actual remote run.

The E2E runner disables Resend credentials and blocks external browser requests, including PostHog calls embedded in a prior build. Real private document tests are opt-in: run `E2E_REAL_BLOB=1 npm run test:e2e` with a private Blob test token. Those tests upload synthetic files and delete their objects afterward. Without opt-in, document-provider tests are explicitly skipped.

Development dependency audit: Vitest was upgraded to remove the critical/moderate test-runner advisories, and unused form libraries and Drizzle Kit were removed. Migrations continue through the explicit SQL runner. Five high-severity dependency entries remain in the single `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` chain. As of 2026-10-21, the registry's latest `braces` is still 3.0.3, affected by GHSA-vfj7-8cjw-p6xm (nested-pattern stack exhaustion). These are development lint dependencies; the production audit is clean. Do not apply `npm audit fix --force`: its proposed Next ESLint downgrade is not a compatible remediation. Recheck upstream releases before final delivery.

## Agent workflow and handoff

[AGENTS.md](AGENTS.md) is the actual working agreement. Frontend and backend agents work in separate directories after contracts are agreed. Coordinator integrates, checks independent tests and owns deployment. Changes to shared contracts require coordination.

The founder video outline is in [docs/founder-demo.md](docs/founder-demo.md). Export all original AI sessions, including delegated work, without edits using the tool used for those sessions; a generated summary is not a substitute. Keep transcripts out of a public repository if they contain private operational context. The candidate records the Loom and sends the recruiter packet.

The included Vercel Hobby-compatible recovery cron runs daily at 12:00 UTC. When email is configured, successful staffing actions also trigger best-effort processing after the response. Pending deliveries remain durable; on higher-frequency hosting plans the recovery schedule can be shortened. Email delivery to the controlled inbox and PostHog ingestion were verified; see [email evidence](docs/email-verification.md) and [analytics evidence](docs/posthog-verification.md). External services still require your own credentials in a fresh installation.

Migrations are explicit ordered SQL files in `drizzle/`; the migration runner tracks each filename and serializes execution with a PostgreSQL advisory lock. Schema changes must update both the Drizzle column definitions and a new SQL migration. Do not run schema push or generate a second baseline against the evaluation database.
