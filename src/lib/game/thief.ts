// Ladrón: la primera noche cambia su rol por una de las dos cartas sin repartir.
import { getRole, type Theme } from '../tematicas';
import type { Result } from './composition';

export interface ThiefOptions {
  cards: string[];
  /** Si las dos cartas son de malo, está obligado a convertirse en malo. */
  mustBeBad: boolean;
}

export function thiefOptions(theme: Theme, undealt: string[]): ThiefOptions {
  if (undealt.length !== 2) throw new Error('El Ladrón necesita exactamente 2 cartas sin repartir');
  return {
    cards: [...undealt],
    mustBeBad: undealt.every((id) => getRole(theme, id).bando === 'bad'),
  };
}

/** Comprueba la carta elegida y devuelve el nuevo rol del Ladrón. */
export function chooseThiefCard(theme: Theme, undealt: string[], choice: string): Result<string> {
  const { cards, mustBeBad } = thiefOptions(theme, undealt);
  if (!cards.includes(choice)) {
    return { ok: false, error: 'Solo puedes elegir una de las dos cartas.' };
  }
  if (mustBeBad && getRole(theme, choice).bando !== 'bad') {
    return { ok: false, error: 'Las dos cartas son de malo: tienes que convertirte en malo.' };
  }
  return { ok: true, value: choice };
}
