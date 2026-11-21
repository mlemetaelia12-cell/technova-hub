import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { recordAdminAction } from '@/lib/admin-audit';

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await sql`SELECT p.public_id,p.display_name,p.anonymous,p.is_blocked,p.created_at,COALESCE(SUM(a.points),0)::int AS total_points,COUNT(a.id)::int AS answered,(COUNT(a.id) FILTER (WHERE a.is_correct))::int AS correct FROM participants p LEFT JOIN challenge_attempts a ON a.participant_id=p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 500`;
    return NextResponse.json({ participants: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not load participants' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { publicId, isBlocked } = body as { publicId?: unknown; isBlocked?: unknown };
    if (typeof publicId !== 'string' || !/^TN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(publicId) || typeof isBlocked !== 'boolean') {
      return NextResponse.json({ error: 'A valid participant ID and status are required' }, { status: 400 });
    }
    const rows = await sql`UPDATE participants SET is_blocked=${isBlocked} WHERE public_id=${publicId} RETURNING public_id,is_blocked`;
    if (!rows.length) return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    await recordAdminAction(isBlocked ? 'participant.blocked' : 'participant.unblocked', { publicId });
    return NextResponse.json({ participant: rows[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not update participant' }, { status: 500 });
  }
}
