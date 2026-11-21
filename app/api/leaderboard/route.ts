import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { tanzaniaDate, weekStart } from '@/lib/dates';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const today = tanzaniaDate();
    const start = weekStart(today);
    const rows = await sql`SELECT p.public_id,CASE WHEN p.anonymous THEN p.public_id ELSE p.display_name END AS display_name,COALESCE(SUM(a.points),0)::int AS points,COUNT(a.id)::int AS answered,MIN(a.answered_at) AS first_answered_at FROM participants p LEFT JOIN challenge_attempts a ON a.participant_id=p.id AND a.challenge_id IN (SELECT id FROM daily_challenges WHERE challenge_date >= ${start} AND challenge_date <= ${today}) WHERE p.is_blocked=false GROUP BY p.id HAVING COUNT(a.id) > 0 ORDER BY points DESC, first_answered_at ASC NULLS LAST, p.created_at ASC LIMIT 100`;
    const session = await getSession();
    let currentUser: { rank: number; points: number } | null = null;
    if (session?.role === 'participant') {
      const rankRows = await sql`WITH ranked AS (SELECT p.id,ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(a.points),0) DESC,MIN(a.answered_at) ASC NULLS LAST,p.created_at ASC)::int AS rank,COALESCE(SUM(a.points),0)::int AS points FROM participants p LEFT JOIN challenge_attempts a ON a.participant_id=p.id AND a.challenge_id IN (SELECT id FROM daily_challenges WHERE challenge_date >= ${start} AND challenge_date <= ${today}) WHERE p.is_blocked=false GROUP BY p.id HAVING COUNT(a.id) > 0) SELECT rank,points FROM ranked WHERE id=${Number(session.sub)} LIMIT 1`;
      if (rankRows.length) currentUser = { rank: Number(rankRows[0].rank), points: Number(rankRows[0].points) };
    }
    return NextResponse.json({ weekStart: start, participants: rows, currentUser });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Leaderboard unavailable' }, { status: 500 });
  }
}
