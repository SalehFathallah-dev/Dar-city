import { Logo } from '../components/ui';

export default function SetupRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-black p-6">
      <div className="max-w-xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-4 flex items-center gap-4"><Logo size={64} /><h1 className="font-display text-2xl font-bold uppercase">Supabase connection required</h1></div>
        <p className="text-sm text-neutral-700">This application stores all medical records in a secure Supabase database. No connection has been configured yet, so nothing can be saved.</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
          <li>Create a Supabase project and run the SQL migrations in <code>supabase/migrations</code>.</li>
          <li>Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Restart the application (or set the same variables in Vercel and redeploy).</li>
        </ol>
        <p className="mt-4 text-xs text-neutral-500">See <code>docs/SETUP.md</code> for the full step-by-step guide.</p>
      </div>
    </div>
  );
}
