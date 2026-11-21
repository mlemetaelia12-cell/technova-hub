import { sql } from '@/lib/db';

export async function recordAdminAction(action: string, detail: Record<string, string | number | boolean | null>) {
  try {
    await sql`INSERT INTO admin_audit_log(action,detail) VALUES(${action},${JSON.stringify(detail)})`;
  } catch (error) {
    // Auditing should be observable but must not mask the primary admin operation.
    console.error('Admin audit log write failed', error);
  }
}
