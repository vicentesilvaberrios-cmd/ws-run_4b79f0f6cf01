import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import DashboardHomeClient from './DashboardHomeClient';

export default async function DashboardPage() {
  const org = await getCurrentOrg();
  if (!org) return null;

  const supabase = await createClient();

  // Use local date in America/Santiago to avoid UTC drift at night
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  const startOfDay = `${today}T00:00:00.000Z`;
  const endOfDay = `${today}T23:59:59.999Z`;

  // Count services, business hours, and today's appointments
  const [
    { count: serviceCount },
    { count: hoursCount },
    { count: todayApptsCount },
  ] = await Promise.all([
    supabase.from('services').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('business_hours').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .gte('starts_at', startOfDay)
      .lte('starts_at', endOfDay),
  ]);

  const needsSetup = (serviceCount ?? 0) === 0 || (hoursCount ?? 0) === 0;

  return (
    <DashboardHomeClient
      orgName={org.name}
      slug={org.slug}
      needsSetup={needsSetup}
      todayApptsCount={todayApptsCount ?? 0}
    />
  );
}
