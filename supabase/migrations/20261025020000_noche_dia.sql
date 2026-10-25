-- Noche por turnos, amanecer, día con votación, Alcalde y fin de partida.
--
-- Reglas confirmadas:
--   * El creador pasa los turnos de la noche y las fases con un botón.
--   * El turno de un rol muerto no se narra: al morir, su rol se revela.
--   * Si muere un Enamorado, muere también el otro.
--   * Protección: no puede protegerse a sí mismo ni proteger al mismo jugador
--     dos noches seguidas (Médico). La cura de la Bruja tampoco puede ser para ella.
--   * Alcalde (opcional): se sortea entre todos al repartir y es público. Solo
--     deshace empates del día. Si muere, se sortea otro entre los vivos.
--   * Empate en el día sin Alcalde (o si el Alcalde no votó a ninguno de los
--     empatados): no muere nadie.
--
-- Nunca se emiten roles por Broadcast: solo avisos con la versión.

alter table public.rooms
  add column mayor_enabled boolean not null default false,
  add column mayor_id uuid references public.players (id) on delete set null,
  -- Cazador / Marine que tiene que disparar antes de seguir.
  add column pending_shot uuid references public.players (id) on delete set null,
  -- Víctima elegida por los malos esta noche (se fija al cerrar su turno).
  add column night_victim uuid references public.players (id) on delete set null,
  -- Jugadores muertos en la última resolución (amanecer, linchamiento o disparo).
  add column last_deaths uuid[] not null default '{}';

-- Nueva fase 'lynch': resultado de la votación del día.
alter table public.rooms drop constraint rooms_phase_check;
alter table public.rooms add constraint rooms_phase_check check (phase in (
  'lobby', 'intro', 'role_reveal', 'night', 'dawn', 'day', 'lynch', 'finished'));

-- ---------------------------------------------------------------------------
-- Funciones internas
-- ---------------------------------------------------------------------------

