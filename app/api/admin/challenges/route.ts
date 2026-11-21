import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { recordAdminAction } from '@/lib/admin-audit';

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await sql`SELECT dc.id,dc.challenge_date,dc.status,COUNT(dcp.question_id)::int AS question_count FROM daily_challenges dc LEFT JOIN daily_challenge_questions dcp ON dcp.challenge_id=dc.id GROUP BY dc.id ORDER BY dc.challenge_date DESC LIMIT 90`;
    return NextResponse.json({ challenges: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not load challenges' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { date, questionIds } = body as { date?: unknown; questionIds?: unknown };
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ error: 'Provide a valid challenge date' }, { status: 400 });
    }
    if (!Array.isArray(questionIds) || questionIds.length !== 5 || !questionIds.every((id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
      return NextResponse.json({ error: 'Provide exactly five positive integer question IDs' }, { status: 400 });
    }
    const ids = questionIds as number[];
    if (new Set(ids).size !== 5) return NextResponse.json({ error: 'Question IDs must be unique' }, { status: 400 });
    const eligible = await sql`SELECT id FROM questions WHERE id = ANY(${ids}) AND status='approved'`;
    if (eligible.length !== 5) return NextResponse.json({ error: 'All five questions must exist and be approved' }, { status: 400 });
    const used = await sql`SELECT q.id,q.question_code FROM questions q WHERE q.id = ANY(${ids}) AND (EXISTS (SELECT 1 FROM daily_challenge_questions dcp JOIN daily_challenges dc ON dc.id=dcp.challenge_id WHERE dcp.question_id=q.id AND dc.challenge_date < ${date}) OR EXISTS (SELECT 1 FROM challenge_attempts a JOIN daily_challenges dc ON dc.id=a.challenge_id WHERE a.question_id=q.id AND dc.challenge_date < ${date})) LIMIT 1`;
    if (used.length) return NextResponse.json({ error: `Question ${used[0].question_code} was used before. Choose five unused questions.` }, { status: 409 });
    const existing = await sql`SELECT id FROM daily_challenges WHERE challenge_date=${date} LIMIT 1`;
    if (existing.length) return NextResponse.json({ error: 'A challenge already exists for this date. Existing schedules are preserved and cannot be overwritten.' }, { status: 409 });
    const inserted = await sql`WITH new_challenge AS (INSERT INTO daily_challenges(challenge_date,status) VALUES(${date},'published') RETURNING id) INSERT INTO daily_challenge_questions(challenge_id,question_id,position,points) SELECT new_challenge.id,schedule.question_id,schedule.position,2 FROM new_challenge CROSS JOIN (VALUES (${ids[0]}::bigint,1),(${ids[1]}::bigint,2),(${ids[2]}::bigint,3),(${ids[3]}::bigint,4),(${ids[4]}::bigint,5)) AS schedule(question_id,position) RETURNING challenge_id`;
    const challengeId = Number(inserted[0]?.challenge_id);
    if (!challengeId || inserted.length !== 5) throw new Error('Challenge schedule was not fully created');
    await recordAdminAction('challenge.published', { challengeId, date });
    return NextResponse.json({ ok: true, challengeId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not schedule challenge' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { id, status } = body as { id?: unknown; status?: unknown };
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || !['scheduled', 'published', 'closed'].includes(String(status))) {
      return NextResponse.json({ error: 'Valid challenge ID and status are required' }, { status: 400 });
    }
    const rows = await sql`UPDATE daily_challenges SET status=${String(status)} WHERE id=${id} RETURNING id,challenge_date,status`;
    if (!rows.length) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    await recordAdminAction('challenge.status_changed', { challengeId: id, status: String(status) });
    return NextResponse.json({ challenge: rows[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not update challenge status' }, { status: 500 });
  }
}
