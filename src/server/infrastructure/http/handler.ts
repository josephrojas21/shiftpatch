import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { service } from '../../composition';
import { AppError } from '../../domain/models';
import { assertSameOrigin } from './origin';
import { scheduleEmailDelivery } from './email-delivery';
import { loginSchema, postShiftSchema, cancelSchema, timesheetInputSchema } from '@/contracts';
const cookie = 'shiftpatch_session';
const review = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().max(2000).optional(),
});
const filters = z
  .object({
    agencyId: z.string().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'Invalid date range');
function filename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
function bytes(data: Uint8Array, type: string, name: string) {
  return new Response(Buffer.from(data), {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${filename(name)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
function isCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(req.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected))
    throw new AppError(401, 'Authentication required');
}
async function json(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, 'Invalid JSON body');
  }
}
export async function handle(req: NextRequest) {
  try {
    const response = await dispatch(req);
    if (
      response.ok &&
      req.method === 'POST' &&
      /^\/api\/(?:shifts\/[^/]+\/(?:claim|cancel)|timesheets\/[^/]+\/(?:submit|review))\/?$/.test(
        new URL(req.url).pathname,
      )
    )
      scheduleEmailDelivery();
    return response;
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Invalid request' },
        { status: 400 },
      );
    console.error('API request failed', {
      path: new URL(req.url).pathname,
      errorType: error instanceof Error ? error.name : 'Unknown',
    });
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }
}
async function dispatch(req: NextRequest): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/$/, '');
  const method = req.method;
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URL(req.url).searchParams);
  if (path === '/api/health' && method === 'GET') {
    try {
      await service.healthy();
      return NextResponse.json({ status: 'ok' });
    } catch {
      return NextResponse.json({ status: 'degraded' }, { status: 503 });
    }
  }
  if (path === '/api/jobs/email' && method === 'GET') {
    isCron(req);
    return NextResponse.json(await service.processMail());
  }
  if (path === '/api/auth/login' && method === 'POST') {
    if (req.headers.has('origin')) assertSameOrigin(req);
    const input = loginSchema.parse(await json(req));
    const result = await service.login(input.email, input.password);
    const response = NextResponse.json(result);
    response.cookies.set(cookie, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 28800,
    });
    return response;
  }
  const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer || req.cookies.get(cookie)?.value;
  if (!token) throw new AppError(401, 'Authentication required');
  if (!bearer && !['GET', 'HEAD', 'OPTIONS'].includes(method)) assertSameOrigin(req);
  const u = await service.authenticate(token);
  if (path === '/api/auth/me' && method === 'GET')
    return NextResponse.json({ user: { id: u.id, name: u.name, role: u.role } });
  if (path === '/api/auth/logout' && method === 'POST') {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookie, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return res;
  }
  if (path === '/api/shifts' && method === 'GET')
    return NextResponse.json({ shifts: await service.shifts(u) });
  if (path === '/api/shifts' && method === 'POST')
    return NextResponse.json(await service.postShift(u, postShiftSchema.parse(await json(req))), {
      status: 201,
    });
  if (parts[1] === 'shifts' && parts.length === 4 && method === 'POST') {
    if (parts[3] === 'claim') return NextResponse.json(await service.claim(u, parts[2]));
    if (parts[3] === 'cancel')
      return NextResponse.json(
        await service.cancel(u, parts[2], cancelSchema.parse(await json(req)).reason),
      );
  }
  if (parts[1] === 'agencies' && parts.length === 4 && parts[3] === 'shifts' && method === 'GET')
    return NextResponse.json({ agencyId: parts[2], shifts: await service.shifts(u, parts[2]) });
  if (path === '/api/assignments' && method === 'GET')
    return NextResponse.json({ assignments: await service.assignments(u) });
  if (path === '/api/credentials' && method === 'GET')
    return NextResponse.json({ credentials: await service.credentials(u) });
  if (path === '/api/credentials' && method === 'POST') {
    if (Number(req.headers.get('content-length')) > 4_300_000)
      throw new AppError(413, 'File exceeds 4 MB');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024)
      throw new AppError(400, 'Upload a document up to 4 MB');
    const input = z
      .object({ type: z.enum(['license', 'tb_test']), expiresAt: z.iso.date() })
      .parse({ type: form.get('type'), expiresAt: form.get('expiresAt') });
    const content = new Uint8Array(await file.arrayBuffer());
    const signature = Buffer.from(content.subarray(0, 8));
    const contentType =
      signature.subarray(0, 5).toString() === '%PDF-'
        ? 'application/pdf'
        : signature.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          ? 'image/jpeg'
          : signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? 'image/png'
            : null;
    if (!contentType) throw new AppError(400, 'Only valid PDF, JPEG or PNG documents are accepted');
    return NextResponse.json(
      await service.upload(u, { ...input, bytes: content, name: filename(file.name), contentType }),
      { status: 201 },
    );
  }
  if (parts[1] === 'credentials' && parts.length === 4) {
    if (parts[3] === 'review' && method === 'POST')
      return NextResponse.json(
        await service.reviewCredential(u, parts[2], review.parse(await json(req)).status),
      );
    if (parts[3] === 'download' && method === 'GET') {
      const file = await service.download(u, parts[2]);
      return bytes(file.bytes, file.contentType, file.name);
    }
  }
  if (path === '/api/timesheets' && method === 'GET')
    return NextResponse.json({ timesheets: await service.timesheets(u) });
  if (path === '/api/timesheets' && method === 'POST')
    return NextResponse.json(
      await service.createTimesheet(u, timesheetInputSchema.parse(await json(req))),
      { status: 201 },
    );
  if (parts[1] === 'timesheets' && parts.length === 3 && method === 'PATCH')
    return NextResponse.json(
      await service.editTimesheet(
        u,
        parts[2],
        timesheetInputSchema.omit({ assignmentId: true }).parse(await json(req)),
      ),
    );
  if (parts[1] === 'timesheets' && parts.length === 4 && method === 'POST') {
    if (parts[3] === 'submit') return NextResponse.json(await service.submitTimesheet(u, parts[2]));
    if (parts[3] === 'review') {
      const input = review.parse(await json(req));
      return NextResponse.json(
        await service.reviewTimesheet(u, parts[2], input.status, input.reason),
      );
    }
  }
  if (path === '/api/admin/report' && method === 'GET')
    return NextResponse.json(await service.report(u, filters.parse(query)));
  if (path === '/api/admin/report/export' && method === 'GET') {
    const report = await service.report(u, filters.parse(query));
    const escape = (v: unknown) =>
      `"${String(v ?? '')
        .replace(/^[=+\-@\t\r]/, "'$&")
        .replace(/"/g, '""')}"`;
    const rows = [
      ['id', 'agency', 'role', 'date', 'start', 'end', 'status', 'nurse'],
      ...report.shifts.map((s) => [
        s.id,
        s.agencyName,
        s.role,
        s.date,
        s.startTime,
        s.endTime,
        s.status,
        s.claimedBy,
      ]),
    ];
    return bytes(
      strToU8(rows.map((row) => row.map(escape).join(',')).join('\r\n')),
      'text/csv; charset=utf-8',
      'shiftpatch-report.csv',
    );
  }
  if (path === '/api/admin/audit' && method === 'GET')
    return NextResponse.json(
      await service.auditLog(
        u,
        z.coerce
          .number()
          .int()
          .min(1)
          .max(100000)
          .parse(query.page || 1),
      ),
    );
  if (path === '/api/admin/notifications' && method === 'GET')
    return NextResponse.json({ notifications: await service.notifications(u) });
  if (path === '/api/admin/exports/documents' && method === 'GET') {
    const { files, manifest } = await service.exportDocuments(u, query.nurseId);
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    return bytes(zipSync(files), 'application/zip', 'shiftpatch-documents.zip');
  }
  throw new AppError(404, 'Not found');
}
