# ShiftPatch working agreement

- Full scope approved: Next.js/React, hexagonal backend, PostgreSQL, private documents, timesheets, audit, email and analytics.
- Domain has zero framework/ORM/provider dependencies. Application depends on domain and ports only. Wire providers in composition.
- Preserve docs/technical-spec.md contracts, fixtures and 15 test IDs exactly. No past-date blocking of seed, no timezone conversion.
- Coordinator owns shared contracts, root configuration, CI and integration. Frontend agent owns UI. Backend agent owns server, API, migrations and backend tests. Communicate contract changes before editing.
- Never store secrets in source or output. Never reset the public demo on boot.
- Claims must be atomic. Audit/outbox commit with state mutation. No optimistic claim success.
- Tests of compatibility must contain independent literal expectations, not only reuse production schemas.
- Run relevant tests after each task; final gate: npm run verify and npm run test:e2e. Report actual command outcomes and blocked checks honestly.
- Use npm and package-lock.json; only coordinator changes dependencies.
