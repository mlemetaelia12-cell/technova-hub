import {NextResponse} from 'next/server';
import {sql} from '@/lib/db';
export async function GET(_req:Request,{params}:{params:Promise<{code:string}>}){
 const {code}=await params;const normalized=code.toUpperCase();if(!/^TNH-\d{4}-[A-HJ-NP-Z2-9]{8}$/.test(normalized))return NextResponse.json({valid:false},{status:404});
 try{const rows=await sql`SELECT certificate_code,COALESCE(learner_name,p.display_name,p.username,'TECHNOVA Learner') AS learner_name,COALESCE(path_title,path_slug) AS path_title,COALESCE(path_level,'Learning Path') AS path_level,issued_at FROM certificates c JOIN participants p ON p.id=c.participant_id WHERE c.certificate_code=${normalized} AND p.is_blocked=false LIMIT 1`;if(!rows.length)return NextResponse.json({valid:false},{status:404});return NextResponse.json({valid:true,certificate:rows[0]});}catch(error){console.error(error);return NextResponse.json({error:'Verification is temporarily unavailable'},{status:503});}
}
