import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
import {syncAchievementsBestEffort} from '@/lib/achievements';
import {sameOrigin,forbiddenOrigin} from '@/lib/security';
import {learningPaths} from '@/lib/learning';
import {buildFinalQuiz,getPublicQuiz} from '@/lib/learning-assessments';
import {awardXp,issueCertificateIfEligible} from '@/lib/learning-server';

const params=z.object({pathSlug:z.string().min(1).max(80)});
const bodySchema=z.object({pathSlug:z.string().min(1).max(80),answers:z.record(z.string(),z.enum(['A','B','C','D']))});
async function getParticipant(){const s=await getSession();if(s?.role!=='participant')return null;const p=await sql`SELECT id FROM participants WHERE id=${Number(s.sub)} AND is_blocked=false LIMIT 1`;return p.length?Number(s.sub):null;}
async function lessonsReady(id:number,pathSlug:string){const path=learningPaths.find(p=>p.slug===pathSlug);if(!path)return false;const rows=await sql`SELECT COUNT(*)::int AS count FROM learning_progress WHERE participant_id=${id} AND path_slug=${pathSlug} AND status='completed' AND checkpoint_passed_at IS NOT NULL AND practical_passed_at IS NOT NULL`;return Number(rows[0]?.count??0)===path.lessons.length;}

export async function GET(req:Request){
 const id=await getParticipant();if(!id)return NextResponse.json({error:'Sign in required'},{status:401});
 const p=params.safeParse(Object.fromEntries(new URL(req.url).searchParams));if(!p.success)return NextResponse.json({error:'Select a valid learning path'},{status:400});
 if(!learningPaths.some(x=>x.slug===p.data.pathSlug))return NextResponse.json({error:'Learning path not found'},{status:404});
 if(!await lessonsReady(id,p.data.pathSlug))return NextResponse.json({error:'Complete every lesson checkpoint and practical task before taking the final assessment.'},{status:409});
 const quiz=buildFinalQuiz(p.data.pathSlug,id);return NextResponse.json({questions:getPublicQuiz(quiz),questionCount:quiz.length,passMark:80});
}

export async function POST(req:Request){
 if(!sameOrigin(req))return forbiddenOrigin();
 const id=await getParticipant();if(!id)return NextResponse.json({error:'Sign in required'},{status:401});
 let raw:unknown;try{raw=await req.json();}catch{return NextResponse.json({error:'Invalid request body'},{status:400});}
 const p=bodySchema.safeParse(raw);if(!p.success)return NextResponse.json({error:'Answer every final assessment question.'},{status:400});
 const {pathSlug,answers}=p.data;const path=learningPaths.find(x=>x.slug===pathSlug);if(!path)return NextResponse.json({error:'Learning path not found'},{status:404});
 if(!await lessonsReady(id,pathSlug))return NextResponse.json({error:'Complete all lessons and practical tasks first.'},{status:409});
 const quiz=buildFinalQuiz(pathSlug,id);if(Object.keys(answers).length!==quiz.length||quiz.some(q=>!answers[q.id]))return NextResponse.json({error:'Answer every final assessment question.'},{status:400});
 const results=quiz.map(q=>({id:q.id,correct:answers[q.id]===q.correctOption,correctOption:q.correctOption,correctAnswer:q.options.find(o=>o.id===q.correctOption)?.text??'',explanation:q.explanation}));
 const correct=results.filter(x=>x.correct).length;const score=Math.round(correct/quiz.length*100);const passed=score>=80;
 const inserted=await sql`INSERT INTO learning_final_attempts(participant_id,path_slug,answers,score_percent,passed) VALUES(${id},${pathSlug},${JSON.stringify(answers)},${score},${passed}) RETURNING id,attempted_at`;
 let xpAwarded=0;let certificate=null;
 if(passed){xpAwarded=await awardXp(id,'learning_final_exam',pathSlug,30);certificate=await issueCertificateIfEligible(id,pathSlug);await syncAchievementsBestEffort(id);}
 return NextResponse.json({attemptId:Number(inserted[0].id),score,correct,total:quiz.length,passed,passMark:80,results,xpAwarded,feedback:passed?'Final assessment passed. Your TECHNOVA certificate is now available.':'Review your lesson notes and try the final assessment again.',certificate});
}
