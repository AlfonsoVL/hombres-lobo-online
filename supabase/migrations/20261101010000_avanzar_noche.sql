-- La noche avanza sin depender del creador, que también juega con los ojos
-- cerrados. Se pasa al turno siguiente (o al amanecer) por tres vías:
--
--   1. Se acaba la cuenta atrás. Todos los turnos de noche duran 60 s, no solo
--      el de los malos. Al acabarse ya no se puede actuar.
--   2. El rol activo ha hecho y confirmado su acción (los malos, cuando
--      coinciden todos). La Vidente / Científico no pasa sola: confirma que ha
--      visto el rol con el botón de la vía 3.
--   3. El rol activo pulsa «Siguiente turno», haya actuado o no. Los malos no
--      tienen este botón: uno solo cortaría la votación de sus compañeros.
--
-- Cualquier móvil de la sala puede pedir el avance (avanzar_noche); el servidor
-- solo lo hace si se cumple alguna de las tres vías. El creador sigue pudiendo
-- saltar un turno con avanzar_fase.

-- Cuándo se acaba el turno de noche actual (null si no es de noche).
create function public._night_ends_at(p_room public.rooms)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_room.phase = 'night' and p_room.night_step is not null
              then p_room.step_started_at + interval '60 seconds' end;
$$;

create function public._night_time_up(p_room public.rooms)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(now() >= public._night_ends_at(p_room), false);
$$;

-- Con el tiempo del turno acabado ya no se puede actuar.
create function public._night_action_in_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._night_time_up((select r from public.rooms r where r.id = new.room_id)) then
    raise exception 'Se ha acabado el tiempo de tu turno' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger night_actions_in_time
before insert on public.night_actions
for each row execute function public._night_action_in_time();

-- Pasa al turno siguiente o, si era el último, resuelve la noche.
create function public._next_night_step(p_room public.rooms)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms := p_room;
  v_next text;
begin
  -- Al cerrar el turno de los malos se fija su víctima.
  if v_room.night_step = 'bad' then
    update public.rooms set night_victim = public._wolf_victim(v_room)
    where id = v_room.id
    returning * into v_room;
  end if;
  v_next := public._next_step(v_room, v_room.night_step);
  if v_next is null then
    perform public._resolve_night(v_room);
  else
    update public.rooms set night_step = v_next where id = v_room.id;
  end if;
end;
$$;

-- avanzar_fase: igual que antes; la noche usa _next_night_step.
create or replace function public.avanzar_fase(p_room_code text, p_token text, p_version integer)
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
  if not v_me.is_creator then
    raise exception 'Solo el creador de la sala puede avanzar la partida' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where id = v_me.room_id for update;
  if v_room.version <> p_version then
    raise exception 'La partida ya ha avanzado. Actualiza la pantalla.' using errcode = 'P0001';
  end if;
  if v_room.pending_shot is not null then
    raise exception 'Falta que dispare el jugador que acaba de morir' using errcode = 'P0001';
  end if;

  case v_room.phase
    when 'intro' then
      update public.rooms set phase = 'role_reveal' where id = v_room.id;

    when 'role_reveal', 'lynch' then
      update public.rooms
      set phase = 'night', round = round + 1, night_victim = null, last_deaths = '{}'
      where id = v_room.id
      returning * into v_room;
      update public.rooms set night_step = public._next_step(v_room, null) where id = v_room.id;

    when 'night' then
      perform public._next_night_step(v_room);

    when 'dawn' then
      update public.rooms set phase = 'day', last_deaths = '{}' where id = v_room.id;

    when 'day' then
      perform public._resolve_day(v_room);

    else
      raise exception 'Esta fase no se puede avanzar' using errcode = 'P0001';
  end case;

  perform public._bump(v_room.id);
end;
$$;

-- Cualquier jugador de la sala pide pasar al siguiente turno de la noche.
-- Devuelve true si ha avanzado y false si la partida ya había avanzado (otro
-- móvil se ha adelantado) o si todavía no toca. p_version evita saltarse turnos.
create function public.avanzar_noche(p_room_code text, p_token text, p_version integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
  v_active boolean;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id for update;

  if v_room.version <> p_version or v_room.phase <> 'night' or v_room.night_step is null
     or v_room.pending_shot is not null then
    return false;
  end if;

  -- Vía 3: el rol activo (no los malos) pasa el turno cuando quiere.
  v_active := v_me.is_alive and v_room.night_step <> 'bad'
              and public._kind_of(v_me.id) = v_room.night_step;

  if not (
       public._night_time_up(v_room)                                   -- vía 1
       or (public._step_done(v_room) and v_room.night_step <> 'investigate')  -- vía 2
       or v_active) then
    return false;
  end if;

  perform public._next_night_step(v_room);
  perform public._bump(v_room.id);
  return true;
end;
$$;

-- get_room: igual que antes, pero la cuenta atrás es la de cualquier turno de noche.
create or replace function public.get_room(p_room_code text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id;

  return jsonb_build_object(
    'code', v_room.code,
    'theme', v_room.theme,
    'mode', v_room.mode,
    'phase', v_room.phase,
    'night_step', v_room.night_step,
    'step_done', v_room.phase = 'night' and public._step_done(v_room),
    'step_ends_at', coalesce(public._night_ends_at(v_room), public._day_ends_at(v_room)),
    'day_minutes', v_room.day_minutes,
    'server_time', now(),
    'round', v_room.round,
    'version', v_room.version,
    'winner', v_room.winner,
    'mayor_id', v_room.mayor_id,
    'pending_shot', v_room.pending_shot,
    'last_deaths', to_jsonb(v_room.last_deaths),
    'votes', case when v_room.phase in ('day', 'lynch') then coalesce((
        select jsonb_agg(jsonb_build_object('voter', v.voter_id, 'target', v.target_id))
        from public.day_votes v
        join public.players p on p.id = v.voter_id and (p.is_alive or v_room.phase = 'lynch')
        where v.room_id = v_room.id and v.round = v_room.round), '[]'::jsonb)
      else '[]'::jsonb end,
    'me', jsonb_build_object('id', v_me.id, 'is_creator', v_me.is_creator),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'is_creator', p.is_creator,
               'is_alive', p.is_alive,
               'revealed_role', p.revealed_role)
             order by p.joined_at)
      from public.players p
      where p.room_id = v_room.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function
  public._night_ends_at(public.rooms),
  public._night_time_up(public.rooms),
  public._night_action_in_time(),
  public._next_night_step(public.rooms)
from public, anon, authenticated;

revoke all on function public.avanzar_noche(text, text, integer) from public;
grant execute on function public.avanzar_noche(text, text, integer) to anon, authenticated;