-- Tipo del rol actual de un jugador.
create function public._kind_of(p_player uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.kind
  from public.roles_privados rp
  join public.rooms r on r.id = rp.room_id
  join public.theme_roles t on t.theme = r.theme and t.role = rp.role
  where rp.player_id = p_player;
$$;

-- Orden de los turnos de noche. La Niña actúa durante el de los malos.
create function public._night_order()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['swap', 'link', 'bad', 'investigate', 'protect'];
$$;

-- Si en esta ronda hay turno para un tipo: algún vivo lo tiene y, para el
-- Ladrón y Cupido, solo la primera noche.
create function public._has_step(p_room public.rooms, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_room.round = 1 or p_kind not in ('swap', 'link'))
     and exists (
       select 1 from public.players p
       where p.room_id = p_room.id and p.is_alive
         and public._kind_of(p.id) = p_kind);
$$;

-- Siguiente turno de la noche después de p_after (null = el primero).
create function public._next_step(p_room public.rooms, p_after text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order text[] := public._night_order();
  v_start integer := 1;
begin
  if p_after is not null then
    v_start := array_position(v_order, p_after) + 1;
  end if;
  for i in v_start..array_length(v_order, 1) loop
    if public._has_step(p_room, v_order[i]) then
      return v_order[i];
    end if;
  end loop;
  return null;
end;
$$;

-- Si ya ha actuado quien tiene el turno actual.
create function public._step_done(p_room public.rooms)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_room.night_step
    when 'bad' then not exists (
      select 1 from public.players p
      where p.room_id = p_room.id and p.is_alive and public._kind_of(p.id) = 'bad'
        and not exists (
          select 1 from public.night_actions a
          where a.room_id = p_room.id and a.round = p_room.round
            and a.step = 'bad' and a.action = 'kill' and a.actor_id = p.id))
    else exists (
      select 1 from public.night_actions a
      where a.room_id = p_room.id and a.round = p_room.round and a.step = p_room.night_step)
  end;
$$;

-- Víctima de los malos: la más votada; si hay empate, una al azar entre las empatadas.
create function public._wolf_victim(p_room public.rooms)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  with counts as (
    select a.target_id, count(*) as n
    from public.night_actions a
    join public.players p on p.id = a.target_id and p.is_alive
    where a.room_id = p_room.id and a.round = p_room.round
      and a.step = 'bad' and a.action = 'kill'
    group by a.target_id
  )
  select target_id from counts
  where n = (select max(n) from counts)
  order by gen_random_uuid()
  limit 1;
$$;

-- Mata a un jugador y revela su rol. Arrastra al Enamorado y deja pendiente
-- el disparo del Cazador.
create function public._kill(p_room_id uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
begin
  update public.players p
  set is_alive = false,
      revealed_role = (select rp.role from public.roles_privados rp where rp.player_id = p.id)
  where p.id = p_player and p.is_alive;
  if not found then
    return;
  end if;

  update public.rooms
  set last_deaths = array_append(last_deaths, p_player)
  where id = p_room_id;

  if public._kind_of(p_player) = 'shoot_on_death' then
    update public.rooms set pending_shot = p_player where id = p_room_id;
  end if;

  select case when l.player_a = p_player then l.player_b else l.player_a end
  into v_partner
  from public.links l
  where l.room_id = p_room_id and p_player in (l.player_a, l.player_b);
  if v_partner is not null then
    perform public._kill(p_room_id, v_partner);
  end if;
end;
$$;

-- Si el Alcalde ha muerto, se sortea otro entre los vivos.
create function public._fix_mayor(p_room_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rooms r
  set mayor_id = (
    select p.id from public.players p
    where p.room_id = r.id and p.is_alive
    order by gen_random_uuid() limit 1)
  where r.id = p_room_id and r.mayor_enabled
    and (r.mayor_id is null
         or not exists (select 1 from public.players p where p.id = r.mayor_id and p.is_alive));
$$;

-- Bando ganador o null. Mismas reglas que src/lib/game/victory.ts.
create function public._winner(p_room_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link public.links;
  v_alive integer;
  v_bad integer;
begin
  select count(*), count(*) filter (where rp.team = 'bad')
  into v_alive, v_bad
  from public.players p
  join public.roles_privados rp on rp.player_id = p.id
  where p.room_id = p_room_id and p.is_alive;

  select * into v_link from public.links where room_id = p_room_id;
  if found
     and exists (select 1 from public.players where id = v_link.player_a and is_alive)
     and exists (select 1 from public.players where id = v_link.player_b and is_alive)
     and not exists (
       select 1 from public.players p
       where p.room_id = p_room_id and p.is_alive
         and p.id not in (v_link.player_a, v_link.player_b)
         and public._kind_of(p.id) <> 'link') then
    return 'lovers';
  end if;

  if v_bad = 0 then return 'good'; end if;
  if v_bad >= v_alive - v_bad then return 'bad'; end if;
  return null;
end;
$$;

-- Tras unas muertes: nuevo Alcalde y, si nadie tiene que disparar, fin de partida.
-- Devuelve true si la partida ha terminado.
create function public._after_deaths(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_winner text;
begin
  perform public._fix_mayor(p_room_id);
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.pending_shot is not null then
    return false;
  end if;

  v_winner := public._winner(p_room_id);
  if v_winner is null then
    return false;
  end if;

  -- Al terminar se revelan todos los roles.
  update public.players p
  set revealed_role = rp.role
  from public.roles_privados rp
  where rp.player_id = p.id and p.room_id = p_room_id;

  update public.rooms
  set phase = 'finished', winner = v_winner, night_step = null
  where id = p_room_id;
  return true;
end;
$$;

-- Sube la versión y avisa a todos de que la fase ha cambiado.
create function public._bump(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  update public.rooms
  set version = version + 1, updated_at = now()
  where id = p_room_id
  returning * into v_room;

  perform public._emit(v_room.code, 'fase_cambiada', jsonb_build_object(
    'version', v_room.version,
    'phase', v_room.phase,
    'round', v_room.round,
    'nightStep', v_room.night_step));
end;
$$;

-- Aviso sin versión: alguien ha actuado o votado y hay que pedir el estado.
create function public._touch(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  update public.rooms set updated_at = now() where id = p_room_id returning code into v_code;
  perform public._emit(v_code, 'actualizado', '{}'::jsonb);
end;
$$;

-- Resuelve la noche: víctima de los malos, pociones, protección y la Niña.
create function public._resolve_night(p_room public.rooms)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved boolean;
  v_dead uuid;
begin
  update public.rooms set last_deaths = '{}' where id = p_room.id;

  v_saved := exists (
    select 1 from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round
      and ((a.action = 'protect' and a.target_id = p_room.night_victim)
        or (a.action = 'potions' and a.target2_id = p_room.night_victim)));

  if p_room.night_victim is not null and not v_saved then
    perform public._kill(p_room.id, p_room.night_victim);
  end if;

  -- Veneno de la Bruja.
  for v_dead in
    select a.target_id from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round
      and a.action = 'potions' and a.target_id is not null
  loop
    perform public._kill(p_room.id, v_dead);
  end loop;

  -- Niña descubierta espiando.
  for v_dead in
    select a.actor_id from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round
      and a.action = 'spy' and a.target_id is null
  loop
    perform public._kill(p_room.id, v_dead);
  end loop;

  update public.rooms set phase = 'dawn', night_step = null where id = p_room.id;
  perform public._after_deaths(p_room.id);
end;
$$;

-- Resuelve la votación del día.
create function public._resolve_day(p_room public.rooms)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_tied uuid[];
  v_lynched uuid;
begin
  update public.rooms set last_deaths = '{}', phase = 'lynch' where id = p_room.id;

  select max(n) into v_max from (
    select count(*) as n from public.day_votes v
    join public.players p on p.id = v.voter_id and p.is_alive
    where v.room_id = p_room.id and v.round = p_room.round
    group by v.target_id) c;

  select array_agg(target_id) into v_tied from (
    select v.target_id from public.day_votes v
    join public.players p on p.id = v.voter_id and p.is_alive
    where v.room_id = p_room.id and v.round = p_room.round
    group by v.target_id
    having count(*) = v_max) t;

  if coalesce(array_length(v_tied, 1), 0) = 1 then
    v_lynched := v_tied[1];
  elsif coalesce(array_length(v_tied, 1), 0) > 1 and p_room.mayor_id is not null then
    -- El Alcalde deshace el empate con su voto.
    select v.target_id into v_lynched from public.day_votes v
    where v.room_id = p_room.id and v.round = p_room.round
      and v.voter_id = p_room.mayor_id and v.target_id = any (v_tied);
  end if;

  if v_lynched is not null then
    perform public._kill(p_room.id, v_lynched);
  end if;
  perform public._after_deaths(p_room.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones públicas
-- ---------------------------------------------------------------------------

-- iniciar_partida con Alcalde opcional. El Alcalde se sortea entre todos,
-- después del reparto, y es público.
create function public.iniciar_partida(
  p_room_code text,
  p_token text,
  p_special_roles text[],
  p_bad_count integer,
  p_mayor boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.players;
begin
  perform public.iniciar_partida(p_room_code, p_token, p_special_roles, p_bad_count);
  if p_mayor then
    v_me := public._player_by_token(p_room_code, p_token);
    update public.rooms set mayor_enabled = true where id = v_me.room_id;
    perform public._fix_mayor(v_me.room_id);
  end if;
end;
$$;

-- El creador avanza la partida. p_version evita saltarse fases con dos toques.
create or replace function public.avanzar_fase(p_room_code text, p_token text, p_version integer)
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

-- Acción nocturna del jugador que tiene el turno.
--   kill (malos): p_target. Se puede cambiar el voto mientras dure el turno.
--   spy (Niña): sin objetivo. Devuelve si la descubren o qué rol ve.
--   swap (Ladrón): p_card, una de las dos cartas sin repartir.
--   link (Cupido / Androide): p_target y p_target2.
--   see (Vidente / Científico): p_target. Devuelve su rol.
--   protect (Médico): p_target.
--   potions (Bruja): p_target = envenenado, p_target2 = curado (la víctima). Ambos opcionales.
create function public.accion_nocturna(
  p_room_code text,
  p_token text,
  p_action text,
  p_target uuid default null,
  p_target2 uuid default null,
  p_card text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
  v_rp public.roles_privados;
  v_kind text;
  v_step text;
  v_cards text[];
  v_result jsonb := '{}'::jsonb;
  v_seen uuid;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id for update;
  select * into v_rp from public.roles_privados where player_id = v_me.id;
  v_kind := public._kind_of(v_me.id);

  if v_room.phase <> 'night' then
    raise exception 'Ahora no es de noche' using errcode = 'P0001';
  end if;
  if not v_me.is_alive then
    raise exception 'Los muertos no pueden actuar' using errcode = 'P0001';
  end if;

  v_step := case when v_kind = 'spy' then 'bad' else v_kind end;
  if v_step is distinct from v_room.night_step then
    raise exception 'No es tu turno' using errcode = 'P0001';
  end if;

  -- Objetivos: siempre jugadores vivos de esta sala.
  if (p_target is not null and not exists (
        select 1 from public.players where id = p_target and room_id = v_room.id and is_alive))
     or (p_target2 is not null and not exists (
        select 1 from public.players where id = p_target2 and room_id = v_room.id and is_alive)) then
    raise exception 'Elige a un jugador vivo de la partida' using errcode = '22023';
  end if;

  if v_kind <> 'bad' and exists (
      select 1 from public.night_actions
      where room_id = v_room.id and round = v_room.round and actor_id = v_me.id) then
    raise exception 'Ya has actuado esta noche' using errcode = 'P0001';
  end if;

  if p_action = 'kill' and v_kind = 'bad' then
    if p_target is null or public._kind_of(p_target) = 'bad' then
      raise exception 'Elige a una víctima que no sea de tu bando' using errcode = '22023';
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'bad', v_me.id, 'kill', p_target)
    on conflict (room_id, round, step, actor_id, action)
    do update set target_id = excluded.target_id, created_at = now();

  elsif p_action = 'spy' and v_kind = 'spy' then
    if (v_rp.power_state->>'last_spy_round')::integer = v_room.round - 1 then
      raise exception 'No puedes espiar dos noches seguidas' using errcode = 'P0001';
    end if;
    update public.roles_privados
    set power_state = power_state || jsonb_build_object('last_spy_round', v_room.round)
    where player_id = v_me.id;
    -- Con un 50 % la descubren; si no, ve a un malo o a un bueno sin rol al azar.
    if random() >= 0.5 then
      select p.id into v_seen from public.players p
      where p.room_id = v_room.id and p.is_alive and p.id <> v_me.id
        and public._kind_of(p.id) in ('bad', 'plain_good')
      order by gen_random_uuid() limit 1;
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'spy', v_me.id, 'spy', v_seen);

  elsif p_action = 'swap' and v_kind = 'swap' then
    select array_agg(role) into v_cards from public.undealt_cards where room_id = v_room.id;
    if p_card is null or not p_card = any (v_cards) then
      raise exception 'Solo puedes elegir una de las dos cartas' using errcode = '22023';
    end if;
    if (select bool_and(t.team = 'bad') from public.theme_roles t
        where t.theme = v_room.theme and t.role = any (v_cards))
       and (select team from public.theme_roles where theme = v_room.theme and role = p_card) <> 'bad' then
      raise exception 'Las dos cartas son de malo: tienes que convertirte en malo' using errcode = '22023';
    end if;
    update public.roles_privados rp
    set role = p_card,
        team = t.team,
        power_state = case when t.kind = 'protect' and v_room.theme = 'castronegro'
                           then '{"heal": true, "poison": true}'::jsonb else '{}'::jsonb end
    from public.theme_roles t
    where rp.player_id = v_me.id and t.theme = v_room.theme and t.role = p_card;
    insert into public.night_actions (room_id, round, step, actor_id, action)
    values (v_room.id, v_room.round, 'swap', v_me.id, 'swap');

  elsif p_action = 'link' and v_kind = 'link' then
    if p_target is null or p_target2 is null or p_target = p_target2 then
      raise exception 'Elige a dos jugadores distintos' using errcode = '22023';
    end if;
    insert into public.links (room_id, player_a, player_b) values (v_room.id, p_target, p_target2);
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id, target2_id)
    values (v_room.id, v_room.round, 'link', v_me.id, 'link', p_target, p_target2);

  elsif p_action = 'see' and v_kind = 'investigate' then
    if p_target is null or p_target = v_me.id then
      raise exception 'Elige a otro jugador' using errcode = '22023';
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'investigate', v_me.id, 'see', p_target);

  elsif p_action = 'protect' and v_kind = 'protect' and v_room.theme <> 'castronegro' then
    if p_target is null or p_target = v_me.id then
      raise exception 'No puedes protegerte a ti mismo' using errcode = '22023';
    end if;
    if (v_rp.power_state->>'last_protected') = p_target::text
       and (v_rp.power_state->>'last_round')::integer = v_room.round - 1 then
      raise exception 'No puedes proteger al mismo jugador dos noches seguidas' using errcode = '22023';
    end if;
    update public.roles_privados
    set power_state = power_state || jsonb_build_object(
      'last_protected', p_target, 'last_round', v_room.round)
    where player_id = v_me.id;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'protect', v_me.id, 'protect', p_target);

  elsif p_action = 'potions' and v_kind = 'protect' and v_room.theme = 'castronegro' then
    if p_target2 is not null then
      if not coalesce((v_rp.power_state->>'heal')::boolean, false) then
        raise exception 'Ya usaste la poción de cura' using errcode = 'P0001';
      end if;
      if p_target2 is distinct from v_room.night_victim then
        raise exception 'Solo puedes curar a la víctima de esta noche' using errcode = '22023';
      end if;
      if p_target2 = v_me.id then
        raise exception 'No puedes curarte a ti misma' using errcode = '22023';
      end if;
    end if;
    if p_target is not null then
      if not coalesce((v_rp.power_state->>'poison')::boolean, false) then
        raise exception 'Ya usaste la poción de veneno' using errcode = 'P0001';
      end if;
      if p_target = v_me.id then
        raise exception 'No puedes envenenarte a ti misma' using errcode = '22023';
      end if;
    end if;
    update public.roles_privados
    set power_state = power_state
      || case when p_target2 is not null then '{"heal": false}'::jsonb else '{}'::jsonb end
      || case when p_target is not null then '{"poison": false}'::jsonb else '{}'::jsonb end
    where player_id = v_me.id;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id, target2_id)
    values (v_room.id, v_room.round, 'protect', v_me.id, 'potions', p_target, p_target2);

  else
    raise exception 'Tu rol no puede hacer eso' using errcode = '42501';
  end if;

  perform public._touch(v_room.id);
  return public.mi_noche(p_room_code, p_token);
end;
$$;

-- Lo que el jugador necesita para su turno de noche. Solo datos propios.
--   state: act (le toca), wait (actúa más tarde esta noche), sleep, dead.
create function public.mi_noche(p_room_code text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
  v_rp public.roles_privados;
  v_kind text;
  v_step text;
  v_order text[] := public._night_order();
  v_state text;
  v_info jsonb := '{}'::jsonb;
  v_action public.night_actions;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id;
  select * into v_rp from public.roles_privados where player_id = v_me.id;
  if not found then
    raise exception 'La partida todavía no ha empezado' using errcode = 'P0002';
  end if;
  v_kind := public._kind_of(v_me.id);
  v_step := case when v_kind = 'spy' then 'bad' else v_kind end;

  select * into v_action from public.night_actions
  where room_id = v_room.id and round = v_room.round and actor_id = v_me.id
  order by created_at desc limit 1;

  v_state := case
    when not v_me.is_alive then 'dead'
    when v_room.phase <> 'night' or v_room.night_step is null then 'sleep'
    when v_step = v_room.night_step then 'act'
    when public._has_step(v_room, v_step)
         and coalesce(array_position(v_order, v_step), 0) > array_position(v_order, v_room.night_step)
      then 'wait'
    else 'sleep'
  end;

  if v_state = 'act' then
    v_info := case v_kind
      when 'bad' then jsonb_build_object(
        'my_target', v_action.target_id,
        -- Los malos ven los votos de sus compañeros para ponerse de acuerdo.
        'votes', coalesce((
          select jsonb_agg(jsonb_build_object('voter', p.name, 'target', a.target_id))
          from public.night_actions a join public.players p on p.id = a.actor_id
          where a.room_id = v_room.id and a.round = v_room.round
            and a.step = 'bad' and a.action = 'kill' and a.actor_id <> v_me.id), '[]'::jsonb))
      when 'spy' then jsonb_build_object(
        'can_spy', v_action.id is null
                   and (v_rp.power_state->>'last_spy_round') is distinct from (v_room.round - 1)::text,
        'done', v_action.id is not null,
        'caught', v_action.id is not null and v_action.target_id is null,
        'seen', case when v_action.target_id is not null then (
          select jsonb_build_object('id', p.id, 'name', p.name, 'role', rp.role)
          from public.players p join public.roles_privados rp on rp.player_id = p.id
          where p.id = v_action.target_id) end)
      when 'swap' then jsonb_build_object(
        'done', v_action.id is not null,
        'cards', (select jsonb_agg(role) from public.undealt_cards where room_id = v_room.id))
      when 'link' then jsonb_build_object('done', v_action.id is not null)
      when 'investigate' then jsonb_build_object(
        'done', v_action.id is not null,
        'seen', case when v_action.target_id is not null then (
          select jsonb_build_object('id', p.id, 'name', p.name, 'role', rp.role)
          from public.players p join public.roles_privados rp on rp.player_id = p.id
          where p.id = v_action.target_id) end)
      when 'protect' then jsonb_build_object(
        'done', v_action.id is not null,
        'victim', case when v_room.theme = 'castronegro' then v_room.night_victim end,
        'heal', coalesce((v_rp.power_state->>'heal')::boolean, false),
        'poison', coalesce((v_rp.power_state->>'poison')::boolean, false),
        'last_protected', case when (v_rp.power_state->>'last_round')::integer = v_room.round - 1
                               then v_rp.power_state->>'last_protected' end)
      else '{}'::jsonb
    end;
  end if;

  return jsonb_build_object(
           'state', v_state, 'kind', v_kind, 'step', v_room.night_step, 'round', v_room.round)
         || v_info;
end;
$$;

-- Voto del día. Se puede cambiar hasta que el creador cierre la votación.
create function public.votar(p_room_code text, p_token text, p_target uuid)
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
  if v_room.phase <> 'day' then
    raise exception 'Ahora no se puede votar' using errcode = 'P0001';
  end if;
  if not v_me.is_alive then
    raise exception 'Los muertos no pueden votar' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.players
                 where id = p_target and room_id = v_room.id and is_alive) then
    raise exception 'Elige a un jugador vivo de la partida' using errcode = '22023';
  end if;

  insert into public.day_votes (room_id, round, voter_id, target_id)
  values (v_room.id, v_room.round, v_me.id, p_target)
  on conflict (room_id, round, voter_id) do update set target_id = excluded.target_id;

  perform public._touch(v_room.id);
end;
$$;

-- Disparo del Cazador / Marine al morir.
create function public.disparar(p_room_code text, p_token text, p_target uuid)
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
  if v_room.pending_shot is distinct from v_me.id then
    raise exception 'Ahora no puedes disparar' using errcode = 'P0001';
  end if;
  if p_target = v_me.id or not exists (
      select 1 from public.players where id = p_target and room_id = v_room.id and is_alive) then
    raise exception 'Elige a un jugador vivo de la partida' using errcode = '22023';
  end if;

  update public.rooms set pending_shot = null where id = v_room.id;
  perform public._kill(v_room.id, p_target);
  perform public._after_deaths(v_room.id);
  perform public._bump(v_room.id);
end;
$$;

-- Estado público de la sala, ahora con Alcalde, muertes, votos y turnos.
-- Sigue sin incluir roles no revelados.
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

-- obtener_mi_rol: ahora también dice quién es tu Enamorado, si lo tienes.
create or replace function public.obtener_mi_rol(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player public.players;
  v_role public.roles_privados;
  v_room public.rooms;
begin
  select * into v_player from public.players
  where token_hash = public._token_hash(p_token);
  if not found then
    raise exception 'Token no válido' using errcode = '28000';
  end if;

  select * into v_role from public.roles_privados where player_id = v_player.id;
  if not found then
    raise exception 'La partida todavía no ha empezado' using errcode = 'P0002';
  end if;

  select * into v_room from public.rooms where id = v_player.room_id;

  return jsonb_build_object(
    'player_id', v_player.id,
    'room_code', v_room.code,
    'theme', v_room.theme,
    'role', v_role.role,
    'team', v_role.team,
    'is_alive', v_player.is_alive,
    'power_state', v_role.power_state,
    'bad_teammates', case when v_role.team = 'bad' then coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
        from public.roles_privados rp
        join public.players p on p.id = rp.player_id
        where rp.room_id = v_role.room_id
          and rp.team = 'bad'
          and rp.player_id <> v_player.id), '[]'::jsonb)
      else null end,
    'lover', (
      select jsonb_build_object('id', p.id, 'name', p.name)
      from public.links l
      join public.players p on p.id = case when l.player_a = v_player.id then l.player_b else l.player_a end
      where l.room_id = v_room.id and v_player.id in (l.player_a, l.player_b))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke all on function
  public._kind_of(uuid),
  public._night_order(),
  public._has_step(public.rooms, text),
  public._next_step(public.rooms, text),
  public._step_done(public.rooms),
  public._wolf_victim(public.rooms),
  public._kill(uuid, uuid),
  public._fix_mayor(uuid),
  public._winner(uuid),
  public._after_deaths(uuid),
  public._bump(uuid),
  public._touch(uuid),
  public._resolve_night(public.rooms),
  public._resolve_day(public.rooms),
  public.iniciar_partida(text, text, text[], integer, boolean),
  public.accion_nocturna(text, text, text, uuid, uuid, text),
  public.mi_noche(text, text),
  public.votar(text, text, uuid),
  public.disparar(text, text, uuid)
from public, anon, authenticated;

grant execute on function
  public.iniciar_partida(text, text, text[], integer, boolean),
  public.accion_nocturna(text, text, text, uuid, uuid, text),
  public.mi_noche(text, text),
  public.votar(text, text, uuid),
  public.disparar(text, text, uuid)
to anon, authenticated;
