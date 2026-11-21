import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { createSession, sessionCookie } from '@/lib/auth';
import { forbiddenOrigin, rateLimit, sameOrigin } from '@/lib/security';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`recover:${ip}`, 5, 15 * 60 * 1000)) return NextResponse.json({ error: 'Too many recovery attempts. Try again later.' }, { status: 429 });
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Enter your TECHNOVA ID and recovery code' }, { status: 400 });
    const { publicId, recoveryCode } = body as { publicId?: unknown; recoveryCode?: unknown };
    if (typeof publicId !== 'string' || typeof recoveryCode !== 'string' || publicId.length > 32 || recoveryCode.length > 128) {
      return NextResponse.json({ error: 'Enter your TECHNOVA ID and recovery code' }, { status: 400 });
    }
    const rows = await sql`SELECT id,public_id,username,display_name,anonymous,recovery_hash,password_hash FROM participants WHERE public_id=${publicId.trim().toUpperCase()} AND is_blocked=false LIMIT 1`;
    const participant = rows[0];
    const pepper = process.env.RECOVERY_PEPPER;
    if (!participant || !pepper || !(await bcrypt.compare(recoveryCode.replace(/\s/g, '') + pepper, participant.recovery_hash))) {
      return NextResponse.json({ error: 'Invalid ID or recovery code' }, { status: 401 });
    }
    const token = await createSession({ sub: String(participant.id), role: 'participant' });
    const response = NextResponse.json({ ok: true, participant: { public_id: participant.public_id, username: participant.username, display_name: participant.display_name, anonymous: participant.anonymous }, needsUpgrade: !participant.password_hash });
    response.cookies.set('tn_session', token, sessionCookie);
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Recovery failed' }, { status: 500 });
  }
}
