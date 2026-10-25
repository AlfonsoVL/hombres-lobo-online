-- Esquema inicial: salas, jugadores, roles privados y funciones de reparto.
--
-- Principios de seguridad:
--   * Todas las tablas tienen RLS activado y NINGUNA política para anon ni
--     authenticated: el navegador no puede leer ni escribir tablas directamente.
--   * Todo acceso pasa por funciones SECURITY DEFINER que comprueban el token
--     del jugador. El token nunca se guarda en claro, solo su hash SHA-256.
--   * Nunca se guardan fotos ni datos biométricos.
--   * Los roles solo salen de la base de datos a través de obtener_mi_rol,
--     y cada jugador recibe únicamente el suyo.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Catálogo de roles por temática (datos públicos, sin información de partida)
-- ---------------------------------------------------------------------------

create table public.theme_roles (
  theme          text not null check (theme in ('castronegro', 'alien')),
  role           text not null,
  -- Tipo de rol, común a todas las temáticas.
  kind           text not null check (kind in (
                   'bad', 'plain_good', 'investigate', 'protect',
                   'shoot_on_death', 'link', 'spy', 'swap')),
  team           text not null check (team in ('bad', 'good')),
  -- Si el rol puede salir en modo clásico.
  classic        boolean not null default true,
  primary key (theme, role)
);

insert into public.theme_roles (theme, role, kind, team, classic) values
  ('castronegro', 'werewolf',    'bad',            'bad',  true),
  ('castronegro', 'villager',    'plain_good',     'good', true),
  ('castronegro', 'seer',        'investigate',    'good', true),
  ('castronegro', 'witch',       'protect',        'good', true),
  ('castronegro', 'hunter',      'shoot_on_death', 'good', true),
  ('castronegro', 'cupid',       'link',           'good', true),
  ('castronegro', 'little_girl', 'spy',            'good', false),
  ('castronegro', 'thief',       'swap',           'good', false),
  ('alien',       'xenomorph',   'bad',            'bad',  true),
  ('alien',       'crew_member', 'plain_good',     'good', true),
  ('alien',       'scientist',   'investigate',    'good', true),
  ('alien',       'medic',       'protect',        'good', true),
  ('alien',       'marine',      'shoot_on_death', 'good', true),
  ('alien',       'android',     'link',           'good', true);

-- ---------------------------------------------------------------------------
-- Salas y jugadores
-- ---------------------------------------------------------------------------

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  theme       text not null check (theme in ('castronegro', 'alien')),
  mode        text not null check (mode in ('classic', 'custom')),
  phase       text not null default 'lobby' check (phase in (
                'lobby', 'intro', 'role_reveal', 'night', 'dawn', 'day', 'finished')),
  -- Turno actual dentro de la noche (tipo de rol, p. ej. 'bad' o 'investigate').
  night_step  text,
  round       integer not null default 0,
  -- Se incrementa en cada cambio de estado; los clientes descartan eventos viejos.
  version     integer not null default 0,
  winner      text check (winner in ('bad', 'good', 'lovers')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.players (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 24),
  token_hash     text not null unique,
  is_creator     boolean not null default false,
  is_alive       boolean not null default true,
  -- Rol revelado públicamente (al ser linchado o al terminar la partida).
  revealed_role  text,
  joined_at      timestamptz not null default now()
);

create unique index players_room_name_key on public.players (room_id, lower(btrim(name)));
create unique index players_one_creator_key on public.players (room_id) where is_creator;

-- ---------------------------------------------------------------------------
-- Estado privado de la partida
-- ---------------------------------------------------------------------------

create table public.roles_privados (
  player_id     uuid primary key references public.players (id) on delete cascade,
  room_id       uuid not null references public.rooms (id) on delete cascade,
  role          text not null,
  -- Rol recibido en el reparto (puede cambiar con el Ladrón).
  initial_role  text not null,
  team          text not null check (team in ('bad', 'good')),
  -- Poderes de un solo uso y similares, p. ej. {"heal": true, "poison": true}.
  power_state   jsonb not null default '{}'::jsonb
);

create index roles_privados_room_idx on public.roles_privados (room_id);

-- Cartas que quedan sin repartir (para el Ladrón).
create table public.undealt_cards (
  id       uuid primary key default gen_random_uuid(),
  room_id  uuid not null references public.rooms (id) on delete cascade,
  role     text not null
);

