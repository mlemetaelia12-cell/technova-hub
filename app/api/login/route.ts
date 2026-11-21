import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { createSession, sessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { forbiddenOrigin, rateLimit, sameOrigin } from '@/lib/security';
export async function POST(req:Request){
 if(!sameOrigin(req)) return forbiddenOrigin();
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown';
 if(!rateLimit(`login:${ip}`,10,15*60*1000)) return NextResponse.json({error:'Too many login attempts. Try later.'},{status:429});
 try{const p=loginSchema.safeParse(await req.json());if(!p.success)return NextResponse.json({error:'Enter a valid username and password.'},{status:400});
 const rows=await sql`SELECT id,public_id,username,display_name,anonymous,password_hash,is_blocked FROM participants WHERE LOWER(username)=LOWER(${p.data.username}) LIMIT 1`;
 const u=rows[0];if(!u||u.is_blocked||!u.password_hash||!await bcrypt.compare(p.data.password,String(u.password_hash)))return NextResponse.json({error:'Incorrect username or password.'},{status:401});
 const token=await createSession({sub:String(u.id),role:'participant'});const response=NextResponse.json({participant:{id:u.id,public_id:u.public_id,username:u.username,display_name:u.display_name,anonymous:u.anonymous}});response.cookies.set('tn_session',token,sessionCookie);return response;
 }catch(e){console.error(e);return NextResponse.json({error:'Could not sign in right now.'},{status:500});}
}
