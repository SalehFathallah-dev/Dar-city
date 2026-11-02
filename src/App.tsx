import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ReferenceProvider } from './context/ReferenceContext';
import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui';
import { isSupabaseConfigured } from './lib/supabase';
import type { Capabilities } from './lib/permissions';
import LoginPage from './pages/LoginPage';
import SetupRequired from './pages/SetupRequired';
import PendingAccess from './pages/PendingAccess';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const PlayersPage = lazy(() => import('./pages/players/PlayersPage'));
const PlayerFormPage = lazy(() => import('./pages/players/PlayerFormPage'));
const PlayerProfilePage = lazy(() => import('./pages/players/PlayerProfilePage'));
const ExaminationsPage = lazy(() => import('./pages/examinations/ExaminationsPage'));
const ExaminationFormPage = lazy(() => import('./pages/examinations/ExaminationFormPage'));
const ExaminationDetailPage = lazy(() => import('./pages/examinations/ExaminationDetailPage'));
const InjuriesPage = lazy(() => import('./pages/injuries/InjuriesPage'));
const InjuryFormPage = lazy(() => import('./pages/injuries/InjuryFormPage'));
const InjuryDetailPage = lazy(() => import('./pages/injuries/InjuryDetailPage'));
const RehabPage = lazy(() => import('./pages/rehab/RehabPage'));
const RehabDetailPage = lazy(() => import('./pages/rehab/RehabDetailPage'));
const RtpPage = lazy(() => import('./pages/rtp/RtpPage'));
const RtpFormPage = lazy(() => import('./pages/rtp/RtpFormPage'));
const RtpDetailPage = lazy(() => import('./pages/rtp/RtpDetailPage'));
const ClearancesPage = lazy(() => import('./pages/ClearancesPage'));
const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ExportsPage = lazy(() => import('./pages/ExportsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

function Guard({ need, children }: { need?: (c: Capabilities) => boolean; children: ReactNode }) {
  const { caps } = useAuth();
  if (need && !need(caps)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Shell() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-brand-charcoal"><Spinner label="Loading secure session…" /></div>;
  if (!session) {
    return (
      <Routes>
        <Route path="/reset-password" element={<Suspense fallback={<Spinner />}><ResetPasswordPage /></Suspense>} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (!profile?.is_active || !profile.role) return <PendingAccess />;
  const medical = (c: Capabilities) => c.viewMedical;
  const physician = (c: Capabilities) => c.editMedical;
  return (
    <ReferenceProvider>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="players" element={<PlayersPage />} />
            <Route path="players/new" element={<Guard need={(c) => c.managePlayers}><PlayerFormPage /></Guard>} />
            <Route path="players/:id" element={<PlayerProfilePage />} />
            <Route path="players/:id/edit" element={<Guard need={(c) => c.managePlayers}><PlayerFormPage /></Guard>} />
            <Route path="examinations" element={<Guard need={medical}><ExaminationsPage /></Guard>} />
            <Route path="examinations/new" element={<Guard need={physician}><ExaminationFormPage /></Guard>} />
            <Route path="examinations/:id" element={<Guard need={medical}><ExaminationDetailPage /></Guard>} />
            <Route path="examinations/:id/edit" element={<Guard need={physician}><ExaminationFormPage /></Guard>} />
            <Route path="injuries" element={<Guard need={medical}><InjuriesPage /></Guard>} />
            <Route path="injuries/new" element={<Guard need={physician}><InjuryFormPage /></Guard>} />
            <Route path="injuries/:id" element={<Guard need={medical}><InjuryDetailPage /></Guard>} />
            <Route path="injuries/:id/edit" element={<Guard need={physician}><InjuryFormPage /></Guard>} />
            <Route path="rehabilitation" element={<Guard need={medical}><RehabPage /></Guard>} />
            <Route path="rehabilitation/:id" element={<Guard need={medical}><RehabDetailPage /></Guard>} />
            <Route path="return-to-play" element={<Guard need={medical}><RtpPage /></Guard>} />
            <Route path="return-to-play/new" element={<Guard need={physician}><RtpFormPage /></Guard>} />
            <Route path="return-to-play/:id" element={<Guard need={medical}><RtpDetailPage /></Guard>} />
            <Route path="clearances" element={<Guard need={medical}><ClearancesPage /></Guard>} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="documents" element={<Guard need={medical}><DocumentsPage /></Guard>} />
            <Route path="analytics" element={<Guard need={(c) => c.viewAnalytics}><AnalyticsPage /></Guard>} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="exports" element={<ExportsPage />} />
            <Route path="admin" element={<Guard need={(c) => c.manageUsers || c.manageSeasons}><AdminPage /></Guard>} />
            <Route path="audit" element={<Guard need={(c) => c.viewAudit}><AuditPage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ReferenceProvider>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  );
}
