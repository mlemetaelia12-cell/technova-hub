import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [audit, attempts] = await Promise.all([
      sql`SELECT id,action,detail,created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 100`,
      sql`SELECT p.public_id,q.question_code,q.category,a.selected_option,a.is_correct,a.points,a.answered_at FROM challenge_attempts a JOIN participants p ON p.id=a.participant_id JOIN questions q ON q.id=a.question_id ORDER BY a.answered_at DESC LIMIT 100`,
    ]);
    return NextResponse.json({ audit, attempts });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not load platform activity' }, { status: 500 });
  }
}
