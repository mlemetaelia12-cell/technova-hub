import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
import {syncAchievementsBestEffort} from '@/lib/achievements';
import {sameOrigin,forbiddenOrigin} from '@/lib/security';
import {buildLessonQuiz,getPublicQuiz,getLesson} from '@/lib/learning-assessments';
import {isLessonUnlocked,awardXp} from '@/lib/learning-server';

const paramsSchema=z.object({pathSlug:z.string().min(1).max(80),lessonSlug:z.string().min(1).max(100)});
const submissionSchema=z.object({pathSlug:z.string().min(1).max(80),lessonSlug:z.string().min(1).max(100),answers:z.record(z.string(),z.enum(['A','B','C','D']))});
async function participant(){const session=await getSession();if(session?.role!=='participant')return null;const rows=await sql`SELECT id FROM participants WHERE id=${Number(session.sub)} AND is_blocked=false LIMIT 1`;return rows.length?Number(session.sub):null;}

export async function GET(req:Request){
  const id=await participant();if(!id)return NextResponse.json({error:'Sign in required'},{status:401});
  const params=paramsSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));if(!params.success)return NextResponse.json({error:'Invalid lesson'},{status:400});
  const {pathSlug,lessonSlug}=params.data;if(!getLesson(pathSlug,lessonSlug))return NextResponse.json({error:'Lesson not found'},{status:404});
  if(!await isLessonUnlocked(id,pathSlug,lessonSlug))return NextResponse.json({error:'This lesson is locked. Finish the previous lesson first.'},{status:403});
  const quiz=buildLessonQuiz(pathSlug,lessonSlug,id);
  const status=await sql`SELECT status,checkpoint_passed_at,practical_passed_at FROM learning_progress WHERE participant_id=${id} AND path_slug=${pathSlug} AND lesson_slug=${lessonSlug} LIMIT 1`;
  const attempts=await sql`SELECT score_percent,passed,attempted_at FROM learning_checkpoint_attempts WHERE participant_id=${id} AND path_slug=${pathSlug} AND lesson_slug=${lessonSlug} ORDER BY attempted_at DESC LIMIT 1`;
  return NextResponse.json({questions:getPublicQuiz(quiz),questionCount:quiz.length,passMark:80,checkpointPassed:Boolean(status[0]?.checkpoint_passed_at),practicalPassed:Boolean(status[0]?.practical_passed_at),lessonCompleted:status[0]?.status==='completed',lastAttempt:attempts[0]??null,taskAvailable:true});
}

export async function POST(req:Request){
  if(!sameOrigin(req))return forbiddenOrigin();
  const id=await participant();if(!id)return NextResponse.json({error:'Sign in required'},{status:401});
  let raw:unknown;try{raw=await req.json();}catch{return NextResponse.json({error:'Invalid request body'},{status:400});}
  const parsed=submissionSchema.safeParse(raw);if(!parsed.success)return NextResponse.json({error:'Submit one A, B, C or D answer for every checkpoint question.'},{status:400});
  const {pathSlug,lessonSlug,answers}=parsed.data;
  if(!getLesson(pathSlug,lessonSlug))return NextResponse.json({error:'Lesson not found'},{status:404});
  if(!await isLessonUnlocked(id,pathSlug,lessonSlug))return NextResponse.json({error:'This lesson is locked.'},{status:403});
  const priorPass=await sql`SELECT checkpoint_passed_at FROM learning_progress WHERE participant_id=${id} AND path_slug=${pathSlug} AND lesson_slug=${lessonSlug} AND checkpoint_passed_at IS NOT NULL LIMIT 1`;
  if(priorPass.length)return NextResponse.json({error:'This checkpoint has already been passed. Continue to the practical task.'},{status:409});
  const quiz=buildLessonQuiz(pathSlug,lessonSlug,id);if(Object.keys(answers).length!==quiz.length||quiz.some(q=>!answers[q.id]))return NextResponse.json({error:'Answer all checkpoint questions before submitting.'},{status:400});
  const results=quiz.map(q=>({id:q.id,correct:answers[q.id]===q.correctOption,correctOption:q.correctOption,correctAnswer:q.options.find(o=>o.id===q.correctOption)?.text??'',explanation:q.explanation}));
  const correct=results.filter(r=>r.correct).length;const score=Math.round(correct/quiz.length*100);const passed=score>=80;
  const saved=await sql`INSERT INTO learning_checkpoint_attempts(participant_id,path_slug,lesson_slug,answers,score_percent,passed) VALUES(${id},${pathSlug},${lessonSlug},${JSON.stringify(answers)},${score},${passed}) RETURNING id,attempted_at`;
  let xpAwarded=0;
  if(passed){
    await sql`INSERT INTO learning_progress(participant_id,path_slug,lesson_slug,status,read_at,checkpoint_passed_at,updated_at) VALUES(${id},${pathSlug},${lessonSlug},'checkpoint_passed',NOW(),NOW(),NOW()) ON CONFLICT(participant_id,path_slug,lesson_slug) DO UPDATE SET status=CASE WHEN learning_progress.status='completed' THEN 'completed' ELSE 'checkpoint_passed' END,checkpoint_passed_at=COALESCE(learning_progress.checkpoint_passed_at,NOW()),read_at=COALESCE(learning_progress.read_at,NOW()),updated_at=NOW()`;
    xpAwarded=await awardXp(id,'lesson_checkpoint',`${pathSlug}:${lessonSlug}`,15);
    await syncAchievementsBestEffort(id);
  }
  return NextResponse.json({attemptId:Number(saved[0].id),score,correct,total:quiz.length,passed,passMark:80,results,xpAwarded,feedback:passed?'Checkpoint passed. Your next step is the practical task.':'Keep going. Review the explanations, revisit the lesson and try again.'});
}
