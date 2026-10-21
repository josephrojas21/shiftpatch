import { AppError } from '../../domain/models';

/** Host is the HTTP authority received by Next; forwarded host/proto are not trusted. */
export function assertSameOrigin(request: Request, vercelTls = Boolean(process.env.VERCEL)) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const internalUrl = new URL(request.url);
  const protocol = vercelTls ? 'https:' : internalUrl.protocol;
  // A Host authority must not be interpreted as credentials, a path, or multiple hosts.
  if (!origin || !host || /[\s,@/\\?#]/.test(host)) {
    throw new AppError(403, 'Invalid request origin');
  }
  try {
    const expected = new URL(`${protocol}//${host}`);
    if (origin !== expected.origin) throw new Error('Origin mismatch');
  } catch {
    throw new AppError(403, 'Invalid request origin');
  }
}
