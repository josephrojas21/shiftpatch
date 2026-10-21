# Shared contract decisions

All errors: {error:string}. Auth supports Bearer JWT and HttpOnly browser session. All data endpoints authenticated. JSON dates YYYY-MM-DD, clock times HH:mm, audit timestamps ISO UTC. Cookie mutations enforce same-origin. DTO details in src/contracts/index.ts.
GET /api/auth/me -> {user}; POST /api/auth/logout -> {ok:true}.
GET /api/credentials -> {credentials: CredentialDto[]} (own for nurse, all for admin; no agencies).
POST /api/credentials multipart: file, type=license|tb_test, expiresAt -> CredentialDto 201, pending review.
POST /api/credentials/:id/review {status:approved|rejected} -> CredentialDto (admin).
GET /api/credentials/:id/download -> file (owner/admin).
GET /api/assignments -> {assignments: AssignmentDto[]} scoped to nurse, agency or all admin.
GET /api/timesheets -> {timesheets: TimesheetDto[]} scoped by role.
POST /api/timesheets {assignmentId,startTime,endTime,breakMinutes} -> TimesheetDto 201; draft. Times are local datetime YYYY-MM-DDTHH:mm.
PATCH /api/timesheets/:id same time fields -> TimesheetDto (owner draft/rejected).
POST /api/timesheets/:id/submit -> TimesheetDto (owner).
POST /api/timesheets/:id/review {status:approved|rejected,reason?:string} -> TimesheetDto (own agency/admin); rejection requires reason.
GET /api/admin/report?agencyId=&from=&to= -> {open,filled,cancellations,noShows,approvedMinutes,coverageRate,shifts:ShiftDto[]}.
GET /api/admin/report/export -> CSV with same filters.
GET /api/admin/audit?page=1 -> {events:AuditDto[],total:number} (admin).
GET /api/admin/exports/documents?nurseId= -> private ZIP (admin), all nurses if omitted; manifest identifies missing files.
GET /api/admin/notifications -> {notifications:NotificationDto[]} (admin).
GET /api/jobs/email -> authenticated by CRON_SECRET, process persisted outbox with provider idempotency (not browser accessible).
GET /api/health -> {status:ok|degraded}.
Additional DTOs can be extended compatibly; coordinate with other agent. Exact six required routes in technical-spec.md take precedence.
