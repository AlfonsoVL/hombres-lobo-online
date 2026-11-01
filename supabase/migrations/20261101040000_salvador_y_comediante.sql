-- Dos aldeanos más para La Aldea Maldita, solo en modo personalizado.
--
--   * Salvador (guardian, tipo guard): cada noche, antes que los lobos,
--     protege a un jugador (puede ser él mismo) contra el ataque de los lobos
--     (la manada y el Lobo Feroz): no muere ni se infecta. No puede proteger
--     al mismo jugador dos noches seguidas. No protege del veneno.
--   * Comediante (actor, tipo actor): al repartir se apartan 3 cartas de
--     aldeanos con poder nocturno que no están en juego (Vidente, Flautista,
--     Bruja o Salvador). Cada noche, tras el Flautista, elige una y usa su
--     poder esa noche. Cada carta sirve una sola vez; sin cartas, no tiene turno.
--
-- Si la aldea mata al Anciano, los dos pierden sus poderes como el resto.

alter table public.theme_roles drop constraint theme_roles_kind_check;
alter table public.theme_roles add constraint theme_roles_kind_check check (kind in (
  'bad', 'plain_good', 'investigate', 'protect', 'shoot_on_death', 'link', 'spy', 'swap',
  'fierce', 'infect', 'white', 'disguised',
  'rusty_sword', 'elder', 'idiot', 'scapegoat', 'compare',
  'guard', 'actor'));

insert into public.theme_roles (theme, role, kind, team, classic) values
  ('castronegro', 'guardian', 'guard', 'good', false),
  ('castronegro', 'actor',    'actor', 'good', false);

create or replace function public._night_order()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['swap', 'link', 'guard', 'bad', 'infect', 'fierce', 'white',
               'investigate', 'compare', 'actor', 'protect'];
$$;

-- Hasta 3 cartas para el Comediante: aldeanos con poder nocturno de la
-- temática que nadie tiene en la partida, al azar.
create function public._actor_cards(p_room public.rooms)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c.role), '[]'::jsonb)
  from (
    select t.role from public.theme_roles t
    where t.theme = p_room.theme and t.team = 'good'
      and t.kind in ('investigate', 'compare', 'protect', 'guard')
      and not exists (
        select 1 from public.roles_privados rp
        where rp.room_id = p_room.id and rp.role = t.role)
    order by gen_random_uuid()
    limit 3) c;
$$;

-- _has_step: igual que antes; sin poderes tampoco actúan el Salvador ni el
-- Comediante, y el Comediante solo tiene turno si le quedan cartas.
create or replace function public._has_step(p_room public.rooms, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_room.round = 1 or p_kind not in ('swap', 'link'))
     and (p_kind <> 'white' or p_room.round % 2 = 0)
     and (p_kind <> 'fierce' or not public._bad_died(p_room.id))
     and (p_kind not in ('swap', 'link', 'guard', 'investigate', 'compare', 'actor', 'protect')
          or not public._powers_lost(p_room.id))
     and (p_kind <> 'actor' or exists (
       select 1 from public.players p
       join public.roles_privados rp on rp.player_id = p.id
       where p.room_id = p_room.id and p.is_alive and public._kind_of(p.id) = 'actor'
         and jsonb_array_length(coalesce(rp.power_state->'cards', '[]'::jsonb)) > 0))
     and (p_kind not in ('bad', 'fierce') or exists (
       select 1 from public.players p
       where p.room_id = p_room.id and p.is_alive and not public._is_bad(p.id)))
     and exists (
       select 1 from public.players p
       where p.room_id = p_room.id and p.is_alive
         and case when p_kind = 'bad' then public._is_bad(p.id)
                  else public._kind_of(p.id) = p_kind end);
$$;

-- _resolve_night: igual que antes, pero el Salvador protege de los lobos.
create or replace function public._resolve_night(p_room public.rooms)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_infected boolean := public._infected_tonight(p_room);
  v_fierce uuid := public._fierce_victim(p_room);
  v_dead uuid;
  -- Protegidos por el Salvador (o el Comediante con su carta) esta noche.
  v_guarded uuid[] := array(
    select a.target_id from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round and a.action = 'guard');
