import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {sql} from '@/lib/db';
import {tanzaniaDate} from '@/lib/dates';
const definitions=[
 {key:'daily_challenge',title:'Finish today’s challenge',description:'Answer all five questions in today’s challenge.',rewardXp:10,href:'/challenge'},
 {key:'lesson_checkpoint',title:'Pass a learning checkpoint',description:'Score at least 80% on one lesson checkpoint today.',rewardXp:15,href:'/learn'},
 {key:'practical_task',title:'Submit a practical task',description:'Pass one server-checked practical task today.',rewardXp:20,href:'/learn'},
] as const;
export async function GET(){
 const session=await getSession();if(session?.role!=='participant')return NextResponse.json({error:'Sign in required'},{status:401});const id=Number(session.sub);const date=tanzaniaDate();
 try{
  const [challenge,checkpoint,practical,claims]=await Promise.all([
   sql`SELECT COUNT(*)::int AS count FROM challenge_attempts a JOIN daily_challenges dc ON dc.id=a.challenge_id WHERE a.participant_id=${id} AND dc.challenge_date=${date}::date`,
   sql`SELECT EXISTS(SELECT 1 FROM learning_checkpoint_attempts WHERE participant_id=${id} AND passed=true AND (attempted_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date=${date}::date) AS done`,
   sql`SELECT EXISTS(SELECT 1 FROM learning_practical_submissions WHERE participant_id=${id} AND passed=true AND (submitted_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date=${date}::date) AS done`,
   sql`SELECT mission_key,reward_xp,claimed_at FROM daily_mission_claims WHERE participant_id=${id} AND mission_date=${date}::date`,
  ]);
  const claimed=new Map(claims.map(row=>[String(row.mission_key),row]));
  const complete={daily_challenge:Number(challenge[0]?.count??0)>=5,lesson_checkpoint:Boolean(checkpoint[0]?.done),practical_task:Boolean(practical[0]?.done)};
  const missions=definitions.map(item=>{const claim=claimed.get(item.key);return {...item,completed:complete[item.key],claimed:Boolean(claim),claimedAt:claim?.claimed_at??null,rewardXp:claim?Number(claim.reward_xp):item.rewardXp};});
  return NextResponse.json({date,missions,totalClaimed:missions.filter(m=>m.claimed).length,totalRewards:missions.filter(m=>m.claimed).reduce((n,m)=>n+m.rewardXp,0)});
 }catch(error){console.error(error);return NextResponse.json({error:'Could not load daily missions'},{status:500});}
}
