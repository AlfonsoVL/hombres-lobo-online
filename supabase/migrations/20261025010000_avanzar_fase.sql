-- Paso de fases que dirige el creador: introducción → reparto → primera noche.
-- La noche por turnos, el día y las votaciones llegarán en otra migración.

create function public.avanzar_fase(p_room_code text, p_token text, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
  v_next text;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  if not v_me.is_creator then
    raise exception 'Solo el creador de la sala puede avanzar la partida' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where id = v_me.room_id for update;
  -- Evita que dos toques seguidos se salten una fase.
  if v_room.version <> p_version then
    raise exception 'La partida ya ha avanzado. Actualiza la pantalla.' using errcode = 'P0001';
  end if;

  v_next := case v_room.phase
    when 'intro' then 'role_reveal'
    when 'role_reveal' then 'night'
  end;
  if v_next is null then
    raise exception 'Esta fase todavía no se puede avanzar' using errcode = 'P0001';
  end if;

  update public.rooms
  set phase = v_next,
      round = case when v_next = 'night' then round + 1 else round end,
      version = version + 1,
      updated_at = now()
  where id = v_room.id
  returning * into v_room;

  -- Solo la fase y la ronda: nunca datos de rol.
  perform public._emit(v_room.code, 'fase_cambiada', jsonb_build_object(
    'version', v_room.version,
    'phase', v_room.phase,
    'round', v_room.round,
    'nightStep', v_room.night_step));
end;
$$;

revoke all on function public.avanzar_fase(text, text, integer) from public, anon, authenticated;
grant execute on function public.avanzar_fase(text, text, integer) to anon, authenticated;