begin
  update public.rooms set last_deaths = '{}' where id = p_room.id;

  if p_room.night_victim is not null then
    insert into public.game_log (room_id, round, event, player_id)
    values (p_room.id, p_room.round, 'attack', p_room.night_victim);
  end if;

  -- Protegida por el Salvador: el ataque fracasa (ni muere ni se infecta).
  if p_room.night_victim = any (v_guarded) then
    null;
  -- Infección: la víctima no muere y se convierte en Lobo.
  elsif v_infected and p_room.night_victim is not null then
    update public.roles_privados rp
    set role = t.role, team = 'bad',
        power_state = jsonb_build_object('infected_round', p_room.round)
    from public.theme_roles t
    where rp.player_id = p_room.night_victim and t.theme = p_room.theme and t.kind = 'bad';
  elsif p_room.night_victim is not null and not exists (
      select 1 from public.night_actions a
      where a.room_id = p_room.id and a.round = p_room.round
        and ((a.action = 'protect' and a.target_id = p_room.night_victim)
          or (a.action = 'potions' and a.target2_id = p_room.night_victim))) then
    -- El Anciano resiste el primer ataque.
    if not public._elder_resists(p_room, p_room.night_victim) then
      perform public._kill(p_room.id, p_room.night_victim);
    end if;
  end if;

  -- Segunda víctima del Lobo Feroz, salvo que la Bruja la cure.
  if v_fierce is not null and not v_fierce = any (v_guarded) and not exists (
      select 1 from public.night_actions a
      where a.room_id = p_room.id and a.round = p_room.round
        and a.action = 'potions' and a.target2_id = v_fierce) then
    if not public._elder_resists(p_room, v_fierce) then
      perform set_config('lobos.causa', 'fierce', true);
      perform public._kill(p_room.id, v_fierce);
      perform set_config('lobos.causa', '', true);
    end if;
  end if;

  -- Veneno de la Bruja.
  for v_dead in
    select a.target_id from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round
      and a.action = 'potions' and a.target_id is not null
  loop
    perform set_config('lobos.causa', 'poisoned', true);
    perform public._kill(p_room.id, v_dead);
    perform set_config('lobos.causa', '', true);
  end loop;

  -- Lobo Blanco.
  for v_dead in
    select a.target_id from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round
      and a.action = 'white_kill' and a.target_id is not null
  loop
    perform set_config('lobos.causa', 'white', true);
    perform public._kill(p_room.id, v_dead);
    perform set_config('lobos.causa', '', true);
  end loop;

  -- Niña descubierta espiando.
  for v_dead in
    select a.actor_id from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round
      and a.action = 'spy' and a.target_id is null
  loop
    perform set_config('lobos.causa', 'spied', true);
    perform public._kill(p_room.id, v_dead);
    perform set_config('lobos.causa', '', true);
  end loop;

  -- Tétanos del Caballero: el lobo contagiado la noche anterior.
  for v_dead in
    select rp.player_id from public.roles_privados rp
    where rp.room_id = p_room.id
      and (rp.power_state->>'tetanus_round')::integer = p_room.round
  loop
    perform set_config('lobos.causa', 'tetanus', true);
    perform public._kill(p_room.id, v_dead);
    perform set_config('lobos.causa', '', true);
  end loop;

  update public.rooms set phase = 'dawn', night_step = null where id = p_room.id;
  perform public._after_deaths(p_room.id);
end;
$$;

