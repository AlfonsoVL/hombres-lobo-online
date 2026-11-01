-- Cinco aldeanos nuevos para Castronegro, solo en modo personalizado.
--
--   * Caballero de la Espada Oxidada (rusty_knight, tipo rusty_sword): si lo
--     devoran los lobos (la manada o el Lobo Feroz), contagia el tétanos al
--     primer lobo vivo que le sigue en la lista de jugadores (orden de llegada
--     a la sala, dando la vuelta), que muere al final de la noche siguiente.
--   * Anciano (elder, tipo elder): resiste el primer ataque de los lobos (de
--     la manada o del Lobo Feroz). Si lo lincha la aldea o lo envenena la
--     Bruja, todos los aldeanos pierden sus poderes el resto de la partida.
--   * Tonto del Pueblo (village_idiot, tipo idiot): la primera vez que la
--     aldea lo lincha, se revela su carta y se le perdona: sigue vivo, pero ya
--     no puede votar. Si lo vuelven a linchar, muere.
--   * Chivo Expiatorio (scapegoat, tipo scapegoat): si la votación del día
--     acaba en empate y el Alcalde no lo deshace, muere él. Antes de seguir,
--     elige quién podrá votar al día siguiente.
--   * Flautista (piper, tipo compare): cada noche elige a dos jugadores y
--     sabe si son del mismo bando o no (el Gran Lobo Malvado parece aldeano).
--
-- «Perder los poderes»: la Vidente, la Bruja, Cupido, el Ladrón, la Niña, el
-- Flautista y el resto de aldeanos con rol se quedan sin turno ni poder: el
-- Cazador no dispara, el Caballero no contagia, el Tonto ya no se salva y el
-- Chivo sigue muriendo en los empates pero ya no elige a los votantes.

-- ---------------------------------------------------------------------------
-- Catálogo y columnas
-- ---------------------------------------------------------------------------

alter table public.theme_roles drop constraint theme_roles_kind_check;
alter table public.theme_roles add constraint theme_roles_kind_check check (kind in (
  'bad', 'plain_good', 'investigate', 'protect', 'shoot_on_death', 'link', 'spy', 'swap',
  'fierce', 'infect', 'white', 'disguised',
  'rusty_sword', 'elder', 'idiot', 'scapegoat', 'compare'));

insert into public.theme_roles (theme, role, kind, team, classic) values
  ('castronegro', 'rusty_knight',  'rusty_sword', 'good', false),
  ('castronegro', 'elder',         'elder',       'good', false),
  ('castronegro', 'village_idiot', 'idiot',       'good', false),
  ('castronegro', 'scapegoat',     'scapegoat',   'good', false),
  ('castronegro', 'piper',         'compare',     'good', false);

-- resist: el Anciano aguanta un ataque. pardon: la aldea perdona al Tonto.
alter table public.game_log drop constraint game_log_event_check;
alter table public.game_log add constraint game_log_event_check
  check (event in ('attack', 'death', 'resist', 'pardon'));

alter table public.rooms
  -- Chivo Expiatorio que tiene que elegir a los votantes antes de seguir.
  add column pending_voters uuid references public.players (id) on delete set null,
  -- Quién puede votar el próximo día (null: todos los vivos).
  add column allowed_voters uuid[];

-- ---------------------------------------------------------------------------
-- Funciones internas
-- ---------------------------------------------------------------------------

-- Si los aldeanos han perdido sus poderes: la aldea mató al Anciano
-- (linchado o envenenado por la Bruja).
create function public._powers_lost(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_log g
    join public.roles_privados rp on rp.player_id = g.player_id
    where g.room_id = p_room_id and g.event = 'death'
      and g.cause in ('lynched', 'poisoned') and rp.role = 'elder');
$$;

