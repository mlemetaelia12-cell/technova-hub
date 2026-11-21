import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(value);
}

export async function createSession(payload: { sub: string; role: 'participant' | 'admin' }) {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(payload.role === 'admin' ? '8h' : '30d')
    .sign(secret());
}

export async function getSession() {
  const token = (await cookies()).get('tn_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getSession();
  return session?.role === 'admin' && session.sub === 'admin' ? session : null;
}

export const sessionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};