-- accion_nocturna: igual que antes, más el Salvador (guard) y el Comediante
-- (p_card: la carta que usa, y la acción de esa carta).
create or replace function public.accion_nocturna(
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
  v_pack boolean;
  v_cards text[];
  v_seen uuid;
  v_victims uuid[];
  -- El Comediante usa el poder de una de sus cartas.
  v_actor boolean := false;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id for update;
  select * into v_rp from public.roles_privados where player_id = v_me.id;
  v_kind := public._kind_of(v_me.id);
  v_pack := public._is_bad(v_me.id);

  if v_room.phase <> 'night' then
    raise exception 'Ahora no es de noche' using errcode = 'P0001';
  end if;
  if not v_me.is_alive then
    raise exception 'Los muertos no pueden actuar' using errcode = 'P0001';
  end if;

  if not (case when v_room.night_step = 'bad'
               then (v_pack and p_action = 'kill') or (v_kind = 'spy' and p_action = 'spy')
               else v_kind = v_room.night_step end) then
    raise exception 'No es tu turno' using errcode = 'P0001';
  end if;

  if (p_target is not null and not exists (
        select 1 from public.players where id = p_target and room_id = v_room.id and is_alive))
     or (p_target2 is not null and not exists (
        select 1 from public.players where id = p_target2 and room_id = v_room.id and is_alive)) then
    raise exception 'Elige a un jugador vivo de la partida' using errcode = '22023';
  end if;

  if p_action <> 'kill' and exists (
      select 1 from public.night_actions
      where room_id = v_room.id and round = v_room.round and actor_id = v_me.id
        and step = case when v_kind = 'spy' then 'spy' else v_room.night_step end) then
    raise exception 'Ya has actuado esta noche' using errcode = 'P0001';
  end if;

  if v_kind = 'actor' then
    if p_card is null or not coalesce(v_rp.power_state->'cards', '[]'::jsonb) ? p_card then
      raise exception 'Elige una de tus cartas' using errcode = '22023';
    end if;
    select t.kind into v_kind from public.theme_roles t where t.theme = v_room.theme and t.role = p_card;
    v_actor := true;
    update public.roles_privados
    set power_state = jsonb_set(power_state, '{cards}', (power_state->'cards') - p_card)
                      || jsonb_build_object('last_card', p_card)
    where player_id = v_me.id;
  end if;

  if p_action = 'kill' and v_pack and v_room.night_step = 'bad' then
    if p_target is null or public._is_bad(p_target) then
      raise exception 'Elige a una víctima que no sea de tu bando' using errcode = '22023';
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'bad', v_me.id, 'kill', p_target)
    on conflict (room_id, round, step, actor_id, action)
    do update set target_id = excluded.target_id, created_at = now();

  elsif p_action = 'spy' and v_kind = 'spy' then
    if public._powers_lost(v_room.id) then
      raise exception 'Los aldeanos han perdido sus poderes' using errcode = 'P0001';
    end if;
    if (v_rp.power_state->>'last_spy_round')::integer = v_room.round - 1 then
      raise exception 'No puedes espiar dos noches seguidas' using errcode = 'P0001';
    end if;
    update public.roles_privados
    set power_state = power_state || jsonb_build_object('last_spy_round', v_room.round)
    where player_id = v_me.id;
    if random() >= 0.5 then
      select p.id into v_seen from public.players p
      where p.room_id = v_room.id and p.is_alive and p.id <> v_me.id
        and (public._is_bad(p.id) or public._kind_of(p.id) = 'plain_good')
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
                             then '{"heal": true, "poison": true}'::jsonb
                           when t.kind = 'actor'
                             then jsonb_build_object('cards', public._actor_cards(v_room))
                           else '{}'::jsonb end
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
    values (v_room.id, v_room.round, v_room.night_step, v_me.id, 'see', p_target);

  elsif p_action = 'compare' and v_kind = 'compare' then
    if p_target is null or p_target2 is null or p_target = p_target2
       or v_me.id in (p_target, p_target2) then
      raise exception 'Elige a otros dos jugadores distintos' using errcode = '22023';
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id, target2_id)
    values (v_room.id, v_room.round, v_room.night_step, v_me.id, 'compare', p_target, p_target2);

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
      if not v_actor and not coalesce((v_rp.power_state->>'heal')::boolean, false) then
        raise exception 'Ya usaste la poción de cura' using errcode = 'P0001';
      end if;
      v_victims := array_remove(array[
        case when not public._infected_tonight(v_room) then v_room.night_victim end,
        public._fierce_victim(v_room)], null);
      if not p_target2 = any (v_victims) then
        raise exception 'Solo puedes curar a una víctima de esta noche' using errcode = '22023';
      end if;
      if p_target2 = v_me.id then
        raise exception 'No puedes curarte a ti misma' using errcode = '22023';
      end if;
    end if;
    if p_target is not null then
      if not v_actor and not coalesce((v_rp.power_state->>'poison')::boolean, false) then
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
    where player_id = v_me.id and not v_actor;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id, target2_id)
    values (v_room.id, v_room.round, v_room.night_step, v_me.id, 'potions', p_target, p_target2);

  elsif p_action = 'guard' and v_kind = 'guard' then
    if p_target is null then
      raise exception 'Elige a quién proteges' using errcode = '22023';
    end if;
    if not v_actor
       and (v_rp.power_state->>'last_guarded') = p_target::text
       and (v_rp.power_state->>'last_guard_round')::integer = v_room.round - 1 then
      raise exception 'No puedes proteger al mismo jugador dos noches seguidas' using errcode = '22023';
    end if;
    if not v_actor then
      update public.roles_privados
      set power_state = power_state || jsonb_build_object(
        'last_guarded', p_target, 'last_guard_round', v_room.round)
      where player_id = v_me.id;
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, v_room.night_step, v_me.id, 'guard', p_target);

  elsif p_action = 'infect' and v_kind = 'infect' then
    if coalesce((v_rp.power_state->>'infect_used')::boolean, false) then
      raise exception 'Ya usaste tu infección' using errcode = 'P0001';
    end if;
    if v_room.night_victim is null then
      raise exception 'Esta noche no hay víctima que infectar' using errcode = 'P0001';
    end if;
    update public.roles_privados
    set power_state = power_state || '{"infect_used": true}'::jsonb
    where player_id = v_me.id;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'infect', v_me.id, 'infect', v_room.night_victim);

  elsif p_action = 'devour' and v_kind = 'fierce' then
    if p_target is null or public._is_bad(p_target) then
      raise exception 'Elige a una víctima que no sea de tu bando' using errcode = '22023';
    end if;
    if p_target = v_room.night_victim then
      raise exception 'Esa ya es la víctima de la manada: elige a otra' using errcode = '22023';
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'fierce', v_me.id, 'devour', p_target);

  elsif p_action = 'white_kill' and v_kind = 'white' then
    if p_target is null or p_target = v_me.id or not public._is_bad(p_target) then
      raise exception 'Elige a otro lobo' using errcode = '22023';
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id)
    values (v_room.id, v_room.round, 'white', v_me.id, 'white_kill', p_target);

  else
    raise exception 'Tu rol no puede hacer eso' using errcode = '42501';
  end if;

  perform public._touch(v_room.id);
  return public.mi_noche(p_room_code, p_token);
