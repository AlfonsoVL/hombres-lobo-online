-- Cuatro lobos nuevos para Castronegro, solo en modo personalizado.
--
--   * Lobo Feroz (fierce_wolf, tipo fierce): vota con la manada y, mientras no
--     haya muerto ningún lobo, se despierta solo después y puede devorar a una
--     segunda víctima. La Bruja puede curar a cualquiera de las dos.
--   * Lobo Infecto (infect_wolf, tipo infect): una vez por partida, después de
--     que la manada elija a su víctima, puede infectarla en vez de matarla. Al
--     amanecer no muere: se convierte en Lobo (pierde su rol anterior) y pasa a
--     la manada. La Bruja no ve víctima esa noche.
--   * Lobo Blanco (white_wolf, tipo white): vota con la manada y las noches
--     pares se despierta solo y puede matar a otro lobo. Gana solo si es el
--     único vivo. Mientras viva, los lobos no ganan por igualar en número: la
--     partida sigue hasta que no quede ningún lobo (gana la aldea), solo quede
--     él (gana el Lobo Blanco) o solo queden lobos con él ya muerto.
--   * Gran Lobo Malvado (big_bad_wolf, tipo disguised): vota con la manada y,
--     para la Vidente y la Niña, parece un Aldeano.
--
-- Todos son del bando de los lobos (team = 'bad'): se conocen entre sí y votan
-- juntos. La manada ya no es «tipo bad» sino «bando bad» (_is_bad).
--
-- En el modo personalizado el contador de lobos son los lobos normales; los
-- especiales se suman. Puede ser 0 si hay al menos un lobo especial.

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

alter table public.theme_roles drop constraint theme_roles_kind_check;
alter table public.theme_roles add constraint theme_roles_kind_check check (kind in (
  'bad', 'plain_good', 'investigate', 'protect', 'shoot_on_death', 'link', 'spy', 'swap',
  'fierce', 'infect', 'white', 'disguised'));

insert into public.theme_roles (theme, role, kind, team, classic) values
  ('castronegro', 'fierce_wolf',  'fierce',    'bad', false),
  ('castronegro', 'infect_wolf',  'infect',    'bad', false),
  ('castronegro', 'white_wolf',   'white',     'bad', false),
  ('castronegro', 'big_bad_wolf', 'disguised', 'bad', false);

alter table public.rooms drop constraint rooms_winner_check;
alter table public.rooms add constraint rooms_winner_check
  check (winner in ('bad', 'good', 'lovers', 'white_wolf'));

-- ---------------------------------------------------------------------------
-- Funciones internas
-- ---------------------------------------------------------------------------

-- Si el jugador es de la manada (cualquier lobo, también los infectados).
create function public._is_bad(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rp.team = 'bad' from public.roles_privados rp where rp.player_id = p_player), false);
$$;

-- Rol que ven la Vidente y la Niña: el Gran Lobo Malvado parece un Aldeano.
create function public._seen_role(p_player uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.kind = 'disguised'
              then (select t2.role from public.theme_roles t2 where t2.theme = t.theme and t2.kind = 'plain_good')
              else rp.role end
  from public.roles_privados rp
  join public.rooms r on r.id = rp.room_id
  join public.theme_roles t on t.theme = r.theme and t.role = rp.role
  where rp.player_id = p_player;
$$;

-- Si ha muerto algún lobo en la sala (para el Lobo Feroz).
create function public._bad_died(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    join public.roles_privados rp on rp.player_id = p.id
    where p.room_id = p_room_id and not p.is_alive and rp.team = 'bad');
$$;

-- Si la víctima de esta noche ha sido infectada.
create function public._infected_tonight(p_room public.rooms)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.night_actions a
    where a.room_id = p_room.id and a.round = p_room.round and a.action = 'infect');
$$;

-- Segunda víctima del Lobo Feroz esta noche (o null).
create function public._fierce_victim(p_room public.rooms)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.target_id from public.night_actions a
  where a.room_id = p_room.id and a.round = p_room.round and a.action = 'devour'
  limit 1;
$$;

create or replace function public._night_order()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['swap', 'link', 'bad', 'infect', 'fierce', 'white', 'investigate', 'protect'];
$$;

-- Si en esta ronda hay turno para un tipo:
--   * Ladrón y Cupido solo la primera noche.
--   * Lobo Blanco solo las noches pares.
--   * Lobo Feroz mientras no haya muerto ningún lobo.
--   * Manada y Lobo Feroz solo si queda alguien vivo que no sea lobo.
--   * La manada es cualquier lobo vivo; el resto, quien tenga ese tipo.
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
     and (p_kind not in ('bad', 'fierce') or exists (
       select 1 from public.players p
       where p.room_id = p_room.id and p.is_alive and not public._is_bad(p.id)))
     and exists (
       select 1 from public.players p
       where p.room_id = p_room.id and p.is_alive
         and case when p_kind = 'bad' then public._is_bad(p.id)
                  else public._kind_of(p.id) = p_kind end);
