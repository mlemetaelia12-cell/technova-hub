import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
import {syncAchievementsBestEffort} from '@/lib/achievements';
import {sameOrigin,forbiddenOrigin} from '@/lib/security';
import {getPracticalTask,getLesson,evaluatePractical} from '@/lib/learning-assessments';
import {isLessonUnlocked,awardXp} from '@/lib/learning-server';
import {learningPaths} from '@/lib/learning';

const schema=z.object({pathSlug:z.string().min(1).max(80),lessonSlug:z.string().min(1).max(100),evidence:z.string().trim().min(1).max(12000),reflection:z.string().trim().min(1).max(2500)});
export async function POST(req:Request){
  if(!sameOrigin(req))return forbiddenOrigin();
  const session=await getSession();if(session?.role!=='participant')return NextResponse.json({error:'Sign in required'},{status:401});
  const id=Number(session.sub);const active=await sql`SELECT id FROM participants WHERE id=${id} AND is_blocked=false LIMIT 1`;if(!active.length)return NextResponse.json({error:'Account unavailable'},{status:403});
  let raw:unknown;try{raw=await req.json();}catch{return NextResponse.json({error:'Invalid request body'},{status:400});}
  const parsed=schema.safeParse(raw);if(!parsed.success)return NextResponse.json({error:'Provide your practical evidence and a reflection.'},{status:400});
  const {pathSlug,lessonSlug,evidence,reflection}=parsed.data;const found=getLesson(pathSlug,lessonSlug);const task=getPracticalTask(pathSlug,lessonSlug);
  if(!found||!task)return NextResponse.json({error:'Lesson or practical task not found'},{status:404});
  if(!await isLessonUnlocked(id,pathSlug,lessonSlug))return NextResponse.json({error:'This lesson is locked.'},{status:403});
  const checkpoint=await sql`SELECT id FROM learning_checkpoint_attempts WHERE participant_id=${id} AND path_slug=${pathSlug} AND lesson_slug=${lessonSlug} AND passed=true LIMIT 1`;
  if(!checkpoint.length)return NextResponse.json({error:'Pass the lesson checkpoint before submitting practical evidence.'},{status:409});
  const priorPass=await sql`SELECT id FROM learning_practical_submissions WHERE participant_id=${id} AND path_slug=${pathSlug} AND lesson_slug=${lessonSlug} AND passed=true LIMIT 1`;
  if(priorPass.length)return NextResponse.json({error:'This practical task has already been passed. Continue to the next lesson.'},{status:409});
  const attempts=await sql`SELECT COUNT(*)::int AS count FROM learning_practical_submissions WHERE participant_id=${id} AND path_slug=${pathSlug} AND lesson_slug=${lessonSlug} AND submitted_at>NOW()-INTERVAL '24 hours'`;
  if(Number(attempts[0]?.count??0)>=10)return NextResponse.json({error:'You have reached the practical retry limit for this lesson today.'},{status:429});
  const result=evaluatePractical(task,evidence,reflection);
  const rows=await sql`INSERT INTO learning_practical_submissions(participant_id,path_slug,lesson_slug,evidence,reflection,passed,score_percent,feedback) VALUES(${id},${pathSlug},${lessonSlug},${evidence},${reflection},${result.passed},${result.score},${result.feedback}) RETURNING id,submitted_at`;
  let xpAwarded=0;let lessonCompleted=false;let certificate:null|Record<string,unknown>=null;
  if(result.passed){
    await sql`INSERT INTO learning_progress(participant_id,path_slug,lesson_slug,status,read_at,checkpoint_passed_at,practical_passed_at,completed_at,updated_at) VALUES(${id},${pathSlug},${lessonSlug},'completed',NOW(),NOW(),NOW(),NOW(),NOW()) ON CONFLICT(participant_id,path_slug,lesson_slug) DO UPDATE SET status='completed',checkpoint_passed_at=COALESCE(learning_progress.checkpoint_passed_at,NOW()),practical_passed_at=COALESCE(learning_progress.practical_passed_at,NOW()),completed_at=COALESCE(learning_progress.completed_at,NOW()),updated_at=NOW()`;
    xpAwarded=await awardXp(id,'lesson_practical',`${pathSlug}:${lessonSlug}`,20);
    await syncAchievementsBestEffort(id);
    lessonCompleted=true;
    const path=learningPaths.find(p=>p.slug===pathSlug);
    const rowsDone=await sql`SELECT COUNT(*)::int AS count FROM learning_progress WHERE participant_id=${id} AND path_slug=${pathSlug} AND status='completed' AND checkpoint_passed_at IS NOT NULL AND practical_passed_at IS NOT NULL`;
    if(path&&Number(rowsDone[0]?.count??0)===path.lessons.length){const final=await sql`SELECT id FROM learning_final_attempts WHERE participant_id=${id} AND path_slug=${pathSlug} AND passed=true LIMIT 1`;if(final.length){const {issueCertificateIfEligible}=await import('@/lib/learning-server');certificate=await issueCertificateIfEligible(id,pathSlug) as Record<string,unknown>|null;}}
  }
  return NextResponse.json({submissionId:Number(rows[0].id),score:result.score,passed:result.passed,missing:result.missing,feedback:result.feedback,xpAwarded,lessonCompleted,certificate});
}
