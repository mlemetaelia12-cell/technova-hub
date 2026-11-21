import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { createSession, sessionCookie } from '@/lib/auth';
import { makePublicId, makeRecoveryCode } from '@/lib/ids';
import { registerSchema } from '@/lib/validation';
import { forbiddenOrigin, rateLimit, sameOrigin } from '@/lib/security';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) return NextResponse.json({error:'Too many attempts. Try again later.'},{status:429});
  try {
    const parsed = registerSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message ?? 'Invalid registration details'},{status:400});
    const {username,password}=parsed.data;
    const passwordHash=await bcrypt.hash(password,12);
    const recoveryCode=makeRecoveryCode();
    const recoveryHash=await bcrypt.hash(recoveryCode+(process.env.RECOVERY_PEPPER||process.env.SESSION_SECRET||''),12);
    const publicId=makePublicId();
    const rows=await sql`INSERT INTO participants(public_id,display_name,anonymous,recovery_hash,username,password_hash) VALUES(${publicId},${username},false,${recoveryHash},${username},${passwordHash}) RETURNING id,public_id,username,display_name,anonymous`;
    const participant=rows[0];
    const token=await createSession({sub:String(participant.id),role:'participant'});
    const response=NextResponse.json({participant,recoveryCode,warning:'Save this recovery code securely. It is shown once.'},{status:201});
    response.cookies.set('tn_session',token,sessionCookie); return response;
  } catch(error) {
    if (error && typeof error==='object' && 'code' in error && error.code==='23505') return NextResponse.json({error:'That username is already taken.'},{status:409});
    console.error('Registration failed:',error); return NextResponse.json({error:'Could not create account. Please try again.'},{status:500});
  }
}