$$;

-- El turno de la manada está hecho si todos coinciden o se ha acabado el tiempo.
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
      where p.room_id = p_room.id and p.is_alive and public._is_bad(p.id))
    else exists (
      select 1 from public.night_actions a
      where a.room_id = p_room.id and a.round = p_room.round and a.step = p_room.night_step)
  end;
$$;

-- Bando ganador o null. Mismas reglas que src/lib/game/victory.ts.
create or replace function public._winner(p_room_id uuid)
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
  v_white boolean;
begin
  select count(*), count(*) filter (where rp.team = 'bad'),
         coalesce(bool_or(rp.role = 'white_wolf'), false)
  into v_alive, v_bad, v_white
  from public.players p
  join public.roles_privados rp on rp.player_id = p.id
  where p.room_id = p_room_id and p.is_alive;

  -- El Lobo Blanco gana si es el único vivo.
  if v_white and v_alive = 1 then
    return 'white_wolf';
  end if;

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
  -- Mientras viva el Lobo Blanco, los lobos no ganan por número.
  if v_white then return null; end if;
  if v_bad >= v_alive - v_bad then return 'bad'; end if;
  return null;
end;
$$;

-- Resuelve la noche: infección, víctimas de la manada y del Lobo Feroz,
-- pociones, protección, Lobo Blanco y la Niña.
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
    perform public._kill(p_room.id, p_room.night_victim);
  end if;

  -- Segunda víctima del Lobo Feroz, salvo que la Bruja la cure.
  if v_fierce is not null and not exists (
      select 1 from public.night_actions a
      where a.room_id = p_room.id and a.round = p_room.round
        and a.action = 'potions' and a.target2_id = v_fierce) then
    perform set_config('lobos.causa', 'fierce', true);
    perform public._kill(p_room.id, v_fierce);
    perform set_config('lobos.causa', '', true);
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

  update public.rooms set phase = 'dawn', night_step = null where id = p_room.id;
  perform public._after_deaths(p_room.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones públicas
-- ---------------------------------------------------------------------------

-- iniciar_partida: igual que antes, pero los lobos especiales cuentan como
-- malos, así que el número de lobos normales puede ser 0 si hay alguno.
create or replace function public.iniciar_partida(
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
  v_special_bad integer;
  v_plain integer;
  v_bad_role text;
  v_plain_role text;
  v_role text;
  v_extra integer := 0;
  v_deck text[];
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

  -- Cada rol especial solo puede salir una vez por partida, en cualquier modo.
  if v_specials <> (select count(distinct r) from unnest(p_special_roles) r) then
    raise exception 'Cada rol especial solo puede elegirse una vez' using errcode = '22023';
  end if;

  select count(*) into v_special_bad from public.theme_roles t
  where t.theme = v_room.theme and t.team = 'bad' and t.role = any (coalesce(p_special_roles, '{}'));

  if p_bad_count is null or p_bad_count < 0 or p_bad_count + v_special_bad < 1 then
    raise exception 'Tiene que haber al menos 1 malo' using errcode = '22023';
  end if;

  v_plain := v_players - p_bad_count - v_specials;
  if v_plain < 0 then
    raise exception 'Con % jugadores, % malos y % roles especiales no caben. Reduce alguno.',
      v_players, p_bad_count, v_specials using errcode = '22023';
  end if;

  select role into v_bad_role from public.theme_roles
  where theme = v_room.theme and kind = 'bad';
  select role into v_plain_role from public.theme_roles
  where theme = v_room.theme and kind = 'plain_good';

  -- Si hay Ladrón, la baraja lleva 2 buenos sin rol extra. El Ladrón siempre
  -- se reparte; las 2 cartas que sobran (que pueden ser malos) se guardan en
  -- undealt_cards para que el Ladrón elija la primera noche.
  if 'thief' = any (coalesce(p_special_roles, '{}')) then
    v_extra := 2;
  end if;

  select array_agg(d.role order by d.role = 'thief' desc, gen_random_uuid())
  into v_deck
  from (
    select v_bad_role as role from generate_series(1, p_bad_count)
    union all
    select unnest(coalesce(p_special_roles, '{}'))
    union all
    select v_plain_role from generate_series(1, v_plain + v_extra)
  ) d;

  with seats as (
    select p.id, row_number() over (order by gen_random_uuid()) as n
    from public.players p
    where p.room_id = v_room.id
  )
  insert into public.roles_privados (player_id, room_id, role, initial_role, team, power_state)
  select s.id, v_room.id, v_deck[s.n], v_deck[s.n], t.team,
         case t.kind
           when 'protect' then
             case when v_room.theme = 'castronegro'
                  then '{"heal": true, "poison": true}'::jsonb
                  else '{"save": true}'::jsonb end
           else '{}'::jsonb
         end
  from seats s
  join public.theme_roles t on t.theme = v_room.theme and t.role = v_deck[s.n];

  insert into public.undealt_cards (room_id, role)
  select v_room.id, v_deck[i]
  from generate_series(v_players + 1, array_length(v_deck, 1)) i;

  update public.rooms
  set phase = 'intro', round = 0, version = version + 1, updated_at = now()
  where id = v_room.id;

  perform public._emit(v_room.code, 'partida_iniciada',
    jsonb_build_object('version', v_room.version + 1));
end;
$$;

-- Acción nocturna del jugador que tiene el turno.
--   kill (manada): p_target. Se puede cambiar el voto mientras dure el turno.
--   spy (Niña): sin objetivo. Devuelve si la descubren o qué rol ve.
--   swap (Ladrón): p_card, una de las dos cartas sin repartir.
--   link (Cupido / Androide): p_target y p_target2.
--   see (Vidente / Científico): p_target. Devuelve su rol.
--   protect (Médico): p_target.
--   potions (Bruja): p_target = envenenado, p_target2 = curado (una víctima). Ambos opcionales.
--   infect (Lobo Infecto): sin objetivo; infecta a la víctima de la manada.
--   devour (Lobo Feroz): p_target, segunda víctima.
--   white_kill (Lobo Blanco): p_target, otro lobo.
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

  -- En el turno de la manada solo se vota (o espía la Niña); en los demás,
  -- actúa quien tiene ese tipo de rol.
  if not (case when v_room.night_step = 'bad'
               then (v_pack and p_action = 'kill') or (v_kind = 'spy' and p_action = 'spy')
               else v_kind = v_room.night_step end) then
    raise exception 'No es tu turno' using errcode = 'P0001';
  end if;

  -- Objetivos: siempre jugadores vivos de esta sala.
  if (p_target is not null and not exists (
        select 1 from public.players where id = p_target and room_id = v_room.id and is_alive))
     or (p_target2 is not null and not exists (
        select 1 from public.players where id = p_target2 and room_id = v_room.id and is_alive)) then
    raise exception 'Elige a un jugador vivo de la partida' using errcode = '22023';
  end if;

  -- Una acción por turno (el voto de la manada se puede cambiar).
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
    if (v_rp.power_state->>'last_spy_round')::integer = v_room.round - 1 then
      raise exception 'No puedes espiar dos noches seguidas' using errcode = 'P0001';
    end if;
    update public.roles_privados
    set power_state = power_state || jsonb_build_object('last_spy_round', v_room.round)
    where player_id = v_me.id;
    -- Con un 50 % la descubren; si no, ve a un lobo o a un bueno sin rol al azar.
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
      -- Víctimas que puede curar: la de la manada (si no la infectaron) y la del Lobo Feroz.
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

-- Reacciones de la manada: igual que antes, con cualquier lobo.
create or replace function public.reaccion_malos(
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
     or not v_me.is_alive or not public._is_bad(v_me.id) then
    raise exception 'No es tu turno' using errcode = 'P0001';
  end if;
  if public._bad_time_up(v_room) then
    raise exception 'Se ha acabado el tiempo' using errcode = 'P0001';
  end if;
  if not exists (
       select 1 from public.players
       where id = p_target and room_id = v_room.id and is_alive)
     or public._is_bad(p_target) then
    raise exception 'Elige a una víctima que no sea de tu bando' using errcode = '22023';
  end if;
  if p_reaction is not null and p_reaction not in ('yes', 'no', 'suspect')
     and not (p_reaction like 'role:%'
              and substr(p_reaction, 6) = any (public._good_roles_dealt(v_room))) then
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

-- Lo que el jugador necesita para su turno de noche. Solo datos propios.
--   state: act (le toca), wait (actúa más tarde esta noche), sleep, dead.
--   kind: el tipo con el que actúa ahora ('bad' para cualquier lobo en el
--   turno de la manada).
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

  -- Turnos en que actúa: la Niña en el de la manada; los lobos en el de la
  -- manada y, los especiales, también en el suyo.
  v_steps := case
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
        -- Los lobos ven los votos de sus compañeros para ponerse de acuerdo.
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

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke all on function
  public._is_bad(uuid),
  public._seen_role(uuid),
  public._bad_died(uuid),
  public._infected_tonight(public.rooms),
  public._fierce_victim(public.rooms)
from public, anon, authenticated;
