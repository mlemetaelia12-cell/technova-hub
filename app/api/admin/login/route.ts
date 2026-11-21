import { NextResponse } from 'next/server';
import { createSession, sessionCookie } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { forbiddenOrigin, rateLimit, sameOrigin } from '@/lib/security';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`admin:${ip}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429 });
  }
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    const { username, password } = body as { username?: unknown; password?: unknown };
    if (typeof username !== 'string' || username.length > 100 || typeof password !== 'string' || password.length > 256) {
      return NextResponse.json({ error: 'Enter your username and password' }, { status: 400 });
    }
    if (!process.env.ADMIN_USERNAME || (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH)) {
      return NextResponse.json({ error: 'Admin access is not configured' }, { status: 503 });
    }
    const passwordValid = process.env.ADMIN_PASSWORD_HASH ? await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH) : password === process.env.ADMIN_PASSWORD;
    if (username !== process.env.ADMIN_USERNAME || !passwordValid) {
      return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
    }
    const token = await createSession({ sub: 'admin', role: 'admin' });
    const res = NextResponse.json({ ok: true });
    res.cookies.set('tn_session', token, { ...sessionCookie, maxAge: 60 * 60 * 8 });
    return res;
  } catch {
    return NextResponse.json({ error: 'Could not sign in' }, { status: 500 });
  }
}
