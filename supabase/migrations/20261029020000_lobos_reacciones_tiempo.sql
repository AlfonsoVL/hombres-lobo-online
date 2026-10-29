-- Los malos se ponen de acuerdo sin hablar: reacciones rápidas y tiempo límite.
--
--   * Reacciones: cada malo puede marcar a cada candidato con una etiqueta fija
--     (yes «a por él», no «este no», seer «creo que es vidente», suspect
--     «sospecha de nosotros»). Sus compañeros las ven en directo junto al nombre.
--   * Tiempo: el turno de los malos dura 60 s desde que empieza. Si coinciden
--     antes, el turno ya está hecho como hasta ahora. Al acabarse el tiempo se
--     cierran votos y reacciones, el turno cuenta como hecho y, al pasarlo, gana
--     la más votada (empate: al azar; sin votos no hay víctima).

alter table public.rooms add column step_started_at timestamptz;

-- Cada vez que cambia el turno de noche se apunta cuándo empieza.
create function public._step_started()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.night_step is distinct from old.night_step then
    new.step_started_at := case when new.night_step is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger rooms_step_started
before update of night_step on public.rooms
for each row execute function public._step_started();

-- Cuándo se acaba el turno de los malos (null si no es su turno).
create function public._bad_ends_at(p_room public.rooms)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_room.phase = 'night' and p_room.night_step = 'bad'
              then p_room.step_started_at + interval '60 seconds' end;
$$;

create function public._bad_time_up(p_room public.rooms)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(now() >= public._bad_ends_at(p_room), false);
$$;

-- El turno de los malos está hecho si todos coinciden o si se ha acabado el tiempo.
create or replace function public._step_done(p_room public.rooms)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_room.night_step
    when 'bad' then public._bad_time_up(p_room) or (
      select count(*) = count(a.target_id) and count(distinct a.target_id) = 1
      from public.players p
      left join public.night_actions a
        on a.actor_id = p.id and a.room_id = p_room.id and a.round = p_room.round
       and a.step = 'bad' and a.action = 'kill'
      where p.room_id = p_room.id and p.is_alive and public._kind_of(p.id) = 'bad')
    else exists (
      select 1 from public.night_actions a
      where a.room_id = p_room.id and a.round = p_room.round and a.step = p_room.night_step)
  end;
$$;

-- Con el tiempo acabado ya no se puede votar ni cambiar el voto.
create function public._bad_vote_in_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.step = 'bad' and new.action = 'kill' and public._bad_time_up(
       (select r from public.rooms r where r.id = new.room_id)) then
    raise exception 'Se ha acabado el tiempo: ya no podéis cambiar el voto' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger night_actions_bad_in_time
before insert or update on public.night_actions
for each row execute function public._bad_vote_in_time();

-- Reacciones de los malos a cada candidato. Una por malo y candidato.
create table public.bad_reactions (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  round      integer not null,
  actor_id   uuid not null references public.players (id) on delete cascade,
  target_id  uuid not null references public.players (id) on delete cascade,
  reaction   text not null check (reaction in ('yes', 'no', 'seer', 'suspect')),
  created_at timestamptz not null default now(),
  primary key (room_id, round, actor_id, target_id)
);

alter table public.bad_reactions enable row level security;

-- Pone, cambia o quita (p_reaction null) la reacción propia a un candidato.
create function public.reaccion_malos(
  p_room_code text,
  p_token text,
  p_target uuid,
  p_reaction text default null
)
returns jsonb
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

  if v_room.phase <> 'night' or v_room.night_step is distinct from 'bad'
     or not v_me.is_alive or public._kind_of(v_me.id) <> 'bad' then
    raise exception 'No es tu turno' using errcode = 'P0001';
  end if;
  if public._bad_time_up(v_room) then
    raise exception 'Se ha acabado el tiempo' using errcode = 'P0001';
  end if;
  if not exists (
       select 1 from public.players
       where id = p_target and room_id = v_room.id and is_alive)
     or public._kind_of(p_target) = 'bad' then
    raise exception 'Elige a una víctima que no sea de tu bando' using errcode = '22023';
  end if;
  if p_reaction is not null and p_reaction not in ('yes', 'no', 'seer', 'suspect') then
    raise exception 'Reacción no válida' using errcode = '22023';
  end if;

  if p_reaction is null then
    delete from public.bad_reactions
    where room_id = v_room.id and round = v_room.round and actor_id = v_me.id and target_id = p_target;
  else
    insert into public.bad_reactions (room_id, round, actor_id, target_id, reaction)
    values (v_room.id, v_room.round, v_me.id, p_target, p_reaction)
    on conflict (room_id, round, actor_id, target_id)
    do update set reaction = excluded.reaction, created_at = now();
  end if;

  perform public._touch(v_room.id);
  return public.mi_noche(p_room_code, p_token);
end;
$$;

-- mi_noche: igual que antes, pero los malos reciben también las reacciones y
-- cuándo se acaba su turno.
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
            and a.step = 'bad' and a.action = 'kill' and a.actor_id <> v_me.id), '[]'::jsonb),
        -- Y las reacciones de todos, también las propias.
        'reactions', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'voter', p.name, 'mine', r.actor_id = v_me.id,
                   'target', r.target_id, 'reaction', r.reaction)
                 order by r.created_at)
          from public.bad_reactions r join public.players p on p.id = r.actor_id
          where r.room_id = v_room.id and r.round = v_room.round), '[]'::jsonb),
        'time_up', public._bad_time_up(v_room))
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

-- get_room: igual que antes, más cuándo se acaba el turno de los malos y la
-- hora del servidor, para que cada móvil muestre la cuenta atrás aunque su
-- reloj vaya desfasado.
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
    'step_ends_at', public._bad_ends_at(v_room),
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
  public._step_started(),
  public._bad_ends_at(public.rooms),
  public._bad_time_up(public.rooms),
  public._bad_vote_in_time(),
  public.reaccion_malos(text, text, uuid, text)
from public, anon, authenticated;

grant execute on function public.reaccion_malos(text, text, uuid, text) to anon, authenticated;
