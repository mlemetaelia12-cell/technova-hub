import { NextResponse } from 'next/server';
import { forbiddenOrigin, sameOrigin } from '@/lib/security';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const response = NextResponse.json({ ok: true });
  response.cookies.set('tn_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
