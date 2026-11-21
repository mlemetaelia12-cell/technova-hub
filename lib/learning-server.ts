import { sql } from '@/lib/db';
import { learningPaths } from '@/lib/learning';
import { tanzaniaDate } from '@/lib/dates';

export async function isLessonUnlocked(participantId:number,pathSlug:string,lessonSlug:string) {
  const path=learningPaths.find(p=>p.slug===pathSlug);
  const index=path?.lessons.findIndex(l=>l.slug===lessonSlug)??-1;
  if(!path||index<0)return false;
  if(index===0)return true;
  const previous=path.lessons[index-1];
  const rows=await sql`SELECT status,checkpoint_passed_at,practical_passed_at FROM learning_progress WHERE participant_id=${participantId} AND path_slug=${pathSlug} AND lesson_slug=${previous.slug} LIMIT 1`;
  return rows[0]?.status==='completed'&&Boolean(rows[0]?.checkpoint_passed_at)&&Boolean(rows[0]?.practical_passed_at);
}

export async function awardXp(participantId:number,sourceType:string,sourceKey:string,amount:number) {
  const rows=await sql`INSERT INTO xp_rewards(participant_id,source_type,source_key,amount) VALUES(${participantId},${sourceType},${sourceKey},${amount}) ON CONFLICT(participant_id,source_type,source_key) DO NOTHING RETURNING amount`;
  return rows.length?Number(rows[0].amount):0;
}

export async function issueCertificateIfEligible(participantId:number,pathSlug:string) {
  const path=learningPaths.find(p=>p.slug===pathSlug); if(!path)return null;
  const completed=await sql`SELECT COUNT(*)::int AS count FROM learning_progress WHERE participant_id=${participantId} AND path_slug=${pathSlug} AND status='completed' AND checkpoint_passed_at IS NOT NULL AND practical_passed_at IS NOT NULL`;
  if(Number(completed[0]?.count??0)!==path.lessons.length)return null;
  const nameRows=await sql`SELECT COALESCE(NULLIF(display_name,''),NULLIF(username,''),'TECHNOVA Learner') AS learner_name FROM participants WHERE id=${participantId} AND is_blocked=false LIMIT 1`;
  if(!nameRows.length)return null;
  const learnerName=String(nameRows[0].learner_name);
  for(let attempt=0;attempt<4;attempt++){
    const code=`TNH-${tanzaniaDate().slice(0,4)}-${cryptoCode()}`;
    try{
      const rows=await sql`INSERT INTO certificates(participant_id,path_slug,certificate_code,learner_name,path_title,path_level) VALUES(${participantId},${pathSlug},${code},${learnerName},${path.title},${path.level}) ON CONFLICT(participant_id,path_slug) DO NOTHING RETURNING id,certificate_code,learner_name,path_title,path_level,issued_at`;
      if(rows.length)return rows[0];
      const existing=await sql`SELECT id,certificate_code,learner_name,path_title,path_level,issued_at FROM certificates WHERE participant_id=${participantId} AND path_slug=${pathSlug} LIMIT 1`;
      if(existing.length)return existing[0];
    }catch(error){if(attempt===3)throw error;}
  }
  return null;
}

function cryptoCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map(byte=>chars[byte%chars.length]).join('');
}
