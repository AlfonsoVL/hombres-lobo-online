// Formulario para unirse a una sala con el enlace.
import { useState } from 'react';
import { initialsPhoto } from '../lib/foto/foto';
import AudioUnlock from './AudioUnlock';
import Camera from './Camera';
import { Button, Card, ErrorText, NameField, Ornament, Title } from './ui';

export default function JoinForm({ code, onJoin }: { code: string; onJoin: (name: string, photo: string | null) => Promise<void> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Escribe tu nombre.');
    setBusy(true);
    setError('');
    try {
      await onJoin(name.trim(), photo ?? (color ? initialsPhoto(name.trim(), color) : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido entrar en la sala.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 pt-6 text-center">
        <Title className="text-4xl">¡Únete a la partida!</Title>
        <p className="text-stone-200">Te han invitado a jugar a Hombres lobo online.</p>
        <Ornament>SALA {code}</Ornament>
      </header>
      <div className="self-center">
        <AudioUnlock />
      </div>
      <Card className="flex flex-col gap-5">
        <NameField value={name} onChange={setName} />
        <Camera name={name} photo={photo} onChange={setPhoto} color={color} onColor={setColor} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Unirme a la partida'}
        </Button>
      </Card>
    </form>
  );
}
