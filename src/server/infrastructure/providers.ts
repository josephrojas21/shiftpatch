import { compare } from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { put, get, del } from '@vercel/blob';
import { Resend } from 'resend';
import type { Files, Identity, Mail } from '../application/ports';
const key = () => {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_SECRET must have at least 32 characters');
  return new TextEncoder().encode(value);
};
export const identity: Identity = {
  verify: compare,
  async sign(user) {
    return new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('shiftpatch')
      .setAudience('shiftpatch')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(key());
  },
  async read(token) {
    const { payload } = await jwtVerify(token, key(), {
      issuer: 'shiftpatch',
      audience: 'shiftpatch',
      algorithms: ['HS256'],
    });
    if (!payload.sub) throw new Error('Missing subject');
    return payload.sub;
  },
};
export const files: Files = {
  async put(path, bytes, contentType) {
    const result = await put(path, Buffer.from(bytes), {
      access: 'private',
      contentType,
      addRandomSuffix: true,
    });
    return result.url;
  },
  async get(path) {
    const result = await get(path, { access: 'private' });
    if (!result || result.statusCode !== 200) throw new Error('Document unavailable');
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  },
  async remove(path) {
    await del(path);
  },
};
export const mail: Mail = {
  configured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  async send(recipient, subject, body, id) {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
      throw new Error('Mail is not configured');
    const destination = process.env.DEMO_EMAIL_TO || recipient;
    if (
      !process.env.DEMO_EMAIL_TO &&
      (recipient.endsWith('.example') || recipient.endsWith('@example.com'))
    )
      throw new Error('Demo recipient required');
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      { from: process.env.EMAIL_FROM, to: destination, subject, text: body },
      { idempotencyKey: id },
    );
    if (result.error) throw new Error('Mail delivery failed');
  },
};
