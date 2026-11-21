import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { questionSchema } from '@/lib/validation';
import { recordAdminAction } from '@/lib/admin-audit';

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await sql`SELECT id,question_code,category,difficulty,question_type,prompt,scenario,options,correct_option,explanation,learning_objective,source_name,source_url,status,created_at FROM questions ORDER BY created_at DESC LIMIT 500`;
    return NextResponse.json({ questions: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not load questions' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await req.json();
    const parsed = questionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const q = parsed.data;
    const rows = await sql`INSERT INTO questions(question_code,category,difficulty,question_type,prompt,scenario,options,correct_option,explanation,learning_objective,source_name,source_url,status) VALUES(${q.questionCode},${q.category},${q.difficulty},${q.questionType},${q.prompt},${q.scenario ?? null},${JSON.stringify(q.options)},${q.correctOption},${q.explanation},${q.learningObjective ?? null},${q.sourceName ?? null},${q.sourceUrl ?? null},${q.status}) RETURNING id,question_code`;
    await recordAdminAction('question.created', { questionId: Number(rows[0].id), questionCode: q.questionCode });
    return NextResponse.json({ question: rows[0] }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Question code may already exist, or the database rejected the request.' }, { status: 409 });
  }
}

export async function PATCH(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { id, question } = body as { id?: unknown; question?: unknown };
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Valid question ID is required' }, { status: 400 });
    const parsed = questionSchema.safeParse(question);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    const q = parsed.data;
    const used = await sql`SELECT 1 FROM daily_challenge_questions WHERE question_id=${id} UNION ALL SELECT 1 FROM challenge_attempts WHERE question_id=${id} LIMIT 1`;
    if (used.length) return NextResponse.json({ error: 'This question is linked to a challenge or has participant attempts. Its content is locked to preserve existing challenge history.' }, { status: 409 });
    const rows = await sql`UPDATE questions SET question_code=${q.questionCode},category=${q.category},difficulty=${q.difficulty},question_type=${q.questionType},prompt=${q.prompt},scenario=${q.scenario ?? null},options=${JSON.stringify(q.options)},correct_option=${q.correctOption},explanation=${q.explanation},learning_objective=${q.learningObjective ?? null},source_name=${q.sourceName ?? null},source_url=${q.sourceUrl ?? null},status=${q.status} WHERE id=${id} RETURNING id,question_code`;
    if (!rows.length) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    await recordAdminAction('question.updated', { questionId: id, questionCode: q.questionCode });
    return NextResponse.json({ question: rows[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not update question' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || !('id' in body)) return NextResponse.json({ error: 'Question ID is required' }, { status: 400 });
    const id = Number((body as { id: unknown }).id);
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid question ID' }, { status: 400 });
    const used = await sql`SELECT 1 FROM daily_challenge_questions WHERE question_id=${id} UNION ALL SELECT 1 FROM challenge_attempts WHERE question_id=${id} LIMIT 1`;
    if (used.length) return NextResponse.json({ error: 'This question is linked to a challenge or has participant attempts and cannot be deleted.' }, { status: 409 });
    const deleted = await sql`DELETE FROM questions WHERE id=${id} RETURNING id`;
    if (!deleted.length) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    await recordAdminAction('question.deleted', { questionId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not delete question' }, { status: 500 });
  }
}
