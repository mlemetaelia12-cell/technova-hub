import { NextResponse } from 'next/server';
import { getTodayChallenge } from '@/lib/challenge';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const data = await getTodayChallenge();
    const session = await getSession();
    if (session?.role !== 'participant') return NextResponse.json(data);
    const attempts = await sql`SELECT a.question_id, a.selected_option, a.is_correct, a.points, q.correct_option, q.explanation, q.learning_objective FROM challenge_attempts a JOIN questions q ON q.id=a.question_id WHERE a.participant_id=${Number(session.sub)} AND a.challenge_id=(SELECT id FROM daily_challenges WHERE challenge_date=${data.date} AND status='published' LIMIT 1)`;
    const totalScore = attempts.reduce((sum, row) => sum + Number(row.points), 0);
    const answered = Object.fromEntries(attempts.map(row => [Number(row.question_id), { selectedOption: row.selected_option, correct: row.is_correct, points: row.points, correctOption: row.correct_option, explanation: row.explanation, learningObjective: row.learning_objective, score: totalScore }]));
    return NextResponse.json({ ...data, answered });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Challenge unavailable. It may not have been scheduled yet.' }, { status: 503 });
  }
}
