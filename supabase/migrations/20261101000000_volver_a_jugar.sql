-- Volver a jugar con los mismos participantes.
--
--   * volver_a_jugar: con la partida terminada, el creador devuelve la sala a la
--     sala de espera. Se borra todo lo de la partida (roles, acciones, votos,
--     pareja, crónica) y todos vuelven a estar vivos y sin rol revelado. Se
--     conservan la sala, el enlace, los jugadores y el tiempo de votación, y
--     pueden entrar jugadores nuevos.
--   * quitar_jugador: en la sala de espera el creador puede quitar a quien no
--     vaya a jugar. Se avisa por Broadcast para que su móvil salga de la sala.

create function public.volver_a_jugar(p_room_code text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id for update;

  if not v_me.is_creator then
    raise exception 'Solo el creador puede volver a jugar' using errcode = '42501';
  end if;
  if v_room.phase <> 'finished' then
    raise exception 'La partida todavía no ha terminado' using errcode = 'P0001';
  end if;

  delete from public.roles_privados where room_id = v_room.id;
  delete from public.undealt_cards where room_id = v_room.id;
  delete from public.night_actions where room_id = v_room.id;
  delete from public.day_votes where room_id = v_room.id;
  delete from public.bad_reactions where room_id = v_room.id;
  delete from public.links where room_id = v_room.id;
  delete from public.game_log where room_id = v_room.id;

  update public.players set is_alive = true, revealed_role = null where room_id = v_room.id;

  update public.rooms
  set phase = 'lobby', night_step = null, round = 0, winner = null,
      mayor_enabled = false, mayor_id = null, pending_shot = null,
      night_victim = null, last_deaths = '{}'
  where id = v_room.id;

  perform public._bump(v_room.id);
end;
$$;

create function public.quitar_jugador(p_room_code text, p_token text, p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id for update;

  if not v_me.is_creator then
    raise exception 'Solo el creador puede quitar jugadores' using errcode = '42501';
  end if;
  if v_room.phase <> 'lobby' then
    raise exception 'Solo se puede quitar jugadores en la sala de espera' using errcode = 'P0001';
  end if;
  if p_player = v_me.id then
    raise exception 'No puedes quitarte a ti mismo' using errcode = '22023';
  end if;

  delete from public.players where id = p_player and room_id = v_room.id;
  if not found then
    raise exception 'Ese jugador no está en la sala' using errcode = '22023';
  end if;

  update public.rooms set version = version + 1, updated_at = now()
  where id = v_room.id
  returning * into v_room;
  perform public._emit(v_room.code, 'jugador_quitado',
    jsonb_build_object('id', p_player, 'version', v_room.version));
end;
$$;

revoke all on function
  public.volver_a_jugar(text, text),
  public.quitar_jugador(text, text, uuid)
from public, anon, authenticated;

grant execute on function
  public.volver_a_jugar(text, text),
  public.quitar_jugador(text, text, uuid)
to anon, authenticated;
