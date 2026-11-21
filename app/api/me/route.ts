import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import { tanzaniaDate } from '@/lib/dates';
import { syncAchievements } from '@/lib/achievements';

export async function GET() {
  const session = await getSession();
  if (session?.role !== 'participant') return NextResponse.json({ participant: null });
  try {
    const rows = await sql`SELECT id,public_id,username,display_name,anonymous,created_at FROM participants WHERE id=${Number(session.sub)} AND is_blocked=false LIMIT 1`;
    const participant = rows[0];
    if (!participant) return NextResponse.json({ participant: null });
    const stats = await sql`SELECT COALESCE(SUM(points),0)::int AS challenge_xp,COUNT(*)::int AS answered,COUNT(*) FILTER (WHERE is_correct)::int AS correct,COUNT(DISTINCT question_id)::int AS unique_questions,MAX(answered_at) AS last_answered FROM challenge_attempts WHERE participant_id=${Number(session.sub)}`;
    const rewardStats = await sql`SELECT COALESCE(SUM(amount),0)::int AS reward_xp FROM xp_rewards WHERE participant_id=${Number(session.sub)}`;
    const completed = await sql`SELECT COUNT(*)::int AS count FROM (SELECT challenge_id FROM challenge_attempts WHERE participant_id=${Number(session.sub)} GROUP BY challenge_id HAVING COUNT(*) >= 5) completed_challenges`;
    const todayRows = await sql`SELECT COUNT(*)::int AS count FROM challenge_attempts WHERE participant_id=${Number(session.sub)} AND (answered_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date=${tanzaniaDate()}::date`;
    const dates = await sql`SELECT DISTINCT (answered_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date::text AS day FROM challenge_attempts WHERE participant_id=${Number(session.sub)} ORDER BY day DESC LIMIT 400`;
    const recent = await sql`SELECT q.category,q.question_code,a.is_correct,a.points,a.answered_at FROM challenge_attempts a JOIN questions q ON q.id=a.question_id WHERE a.participant_id=${Number(session.sub)} ORDER BY a.answered_at DESC LIMIT 6`;
    const achievements = await syncAchievements(Number(session.sub));
    const learningStats = await sql`SELECT (SELECT COUNT(*)::int FROM learning_checkpoint_attempts WHERE participant_id=${Number(session.sub)} AND passed=true) AS checkpoints,(SELECT COUNT(*)::int FROM learning_practical_submissions WHERE participant_id=${Number(session.sub)} AND passed=true) AS practicals,(SELECT COUNT(*)::int FROM certificates WHERE participant_id=${Number(session.sub)}) AS certificates`;
    const xp = Number(stats[0]?.challenge_xp ?? 0) + Number(rewardStats[0]?.reward_xp ?? 0);
    const level = Math.floor(xp / 100) + 1;
    const daySet = new Set(dates.map(row => String(row.day).slice(0,10)));
    let streak = 0;
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const cursor = new Date(`${today}T12:00:00+03:00`);
    if (!daySet.has(today)) cursor.setDate(cursor.getDate()-1);
    while (daySet.has(cursor.toISOString().slice(0,10))) { streak++; cursor.setDate(cursor.getDate()-1); }
    return NextResponse.json({ participant, achievements, stats: { xp, level, xpIntoLevel: xp % 100, nextLevelXp: 100, answered: Number(stats[0]?.answered ?? 0), correct: Number(stats[0]?.correct ?? 0), accuracy: Number(stats[0]?.answered ? Math.round(Number(stats[0].correct) / Number(stats[0].answered) * 100) : 0), completedChallenges: Number(completed[0]?.count ?? 0), todayAnswered: Number(todayRows[0]?.count ?? 0), checkpoints: Number(learningStats[0]?.checkpoints ?? 0), practicals: Number(learningStats[0]?.practicals ?? 0), certificates: Number(learningStats[0]?.certificates ?? 0), streak, recent } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not load profile statistics' }, { status: 500 });
  }
}
