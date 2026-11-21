import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
import {syncAchievementsBestEffort} from '@/lib/achievements';
import {tanzaniaDate} from '@/lib/dates';
import {sameOrigin,forbiddenOrigin} from '@/lib/security';
const schema=z.object({missionKey:z.enum(['daily_challenge','lesson_checkpoint','practical_task'])});
const reward={daily_challenge:10,lesson_checkpoint:15,practical_task:20} as const;
export async function POST(req:Request){
 if(!sameOrigin(req))return forbiddenOrigin();const session=await getSession();if(session?.role!=='participant')return NextResponse.json({error:'Sign in required'},{status:401});
 let raw:unknown;try{raw=await req.json();}catch{return NextResponse.json({error:'Invalid request body'},{status:400});}const parsed=schema.safeParse(raw);if(!parsed.success)return NextResponse.json({error:'Unknown daily mission'},{status:400});
 const id=Number(session.sub);const date=tanzaniaDate();const key=parsed.data.missionKey;const xp=reward[key];
 try{
  const result=await sql`WITH eligibility AS (
    SELECT CASE
      WHEN ${key}='daily_challenge' THEN EXISTS(SELECT 1 FROM daily_challenges dc JOIN challenge_attempts a ON a.challenge_id=dc.id WHERE dc.challenge_date=${date}::date AND a.participant_id=${id} GROUP BY dc.id HAVING COUNT(*)>=5)
      WHEN ${key}='lesson_checkpoint' THEN EXISTS(SELECT 1 FROM learning_checkpoint_attempts WHERE participant_id=${id} AND passed=true AND (attempted_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date=${date}::date)
      WHEN ${key}='practical_task' THEN EXISTS(SELECT 1 FROM learning_practical_submissions WHERE participant_id=${id} AND passed=true AND (submitted_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date=${date}::date)
      ELSE FALSE END AS completed
  ), claim AS (
    INSERT INTO daily_mission_claims(participant_id,mission_date,mission_key,reward_xp)
    SELECT ${id},${date}::date,${key},${xp} FROM eligibility WHERE completed=true
    ON CONFLICT(participant_id,mission_date,mission_key) DO NOTHING RETURNING reward_xp
  ), reward AS (
    INSERT INTO xp_rewards(participant_id,source_type,source_key,amount)
    SELECT ${id},'daily_mission',${date+':'+key},reward_xp FROM claim
    ON CONFLICT(participant_id,source_type,source_key) DO NOTHING RETURNING amount
  ) SELECT (SELECT completed FROM eligibility) AS eligible,(SELECT amount FROM reward LIMIT 1) AS awarded`;
  if(!result[0]?.eligible)return NextResponse.json({error:'Complete this mission before claiming its reward.'},{status:409});
  const awarded=Number(result[0]?.awarded??0);if(!awarded)return NextResponse.json({error:'This mission reward has already been claimed.'},{status:409});
  await syncAchievementsBestEffort(id);
  return NextResponse.json({claimed:true,missionKey:key,xpAwarded:awarded,date});
 }catch(error){console.error(error);return NextResponse.json({error:'Could not claim mission reward'},{status:500});}
}
