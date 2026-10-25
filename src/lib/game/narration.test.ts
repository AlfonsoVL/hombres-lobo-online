import { describe, expect, it } from 'vitest';
import { getTheme } from '../tematicas';
import { narration, PAUSA_TRAS_CERRAR_MS, type NarrationState } from './narration';

const theme = getTheme('castronegro');
const state = (s: Partial<NarrationState>): NarrationState => ({
  phase: 'night',
  nightStep: null,
  winner: null,
  deaths: [],
  ...s,
});

describe('narración', () => {
  it('al empezar la noche manda cerrar los ojos y llama al primer turno', () => {
    const lines = narration(theme, state({ phase: 'role_reveal' }), state({ nightStep: 'link' }));
    expect(lines.map((l) => l.texto)).toEqual([
      theme.textos.cerrad_ojos.texto,
      theme.textos.turnos.cupid!.abrir.texto,
    ]);
  });

  it('entre turnos cierra el anterior y abre el siguiente', () => {
    const lines = narration(theme, state({ nightStep: 'bad' }), state({ nightStep: 'investigate' }));
    expect(lines.map((l) => l.texto)).toEqual([
      theme.textos.malos_cerrad.texto,
      theme.textos.turnos.seer!.abrir.texto,
    ]);
  });

  it('al amanecer dice los muertos con su rol', () => {
    const lines = narration(
      theme,
      state({ nightStep: 'protect' }),
      state({ phase: 'dawn', deaths: [{ name: 'Ana', role: 'seer' }] }),
    );
    expect(lines.map((l) => l.texto)).toEqual([
      theme.textos.turnos.witch!.cerrar.texto,
      theme.textos.amanecer.texto,
      'Ana, que era Vidente.',
    ]);
  });

  it('sin muertos usa el texto de amanecer sin víctima', () => {
    const lines = narration(theme, state({ nightStep: 'bad' }), state({ phase: 'dawn' }));
    expect(lines.at(-1)).toEqual(theme.textos.amanecer_sin_victima);
  });

  it('anuncia el empate del día y la victoria', () => {
    expect(narration(theme, state({ phase: 'day' }), state({ phase: 'lynch' }))[0]!.texto).toContain('empate');
    expect(narration(theme, null, state({ phase: 'finished', winner: 'lovers' }))).toEqual([
      theme.textos.victoria.lovers,
    ]);
  });

  it('deja una pausa tras cada cierre de ojos antes de llamar al siguiente', () => {
    const start = narration(theme, state({ phase: 'role_reveal' }), state({ nightStep: 'link' }));
    expect(start.map((l) => l.pausaMs)).toEqual([PAUSA_TRAS_CERRAR_MS, undefined]);
    const between = narration(theme, state({ nightStep: 'bad' }), state({ nightStep: 'investigate' }));
    expect(between.map((l) => l.pausaMs)).toEqual([PAUSA_TRAS_CERRAR_MS, undefined]);
    const dawn = narration(theme, state({ nightStep: 'protect' }), state({ phase: 'dawn' }));
    expect(dawn[0]!.pausaMs).toBe(PAUSA_TRAS_CERRAR_MS);
  });

  it('no deja pausa si después no se llama a nadie', () => {
    const lines = narration(theme, state({ nightStep: 'bad' }), state({ phase: 'finished' }));
    expect(lines).toEqual([theme.textos.malos_cerrad]);
  });

  it('no repite nada si el turno no cambia', () => {
    expect(narration(theme, state({ nightStep: 'bad' }), state({ nightStep: 'bad' }))).toEqual([]);
  });
});