-- Acciones nocturnas privadas (votos de los malos, investigaciones, pociones...).
create table public.night_actions (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  round       integer not null,
  step        text not null,
  actor_id    uuid not null references public.players (id) on delete cascade,
  action      text not null,
  target_id   uuid references public.players (id) on delete cascade,
  target2_id  uuid references public.players (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (room_id, round, step, actor_id, action)
);

-- Votos de linchamiento del día.
create table public.day_votes (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  round      integer not null,
  voter_id   uuid not null references public.players (id) on delete cascade,
  target_id  uuid not null references public.players (id) on delete cascade,
  primary key (room_id, round, voter_id)
);

-- Pareja vinculada por Cupido o el Androide.
create table public.links (
  room_id   uuid primary key references public.rooms (id) on delete cascade,
  player_a  uuid not null references public.players (id) on delete cascade,
  player_b  uuid not null references public.players (id) on delete cascade,
  check (player_a <> player_b)
);

-- ---------------------------------------------------------------------------
-- RLS: activado en todo, sin políticas. Solo las funciones acceden a los datos.
-- ---------------------------------------------------------------------------

alter table public.theme_roles    enable row level security;
alter table public.rooms          enable row level security;
alter table public.players        enable row level security;
alter table public.roles_privados enable row level security;
alter table public.undealt_cards  enable row level security;
alter table public.night_actions  enable row level security;
alter table public.day_votes      enable row level security;
alter table public.links          enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Utilidades internas (no expuestas a anon)
-- ---------------------------------------------------------------------------

create function public._token_hash(p_token text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'Token no válido' using errcode = '28000';
  end if;
  return encode(extensions.digest(p_token, 'sha256'), 'hex');
end;
$$;

-- Jugador que presenta el token en una sala concreta. Lanza error si no existe.
create function public._player_by_token(p_room_code text, p_token text)
returns public.players
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  select p.* into v_player
  from public.players p
  join public.rooms r on r.id = p.room_id
  where r.code = upper(p_room_code)
    and p.token_hash = public._token_hash(p_token);

  if not found then
    raise exception 'Token no válido' using errcode = '28000';
  end if;
  return v_player;
end;
$$;

create function public._new_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- Sin 0, 1, I ni O para que el código se lea sin confusiones.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Envía un evento Broadcast al canal de la sala desde el servidor.
create function public._emit(p_room_code text, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, 'sala:' || p_room_code, false);
end;
$$;

-- Borra salas inactivas para no llenar el plan gratuito.
create function public._cleanup_old_rooms()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rooms where updated_at < now() - interval '24 hours';
$$;

-- ---------------------------------------------------------------------------
-- Funciones públicas (RPC)
-- ---------------------------------------------------------------------------

-- Crea una sala y su creador. Devuelve el código y el id del creador.
create function public.create_room(p_theme text, p_mode text, p_name text, p_token text)
returns table (room_code text, player_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_player_id uuid;
begin
  perform public._cleanup_old_rooms();

  insert into public.rooms (code, theme, mode)
  values (public._new_room_code(), p_theme, p_mode)
  returning * into v_room;

  insert into public.players (room_id, name, token_hash, is_creator)
  values (v_room.id, btrim(p_name), public._token_hash(p_token), true)
  returning id into v_player_id;

  return query select v_room.code, v_player_id;
end;
$$;

-- Une a un jugador a la sala. Si el token ya está en la sala, devuelve el
-- mismo jugador (sirve para reconectar).
create function public.join_room(p_room_code text, p_name text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_player_id uuid;
  v_count integer;
begin
  select * into v_room from public.rooms
  where code = upper(p_room_code)
  for update;

  if not found then
    raise exception 'La sala no existe' using errcode = 'P0002';
  end if;

  select id into v_player_id from public.players
  where room_id = v_room.id and token_hash = public._token_hash(p_token);
  if found then
    return v_player_id;
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'La partida ya ha empezado' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= 24 then
    raise exception 'La sala está llena (máximo 24 jugadores)' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.players
             where room_id = v_room.id and lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'Ya hay un jugador con ese nombre' using errcode = 'P0001';
  end if;

  insert into public.players (room_id, name, token_hash)
  values (v_room.id, btrim(p_name), public._token_hash(p_token))
  returning id into v_player_id;

  update public.rooms set version = version + 1, updated_at = now() where id = v_room.id;

  perform public._emit(v_room.code, 'jugador_unido',
    jsonb_build_object('id', v_player_id, 'name', btrim(p_name), 'version', v_room.version + 1));

  return v_player_id;
end;
$$;

-- Estado público de la sala. Nunca incluye roles no revelados.
create function public.get_room(p_room_code text, p_token text)
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
    'round', v_room.round,
    'version', v_room.version,
    'winner', v_room.winner,
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

-- Reparte los roles en el servidor. Solo la puede llamar el creador.
--   p_special_roles: roles especiales elegidos (en clásico, los de la tabla).
--   p_bad_count: número de malos.
-- Los buenos sin rol se calculan solos: jugadores - malos - especiales.
create function public.iniciar_partida(
  p_room_code text,
  p_token text,
  p_special_roles text[],
  p_bad_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.players;
  v_room public.rooms;
  v_players integer;
  v_specials integer := coalesce(array_length(p_special_roles, 1), 0);
  v_plain integer;
  v_bad_role text;
  v_plain_role text;
  v_role text;
begin
  v_me := public._player_by_token(p_room_code, p_token);
  if not v_me.is_creator then
    raise exception 'Solo el creador de la sala puede iniciar la partida' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where id = v_me.room_id for update;
  if v_room.phase <> 'lobby' then
    raise exception 'La partida ya ha empezado' using errcode = 'P0001';
  end if;

  select count(*) into v_players from public.players where room_id = v_room.id;

  if p_bad_count is null or p_bad_count < 1 then
    raise exception 'Tiene que haber al menos 1 malo' using errcode = '22023';
  end if;

  v_plain := v_players - p_bad_count - v_specials;
  if v_plain < 0 then
    raise exception 'Con % jugadores, % malos y % roles especiales no caben. Reduce alguno.',
      v_players, p_bad_count, v_specials using errcode = '22023';
  end if;

  -- Cada rol especial debe existir en la temática y estar permitido en el modo.
  foreach v_role in array coalesce(p_special_roles, '{}') loop
    if not exists (
      select 1 from public.theme_roles t
      where t.theme = v_room.theme and t.role = v_role
        and t.kind not in ('bad', 'plain_good')
        and (v_room.mode = 'custom' or t.classic)
    ) then
      raise exception 'El rol % no está disponible en esta temática o modo', v_role
        using errcode = '22023';
    end if;
  end loop;

  -- En modo personalizado cada rol especial solo puede salir una vez.
  if v_room.mode = 'custom'
     and v_specials <> (select count(distinct r) from unnest(p_special_roles) r) then
    raise exception 'Cada rol especial solo puede elegirse una vez' using errcode = '22023';
  end if;

  if 'thief' = any (coalesce(p_special_roles, '{}')) then
    -- PENDIENTE: falta definir qué cartas extra entran en la baraja del Ladrón.
    raise exception 'El Ladrón todavía no está disponible' using errcode = '0A000';
  end if;

  select role into v_bad_role from public.theme_roles
  where theme = v_room.theme and kind = 'bad';
  select role into v_plain_role from public.theme_roles
  where theme = v_room.theme and kind = 'plain_good';

  -- Baraja: malos + especiales + buenos sin rol, barajada al azar y
  -- emparejada con los jugadores en orden aleatorio.
  with deck as (
    select d.role, row_number() over (order by gen_random_uuid()) as n
    from (
      select v_bad_role as role from generate_series(1, p_bad_count)
      union all
      select unnest(coalesce(p_special_roles, '{}'))
      union all
      select v_plain_role from generate_series(1, v_plain)
    ) d
  ),
  seats as (
    select p.id, row_number() over (order by gen_random_uuid()) as n
    from public.players p
    where p.room_id = v_room.id
  )
  insert into public.roles_privados (player_id, room_id, role, initial_role, team, power_state)
  select s.id, v_room.id, d.role, d.role, t.team,
         case t.kind
           when 'protect' then
             case when v_room.theme = 'castronegro'
                  then '{"heal": true, "poison": true}'::jsonb
                  else '{"save": true}'::jsonb end
           else '{}'::jsonb
         end
  from seats s
  join deck d using (n)
  join public.theme_roles t on t.theme = v_room.theme and t.role = d.role;

  update public.rooms
  set phase = 'intro', round = 0, version = version + 1, updated_at = now()
  where id = v_room.id;

  -- Solo el aviso, sin datos de rol: cada cliente pide el suyo con obtener_mi_rol.
  perform public._emit(v_room.code, 'partida_iniciada',
    jsonb_build_object('version', v_room.version + 1));
end;
$$;

-- Devuelve solo el rol de quien presenta el token. Los malos reciben además
-- la lista de sus compañeros malos.
create function public.obtener_mi_rol(p_token text)
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
      else null end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: anon solo puede ejecutar las funciones públicas.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.create_room(text, text, text, text) to anon, authenticated;
grant execute on function public.join_room(text, text, text) to anon, authenticated;
grant execute on function public.get_room(text, text) to anon, authenticated;
grant execute on function public.iniciar_partida(text, text, text[], integer) to anon, authenticated;
grant execute on function public.obtener_mi_rol(text) to anon, authenticated;
