import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Logo } from '../../components/ui';
import ClubFormPage from './ClubFormPage';

/** Shown when the signed-in user has no club assigned yet. */
export default function NoClubPage({ hasClubs }: { hasClubs: boolean }) {
  const { caps, signOut, profile } = useAuth();
  const navigate = useNavigate();
  if (caps.manageClubs && !hasClubs) {
    return (
      <div className="min-h-screen bg-[#F6F5F0] px-4 py-8">
        <div className="mx-auto mb-6 max-w-4xl text-center"><Logo size={80} className="mx-auto" /><p className="mt-3 text-sm text-neutral-600">Register your first club to start managing medical records.</p></div>
        <ClubFormPage onCreated={() => window.location.assign('/')} />
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy p-6">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <Logo size={70} className="mx-auto" />
        <Shield className="mx-auto mt-4 h-8 w-8 text-brand-gold" />
        <h1 className="mt-2 font-display text-2xl font-bold uppercase text-brand-navy">No club assigned</h1>
        <p className="mt-2 text-sm text-neutral-600">Your account ({profile?.email}) is active but has not been assigned to a club. Please contact the physician or the Super Administrator.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => navigate(0)}>Check again</Button>
          <Button variant="dark" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
