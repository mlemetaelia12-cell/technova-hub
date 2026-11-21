import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
export async function GET(){const session=await getSession();if(session?.role!=='participant')return NextResponse.json({error:'Sign in required'},{status:401});const active=await sql`SELECT id FROM participants WHERE id=${Number(session.sub)} AND is_blocked=false LIMIT 1`;if(!active.length)return NextResponse.json({error:'Account unavailable'},{status:403});const rows=await sql`SELECT certificate_code,learner_name,path_title,path_level,issued_at FROM certificates WHERE participant_id=${Number(session.sub)} ORDER BY issued_at DESC`;return NextResponse.json({certificates:rows});}
