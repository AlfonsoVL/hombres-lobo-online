// Logo de la portada: ilustración de la temática y «Hombres lobo · ONLINE».
import type { Theme } from '../lib/tematicas';
import { roleByKind } from '../lib/tematicas';
import RoleAvatar from './RoleAvatar';
import { Ornament } from './ui';

export default function Logo({ theme, small = false }: { theme: Theme; small?: boolean }) {
  const hero = theme.fondos?.portada;
  const Heading = small ? 'p' : 'h1';
  return (
    <div className="flex flex-col items-center">
      {hero ? (
        <img
          key={theme.id}
          src={hero}
          alt=""
          className={`aparecer [mask-image:radial-gradient(circle_at_50%_45%,#000_55%,transparent_72%)] ${
            small ? '-mb-4 w-44' : '-mb-6 w-72'
          }`}
        />
      ) : (
        <RoleAvatar
          key={theme.id}
          role={roleByKind(theme, 'bad')}
          size={small ? 96 : 150}
          className={`aparecer ${small ? 'mb-3' : 'mb-4'}`}
        />
      )}
      {/* En la sala el título principal es el código, así que aquí no es un h1. */}
      <Heading
        className={`titulo whitespace-nowrap font-extrabold leading-none text-amber-300 [text-shadow:0_3px_0_rgb(0_0_0/0.7),var(--brillo)] ${
          small ? 'text-4xl' : 'text-[clamp(2rem,10.5vw,3rem)]'
        }`}
      >
        Hombres lobo
      </Heading>
      <Ornament className="mt-2">ONLINE</Ornament>
    </div>
  );
}
