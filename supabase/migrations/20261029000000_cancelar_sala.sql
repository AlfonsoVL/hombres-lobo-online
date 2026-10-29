-- El creador puede cancelar la sala mientras está en la sala de espera. Se
-- avisa a los demás por Broadcast y se borra la sala con todos sus datos.

create function public.cancel_room(p_room_code text, p_token text)
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
    raise exception 'Solo el creador puede cancelar la sala' using errcode = '42501';
  end if;
  if v_room.phase <> 'lobby' then
    raise exception 'La partida ya ha empezado' using errcode = 'P0001';
  end if;

  perform public._emit(v_room.code, 'sala_cancelada', jsonb_build_object('version', v_room.version + 1));
  delete from public.rooms where id = v_room.id;
end;
$$;

revoke all on function public.cancel_room(text, text) from public, anon, authenticated;
grant execute on function public.cancel_room(text, text) to anon, authenticated;
