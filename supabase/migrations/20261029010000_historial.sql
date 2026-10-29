-- Histórico de la partida y estado público de la sala.
--
--   * game_log guarda el ataque de los malos de cada noche y cada muerte con su
--     causa. Junto con night_actions y day_votes basta para contar la partida.
--   * historial_partida solo responde con la partida terminada, cuando ya se
--     han revelado todos los roles.
--   * estado_sala dice, a quien abre el enlace sin estar en la sala, si la
--     partida ya ha terminado y quién ganó. No incluye jugadores ni roles.

create table public.game_log (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  round      integer not null,
  -- attack: víctima elegida por los malos. death: muerte, con su causa.
  event      text not null check (event in ('attack', 'death')),
  -- Causa de la muerte: bad, poisoned, spied, lynched, shot o lover.
  cause      text,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index game_log_room_idx on public.game_log (room_id);
alter table public.game_log enable row level security;

-- _kill: igual que antes, pero apunta la muerte y su causa.
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
begin
  update public.players p
  set is_alive = false,
      revealed_role = (select rp.role from public.roles_privados rp where rp.player_id = p.id)
  where p.id = p_player and p.is_alive;
  if not found then
    return;
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  select case when l.player_a = p_player then l.player_b else l.player_a end
  into v_partner
  from public.links l
  where l.room_id = p_room_id and p_player in (l.player_a, l.player_b);

  -- Si su pareja ya ha muerto, muere de amor. Si no, la causa depende de la fase.
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

  if public._kind_of(p_player) = 'shoot_on_death' then
    update public.rooms set pending_shot = p_player where id = p_room_id;
  end if;

  if v_partner is not null then
    perform public._kill(p_room_id, v_partner);
  end if;
end;
$$;

-- _resolve_night: igual que antes, pero apunta a quién atacaron los malos.
create or replace function public._resolve_night(p_room public.rooms)
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

  if p_room.night_victim is not null then
    insert into public.game_log (room_id, round, event, player_id)
    values (p_room.id, p_room.round, 'attack', p_room.night_victim);
  end if;

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

-- disparar: igual que antes, pero la muerte queda como disparo.
create or replace function public.disparar(p_room_code text, p_token text, p_target uuid)
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
  perform set_config('lobos.causa', 'shot', true);
  perform public._kill(v_room.id, p_target);
  perform set_config('lobos.causa', '', true);
  perform public._after_deaths(v_room.id);
  perform public._bump(v_room.id);
end;
$$;

-- Histórico completo, solo con la partida terminada y para sus jugadores.
create function public.historial_partida(p_room_code text, p_token text)
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
  if v_room.phase <> 'finished' then
    raise exception 'El histórico se ve al terminar la partida' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'winner', v_room.winner,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'alive', p.is_alive,
               'role', rp.role, 'initial_role', rp.initial_role, 'team', rp.team)
             order by p.joined_at)
      from public.players p
      join public.roles_privados rp on rp.player_id = p.id
      where p.room_id = v_room.id), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_array(l.player_a, l.player_b))
      from public.links l where l.room_id = v_room.id), '[]'::jsonb),
    'night', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', a.round, 'actor', a.actor_id, 'action', a.action,
               'target', a.target_id, 'target2', a.target2_id)
             order by a.round, a.created_at)
      from public.night_actions a where a.room_id = v_room.id), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('round', v.round, 'voter', v.voter_id, 'target', v.target_id)
             order by v.round)
      from public.day_votes v where v.room_id = v_room.id), '[]'::jsonb),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', g.round, 'event', g.event, 'cause', g.cause, 'player', g.player_id)
             order by g.id)
      from public.game_log g where g.room_id = v_room.id), '[]'::jsonb)
  );
end;
$$;

-- Para quien abre el enlace sin estar en la sala: si existe, en qué fase está
-- y, si ha terminado, quién ganó. Nada de jugadores ni roles.
create function public.estado_sala(p_room_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'exists', true,
      'theme', r.theme,
      'phase', case when r.phase = 'lobby' then 'lobby'
                    when r.phase = 'finished' then 'finished'
                    else 'playing' end,
      'winner', case when r.phase = 'finished' then r.winner end)
    from public.rooms r where r.code = upper(p_room_code)),
    jsonb_build_object('exists', false));
$$;

revoke all on function
  public._kill(uuid, uuid),
  public._resolve_night(public.rooms),
  public.disparar(text, text, uuid),
  public.historial_partida(text, text),
  public.estado_sala(text)
from public, anon, authenticated;

grant execute on function
  public.disparar(text, text, uuid),
  public.historial_partida(text, text),
  public.estado_sala(text)
to anon, authenticated;
