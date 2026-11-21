import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import AdminDashboard from './dashboard-client';

export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin/login');
  return <AdminDashboard />;
}
