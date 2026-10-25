// Formulario para unirse a una sala con el enlace.
import { useState } from 'react';
import AudioUnlock from './AudioUnlock';
import Camera from './Camera';
import { Button, Card, ErrorText, NameField } from './ui';

export default function JoinForm({ code, onJoin }: { code: string; onJoin: (name: string, photo: string | null) => Promise<void> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Escribe tu nombre.');
    setBusy(true);
    setError('');
    try {
      await onJoin(name.trim(), photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido entrar en la sala.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-sm uppercase tracking-widest text-stone-400">Sala</p>
        <h1 className="font-mono text-4xl font-bold tracking-[0.3em]">{code}</h1>
      </header>
      <AudioUnlock />
      <Card className="flex flex-col gap-4">
        <NameField value={name} onChange={setName} />
        <Camera name={name} photo={photo} onChange={setPhoto} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Unirme a la partida'}
        </Button>
      </Card>
    </form>
  );
}
