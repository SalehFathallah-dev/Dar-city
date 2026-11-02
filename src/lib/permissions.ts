import type { AppRole } from './constants';

/**
 * UI-level capabilities. These ONLY hide controls for convenience – the real
 * enforcement is done by PostgreSQL Row Level Security in Supabase.
 */
export function capabilities(role: AppRole | null | undefined) {
  const r = role ?? null;
  const physician = r === 'team_physician';
  const assistant = r === 'assistant_medical_staff';
  const admin = r === 'super_admin';
  const clinical = physician || assistant;
  return {
    role: r,
    isPhysician: physician,
    isAdmin: admin,
    viewMedical: clinical,
    editMedical: physician,
    addFollowups: clinical,
    uploadDocuments: clinical,
    managePlayers: physician || admin,
    viewEmergencyContacts: physician || assistant || admin || r === 'team_manager',
    updateAvailability: physician,
    viewAudit: physician || admin,
    manageUsers: admin,
    manageSettings: admin,
    manageSeasons: admin || physician,
    exportMedical: clinical,
    fullBackup: physician,
    viewAnalytics: clinical,
  };
}
export type Capabilities = ReturnType<typeof capabilities>;
