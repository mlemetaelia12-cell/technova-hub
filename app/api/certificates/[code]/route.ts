import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
import {buildCertificatePdf} from '@/lib/certificate-pdf';
export const runtime='nodejs';
export async function GET(req:Request,{params}:{params:Promise<{code:string}>}){
 const session=await getSession();if(session?.role!=='participant')return NextResponse.json({error:'Sign in required'},{status:401});
 const active=await sql`SELECT id FROM participants WHERE id=${Number(session.sub)} AND is_blocked=false LIMIT 1`;if(!active.length)return NextResponse.json({error:'Account unavailable'},{status:403});
 const {code}=await params;const normalized=code.toUpperCase();if(!/^TNH-\d{4}-[A-HJ-NP-Z2-9]{8}$/.test(normalized))return NextResponse.json({error:'Certificate not found'},{status:404});
 try{
  const rows=await sql`SELECT certificate_code,COALESCE(learner_name,p.display_name,p.username,'TECHNOVA Learner') AS learner_name,COALESCE(path_title,path_slug) AS path_title,COALESCE(path_level,'Learning Path') AS path_level,issued_at FROM certificates c JOIN participants p ON p.id=c.participant_id WHERE c.certificate_code=${normalized} AND c.participant_id=${Number(session.sub)} LIMIT 1`;
  if(!rows.length)return NextResponse.json({error:'Certificate not found for this account'},{status:404});
  const cert=rows[0];const verifyUrl=new URL(`/verify/${encodeURIComponent(normalized)}`,req.url).toString();const issuedAt=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Dar_es_Salaam',dateStyle:'long'}).format(new Date(cert.issued_at));
  const pdf=buildCertificatePdf({learnerName:String(cert.learner_name),pathTitle:String(cert.path_title),pathLevel:String(cert.path_level),issuedAt,code:normalized,verifyUrl});
  return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="TECHNOVA-${normalized}.pdf"`,'Cache-Control':'private, no-store'}});
 }catch(error){console.error(error);return NextResponse.json({error:'Could not generate certificate PDF'},{status:500});}
}
