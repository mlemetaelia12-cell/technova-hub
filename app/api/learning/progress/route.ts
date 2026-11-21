import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
import {sameOrigin,forbiddenOrigin} from '@/lib/security';
import {getLesson} from '@/lib/learning-assessments';
import {isLessonUnlocked} from '@/lib/learning-server';

export async function GET(){
  const session=await getSession();
  if(session?.role!=='participant')return NextResponse.json({error:'Sign in required'},{status:401});
  const rows=await sql`SELECT path_slug,lesson_slug,status,read_at,completed_at,checkpoint_passed_at,practical_passed_at FROM learning_progress WHERE participant_id=${Number(session.sub)} ORDER BY updated_at DESC`;
  return NextResponse.json({progress:rows});
}

export async function POST(req:Request){
  if(!sameOrigin(req))return forbiddenOrigin();
  const session=await getSession();
  if(session?.role!=='participant')return NextResponse.json({error:'Sign in required'},{status:401});
  try{
    const body=await req.json() as {pathSlug?:string;lessonSlug?:string;action?:string};
    if(body.action!=='read'||!body.pathSlug||!body.lessonSlug||!getLesson(body.pathSlug,body.lessonSlug))return NextResponse.json({error:'Only authenticated lesson reading progress can be recorded here.'},{status:400});
    const participantId=Number(session.sub);
    if(!await isLessonUnlocked(participantId,body.pathSlug,body.lessonSlug))return NextResponse.json({error:'Complete the previous lesson checkpoint and practical task to unlock this lesson.'},{status:403});
    const rows=await sql`INSERT INTO learning_progress(participant_id,path_slug,lesson_slug,status,read_at,updated_at) VALUES(${participantId},${body.pathSlug},${body.lessonSlug},'in_progress',NOW(),NOW()) ON CONFLICT(participant_id,path_slug,lesson_slug) DO UPDATE SET read_at=COALESCE(learning_progress.read_at,NOW()),updated_at=NOW() RETURNING path_slug,lesson_slug,status,read_at,checkpoint_passed_at,practical_passed_at`;
    return NextResponse.json({progress:rows[0]});
  }catch(error){console.error(error);return NextResponse.json({error:'Could not save lesson reading progress'},{status:500});}
}