end;
$$;

-- mi_noche: igual que antes, más el Salvador y el Comediante.
create or replace function public.mi_noche(p_room_code text, p_token text)
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
  v_pack boolean;
  v_steps text[];
  v_act text;
  v_order text[] := public._night_order();
  v_state text;
  v_info jsonb := '{}'::jsonb;
  v_action public.night_actions;
  v_infected boolean;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id;
  select * into v_rp from public.roles_privados where player_id = v_me.id;
  if not found then
    raise exception 'La partida todavía no ha empezado' using errcode = 'P0002';
  end if;
  v_kind := public._kind_of(v_me.id);
  v_pack := v_rp.team = 'bad';

  v_steps := case
    when v_kind = 'spy' and public._powers_lost(v_room.id) then '{}'::text[]
    when v_kind = 'spy' then array['bad']
    when v_pack and v_kind in ('infect', 'fierce', 'white') then array['bad', v_kind]
    when v_pack then array['bad']
    else array[v_kind] end;

  v_act := case
    when v_room.night_step = 'bad' and v_pack then 'bad'
    else v_kind end;

  v_state := case
    when not v_me.is_alive then 'dead'
    when v_room.phase <> 'night' or v_room.night_step is null then 'sleep'
    when v_room.night_step = any (v_steps) then 'act'
    when exists (
      select 1 from unnest(v_steps) s
      where public._has_step(v_room, s)
        and array_position(v_order, s) > array_position(v_order, v_room.night_step))
      then 'wait'
    else 'sleep'
  end;

  select * into v_action from public.night_actions
  where room_id = v_room.id and round = v_room.round and actor_id = v_me.id
    and step = case when v_kind = 'spy' then 'spy' else v_room.night_step end
  order by created_at desc limit 1;

  v_infected := public._infected_tonight(v_room);

  if v_state = 'act' then
    v_info := case v_act
      when 'bad' then jsonb_build_object(
        'my_target', v_action.target_id,
        'votes', coalesce((
          select jsonb_agg(jsonb_build_object('voter', p.name, 'target', a.target_id))
          from public.night_actions a join public.players p on p.id = a.actor_id
          where a.room_id = v_room.id and a.round = v_room.round
            and a.step = 'bad' and a.action = 'kill' and a.actor_id <> v_me.id), '[]'::jsonb),
        'reactions', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'voter', p.name, 'mine', r.actor_id = v_me.id,
                   'target', r.target_id, 'reaction', r.reaction)
                 order by r.created_at)
          from public.bad_reactions r join public.players p on p.id = r.actor_id
          where r.room_id = v_room.id and r.round = v_room.round), '[]'::jsonb),
        'good_roles', to_jsonb(public._good_roles_dealt(v_room)),
        'time_up', public._bad_time_up(v_room))
      when 'spy' then jsonb_build_object(
        'can_spy', v_action.id is null
                   and (v_rp.power_state->>'last_spy_round') is distinct from (v_room.round - 1)::text,
        'done', v_action.id is not null,
        'caught', v_action.id is not null and v_action.target_id is null,
        'seen', case when v_action.target_id is not null then (
          select jsonb_build_object('id', p.id, 'name', p.name, 'role', public._seen_role(p.id))
          from public.players p where p.id = v_action.target_id) end)
      when 'swap' then jsonb_build_object(
        'done', v_action.id is not null,
        'cards', (select jsonb_agg(role) from public.undealt_cards where room_id = v_room.id))
      when 'link' then jsonb_build_object('done', v_action.id is not null)
      when 'investigate' then jsonb_build_object(
        'done', v_action.id is not null,
        'seen', case when v_action.target_id is not null then (
          select jsonb_build_object('id', p.id, 'name', p.name, 'role', public._seen_role(p.id))
          from public.players p where p.id = v_action.target_id) end)
      when 'compare' then jsonb_build_object(
        'done', v_action.id is not null,
        'compared', case when v_action.target_id is not null then jsonb_build_object(
          'a', v_action.target_id,
          'b', v_action.target2_id,
          'same', public._seen_team(v_action.target_id) = public._seen_team(v_action.target2_id)) end)
      when 'guard' then jsonb_build_object(
        'done', v_action.id is not null,
        'my_target', v_action.target_id,
        'last_protected', case when (v_rp.power_state->>'last_guard_round')::integer = v_room.round - 1
                               then v_rp.power_state->>'last_guarded' end)
      when 'actor' then jsonb_build_object(
        'done', v_action.id is not null,
        'cards', coalesce(v_rp.power_state->'cards', '[]'::jsonb),
        'card', case when v_action.id is not null then v_rp.power_state->>'last_card' end,
        'my_target', v_action.target_id,
        'seen', case when v_action.action = 'see' then (
          select jsonb_build_object('id', p.id, 'name', p.name, 'role', public._seen_role(p.id))
          from public.players p where p.id = v_action.target_id) end,
        'compared', case when v_action.action = 'compare' then jsonb_build_object(
          'a', v_action.target_id,
          'b', v_action.target2_id,
          'same', public._seen_team(v_action.target_id) = public._seen_team(v_action.target2_id)) end,
        'victim', case when not v_infected then v_room.night_victim end,
        'victim2', public._fierce_victim(v_room),
        'heal', true,
        'poison', true)
      when 'protect' then jsonb_build_object(
        'done', v_action.id is not null,
        'victim', case when v_room.theme = 'castronegro' and not v_infected then v_room.night_victim end,
        'victim2', case when v_room.theme = 'castronegro' then public._fierce_victim(v_room) end,
        'heal', coalesce((v_rp.power_state->>'heal')::boolean, false),
        'poison', coalesce((v_rp.power_state->>'poison')::boolean, false),
        'last_protected', case when (v_rp.power_state->>'last_round')::integer = v_room.round - 1
                               then v_rp.power_state->>'last_protected' end)
      when 'infect' then jsonb_build_object(
        'done', v_action.id is not null,
        'can_infect', not coalesce((v_rp.power_state->>'infect_used')::boolean, false),
        'victim', v_room.night_victim)
      when 'fierce' then jsonb_build_object(
        'done', v_action.id is not null,
        'victim', v_room.night_victim,
        'my_target', v_action.target_id)
      when 'white' then jsonb_build_object(
        'done', v_action.id is not null,
        'my_target', v_action.target_id)
      else '{}'::jsonb
    end;
  end if;

  return jsonb_build_object(
           'state', v_state, 'kind', v_act, 'step', v_room.night_step, 'round', v_room.round)
         || v_info;
