import { sql } from './db';
import { tanzaniaDate } from './dates';

export async function getTodayChallenge() {
  const date = tanzaniaDate();
  const rows = await sql`SELECT dc.id, dc.challenge_date, dc.status, q.id AS question_id, q.question_code, q.category, q.difficulty, q.question_type, q.prompt, q.scenario, q.options, dcp.position, dcp.points FROM daily_challenges dc JOIN daily_challenge_questions dcp ON dcp.challenge_id=dc.id JOIN questions q ON q.id=dcp.question_id WHERE dc.challenge_date=${date} AND dc.status='published' ORDER BY dcp.position`;
  // Normalize BIGSERIAL/SMALLINT values for a predictable JSON API contract.
  const questions = rows.map((row) => ({
    ...row,
    question_id: Number(row.question_id),
    position: Number(row.position),
    points: Number(row.points),
  }));
  return { date, questions };
}
