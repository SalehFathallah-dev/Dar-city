import { useState } from 'react';
import { FileStack } from 'lucide-react';
import { Card, Field, PageHeader } from '../components/ui';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { PlayerPicker } from '../components/PlayerPicker';

export default function DocumentsPage() {
  const [player, setPlayer] = useState('');
  return (
    <div>
      <PageHeader title="Medical Documents" subtitle="Secure, private storage for investigation results, imaging and certificates" icon={<FileStack className="h-6 w-6" />} />
      <Card>
        <Field label="Filter by player" className="mb-4 max-w-md"><PlayerPicker value={player} onChange={setPlayer} includeInactive placeholder="All players" /></Field>
        <DocumentsPanel key={player} playerId={player || undefined} showPlayer={!player} />
      </Card>
    </div>
  );
}