end;
$$;

-- avanzar_noche: el Comediante también confirma él que ha terminado.
create or replace function public.avanzar_noche(p_room_code text, p_token text, p_version integer)
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

  v_active := v_me.is_alive and v_room.night_step <> 'bad'
              and public._kind_of(v_me.id) = v_room.night_step;

  if not (
       public._night_time_up(v_room)
       or (public._step_done(v_room) and v_room.night_step not in ('investigate', 'compare', 'actor'))
       or v_active) then
    return false;
  end if;

  perform public._next_night_step(v_room);
  perform public._bump(v_room.id);
  return true;
end;
$$;

-- iniciar_partida con Alcalde: igual que antes, y reparte las cartas del
-- Comediante si está en juego.
create or replace function public.iniciar_partida(
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
  v_room public.rooms;
begin
  perform public.iniciar_partida(p_room_code, p_token, p_special_roles, p_bad_count);
  v_me := public._player_by_token(p_room_code, p_token);
  select * into v_room from public.rooms where id = v_me.room_id;

  update public.roles_privados rp
  set power_state = jsonb_build_object('cards', public._actor_cards(v_room))
  where rp.room_id = v_room.id and rp.role = 'actor';

  if p_mayor then
    update public.rooms set mayor_enabled = true where id = v_room.id;
    perform public._fix_mayor(v_room.id);
  end if;
end;
$$;

revoke all on function public._actor_cards(public.rooms) from public, anon, authenticated;
