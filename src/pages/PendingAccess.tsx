import { Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Logo } from '../components/ui';

export default function PendingAccess() {
  const { profile, signOut, refreshProfile } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-black p-6">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <Logo size={90} className="mx-auto" />
        <Clock className="mx-auto mt-4 h-8 w-8 text-brand-orange" />
        <h1 className="mt-2 font-display text-2xl font-bold uppercase">Access pending approval</h1>
        <p className="mt-2 text-sm text-neutral-600">Your account{profile?.email ? ` (${profile.email})` : ''} has been created but has not yet been assigned a role. Please contact the Super Administrator.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => void refreshProfile()}>Check again</Button>
          <Button variant="dark" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