-- Bando que ve el Flautista: el del rol que vería la Vidente.
create function public._seen_team(p_player uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.team
  from public.players p
  join public.rooms r on r.id = p.room_id
  join public.theme_roles t on t.theme = r.theme and t.role = public._seen_role(p.id)
  where p.id = p_player;
$$;

create or replace function public._night_order()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['swap', 'link', 'bad', 'infect', 'fierce', 'white', 'investigate', 'compare', 'protect'];
$$;

-- _has_step: igual que antes, pero sin poderes los aldeanos no tienen turno.
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
     and (p_kind not in ('swap', 'link', 'investigate', 'compare', 'protect')
          or not public._powers_lost(p_room.id))
     and (p_kind not in ('bad', 'fierce') or exists (
       select 1 from public.players p
       where p.room_id = p_room.id and p.is_alive and not public._is_bad(p.id)))
     and exists (
       select 1 from public.players p
       where p.room_id = p_room.id and p.is_alive
         and case when p_kind = 'bad' then public._is_bad(p.id)
                  else public._kind_of(p.id) = p_kind end);
$$;

-- _kill: igual que antes, y además:
--   * El Cazador no dispara si los aldeanos han perdido sus poderes.
--   * El Caballero devorado por los lobos contagia el tétanos.
create or replace function public._kill(p_room_id uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_partner uuid;
  v_cause text;
  v_kind text;
  v_joined timestamptz;
  v_wolf uuid;
begin
  update public.players p
  set is_alive = false,
      revealed_role = (select rp.role from public.roles_privados rp where rp.player_id = p.id)
  where p.id = p_player and p.is_alive
  returning p.joined_at into v_joined;
  if not found then
    return;
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  select case when l.player_a = p_player then l.player_b else l.player_a end
  into v_partner
  from public.links l
  where l.room_id = p_room_id and p_player in (l.player_a, l.player_b);

  v_cause := case
    when v_partner is not null
         and not (select is_alive from public.players where id = v_partner) then 'lover'
    when nullif(current_setting('lobos.causa', true), '') is not null
      then current_setting('lobos.causa', true)
    when v_room.phase = 'night' and p_player = v_room.night_victim then 'bad'
    when v_room.phase = 'night' and exists (
      select 1 from public.night_actions a
      where a.room_id = p_room_id and a.round = v_room.round
        and a.action = 'spy' and a.actor_id = p_player and a.target_id is null) then 'spied'
    when v_room.phase = 'night' then 'poisoned'
    when v_room.phase = 'lynch' then 'lynched'
    else 'shot'
  end;
  insert into public.game_log (room_id, round, event, cause, player_id)
  values (p_room_id, v_room.round, 'death', v_cause, p_player);

  update public.rooms
  set last_deaths = array_append(last_deaths, p_player)
  where id = p_room_id;

  v_kind := public._kind_of(p_player);

  if v_kind = 'shoot_on_death' and not public._powers_lost(p_room_id) then
    update public.rooms set pending_shot = p_player where id = p_room_id;
  end if;

  -- Tétanos: el primer lobo vivo que le sigue en la lista, dando la vuelta.
  if v_kind = 'rusty_sword' and v_cause in ('bad', 'fierce')
     and not public._powers_lost(p_room_id) then
    select p.id into v_wolf from public.players p
    where p.room_id = p_room_id and p.is_alive and public._is_bad(p.id)
    order by (p.joined_at, p.id) <= (v_joined, p_player), p.joined_at, p.id
    limit 1;
    if v_wolf is not null then
      update public.roles_privados
      set power_state = power_state || jsonb_build_object('tetanus_round', v_room.round + 1)
      where player_id = v_wolf;
    end if;
  end if;

  if v_partner is not null then
    perform public._kill(p_room_id, v_partner);
  end if;
end;
$$;

-- Si el jugador es el Anciano y aún no ha resistido ningún ataque, lo
-- resiste: queda herido y no muere.
create function public._elder_resists(p_room public.rooms, p_player uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public._kind_of(p_player) <> 'elder' or exists (
      select 1 from public.roles_privados
      where player_id = p_player and coalesce((power_state->>'wounded')::boolean, false)) then
    return false;
  end if;
  update public.roles_privados
  set power_state = power_state || '{"wounded": true}'::jsonb
  where player_id = p_player;
  insert into public.game_log (room_id, round, event, player_id)
  values (p_room.id, p_room.round, 'resist', p_player);
  return true;
end;
$$;

-- _resolve_night: igual que antes, con el Anciano y el tétanos.
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
begin
  update public.rooms set last_deaths = '{}' where id = p_room.id;

  if p_room.night_victim is not null then
    insert into public.game_log (room_id, round, event, player_id)
    values (p_room.id, p_room.round, 'attack', p_room.night_victim);
  end if;

  -- Infección: la víctima no muere y se convierte en Lobo.
  if v_infected and p_room.night_victim is not null then
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
  if v_fierce is not null and not exists (
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

-- _resolve_day: igual que antes, y además:
--   * Solo cuentan los votos de quien podía votar.
--   * El Tonto del Pueblo se salva la primera vez.
--   * En un empate sin resolver muere el Chivo Expiatorio, que elige a los
--     votantes del día siguiente.
create or replace function public._resolve_day(p_room public.rooms)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_tied uuid[];
  v_lynched uuid;
  v_scapegoat uuid;
begin
  update public.rooms
  set last_deaths = '{}', phase = 'lynch', allowed_voters = null, pending_voters = null
  where id = p_room.id;

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
  elsif coalesce(array_length(v_tied, 1), 0) > 1 then
    if p_room.mayor_id is not null then
      -- El Alcalde deshace el empate con su voto.
      select v.target_id into v_lynched from public.day_votes v
      where v.room_id = p_room.id and v.round = p_room.round
        and v.voter_id = p_room.mayor_id and v.target_id = any (v_tied);
    end if;
    if v_lynched is null then
      select p.id into v_scapegoat from public.players p
      where p.room_id = p_room.id and p.is_alive and public._kind_of(p.id) = 'scapegoat';
    end if;
  end if;

  if v_scapegoat is not null then
    perform set_config('lobos.causa', 'scapegoat', true);
    perform public._kill(p_room.id, v_scapegoat);
    perform set_config('lobos.causa', '', true);
    if not public._powers_lost(p_room.id) then
      update public.rooms set pending_voters = v_scapegoat where id = p_room.id;
    end if;
  elsif v_lynched is not null then
    if public._kind_of(v_lynched) = 'idiot'
       and not public._powers_lost(p_room.id)
       and not exists (
         select 1 from public.roles_privados
         where player_id = v_lynched and coalesce((power_state->>'pardoned')::boolean, false)) then
      -- Se revela y la aldea le perdona: sigue vivo, pero sin voto.
      update public.roles_privados
      set power_state = power_state || '{"pardoned": true}'::jsonb
      where player_id = v_lynched;
      update public.players p
      set revealed_role = rp.role
      from public.roles_privados rp
      where rp.player_id = p.id and p.id = v_lynched;
      insert into public.game_log (room_id, round, event, player_id)
      values (p_room.id, p_room.round, 'pardon', v_lynched);
    else
      perform public._kill(p_room.id, v_lynched);
    end if;
  end if;
  perform public._after_deaths(p_room.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones públicas
-- ---------------------------------------------------------------------------

-- votar: igual que antes, pero el Tonto perdonado no vota y, si el Chivo
-- Expiatorio eligió votantes, solo votan ellos.
create or replace function public.votar(p_room_code text, p_token text, p_target uuid)
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
  if now() >= public._day_ends_at(v_room) then
    raise exception 'Se ha acabado el tiempo de votar' using errcode = 'P0001';
  end if;
  if not v_me.is_alive then
    raise exception 'Los muertos no pueden votar' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.roles_privados
             where player_id = v_me.id and coalesce((power_state->>'pardoned')::boolean, false)) then
    raise exception 'El Tonto del Pueblo ya no puede votar' using errcode = 'P0001';
  end if;
  if v_room.allowed_voters is not null and not v_me.id = any (v_room.allowed_voters) then
    raise exception 'Hoy el Chivo Expiatorio no te deja votar' using errcode = 'P0001';
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

-- El Chivo Expiatorio, recién linchado por un empate, elige quién podrá votar
-- al día siguiente (al menos un jugador vivo).
create function public.elegir_votantes(p_room_code text, p_token text, p_voters uuid[])
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
  if v_room.phase <> 'lynch' or v_room.pending_voters is distinct from v_me.id then
    raise exception 'Ahora no puedes elegir a los votantes' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_voters, 1), 0) = 0 or exists (
      select 1 from unnest(p_voters) v
      where not exists (select 1 from public.players p
                        where p.id = v and p.room_id = v_room.id and p.is_alive)) then
    raise exception 'Elige al menos a un jugador vivo' using errcode = '22023';
  end if;

  update public.rooms
  set allowed_voters = (select array_agg(distinct v) from unnest(p_voters) v),
      pending_voters = null
  where id = v_room.id;
  perform public._bump(v_room.id);
end;
$$;

-- avanzar_fase: igual que antes, pero espera también al Chivo Expiatorio.
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
  if v_room.pending_voters is not null and v_room.phase = 'lynch' then
    raise exception 'Falta que el Chivo Expiatorio elija quién votará mañana' using errcode = 'P0001';
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

-- avanzar_noche: igual que antes; el Flautista, como la Vidente, confirma él
-- que ha leído el resultado.
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
       or (public._step_done(v_room) and v_room.night_step not in ('investigate', 'compare'))
       or v_active) then
    return false;
  end if;

  perform public._next_night_step(v_room);
  perform public._bump(v_room.id);
  return true;
end;
$$;

-- accion_nocturna: igual que antes, más el Flautista (compare: p_target y
-- p_target2). Sin poderes, la Niña ya no espía.
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

  elsif p_action = 'compare' and v_kind = 'compare' then
    if p_target is null or p_target2 is null or p_target = p_target2
       or v_me.id in (p_target, p_target2) then
      raise exception 'Elige a otros dos jugadores distintos' using errcode = '22023';
    end if;
    insert into public.night_actions (room_id, round, step, actor_id, action, target_id, target2_id)
    values (v_room.id, v_room.round, 'compare', v_me.id, 'compare', p_target, p_target2);

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

-- mi_noche: igual que antes, más el Flautista. Sin poderes, la Niña duerme.
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

-- get_room: igual que antes, más lo público de los aldeanos nuevos:
--   powers_lost: la aldea mató al Anciano.
--   pending_voters / allowed_voters: el Chivo Expiatorio y su elección.
--   pardoned: el Tonto perdonado en el linchamiento de esta ronda.
--   scapegoat: el linchamiento de esta ronda fue el del Chivo por empate.
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
    'pending_voters', case when v_room.phase = 'lynch' then v_room.pending_voters end,
    'allowed_voters', to_jsonb(v_room.allowed_voters),
    'powers_lost', public._powers_lost(v_room.id),
    'pardoned', case when v_room.phase = 'lynch' then (
        select g.player_id from public.game_log g
        where g.room_id = v_room.id and g.round = v_room.round and g.event = 'pardon' limit 1) end,
    'scapegoat', v_room.phase = 'lynch' and exists (
        select 1 from public.game_log g
        where g.room_id = v_room.id and g.round = v_room.round
          and g.event = 'death' and g.cause = 'scapegoat'),
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

-- volver_a_jugar: igual que antes, y borra la elección del Chivo Expiatorio.
create or replace function public.volver_a_jugar(p_room_code text, p_token text)
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
      pending_voters = null, allowed_voters = null,
      night_victim = null, last_deaths = '{}'
  where id = v_room.id;

  perform public._bump(v_room.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke all on function
  public._powers_lost(uuid),
  public._seen_team(uuid),
  public._elder_resists(public.rooms, uuid)
from public, anon, authenticated;

revoke all on function public.elegir_votantes(text, text, uuid[]) from public;
grant execute on function public.elegir_votantes(text, text, uuid[]) to anon, authenticated;
