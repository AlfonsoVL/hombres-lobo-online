-- Tests del Salvador y el Comediante.

create or replace function pg_temp.expect_error(p_sql text, p_text text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_text in sqlerrm) = 0 then
      raise exception 'Error inesperado: "%", se esperaba "%"', sqlerrm, p_text;
    end if;
    return;
  end;
  raise exception 'Se esperaba un error con "%" en: %', p_text, p_sql;
end;
$$;

create or replace function pg_temp.tok(p_prefix text, i integer) returns text language sql as $$
  select 'token-' || p_prefix || '-' || lpad(i::text, 32, '0');
$$;

create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'Fallo: %', p_msg; end if;
end;
$$;

-- Crea una sala personalizada con tantos jugadores como roles, reparte y fija
-- los roles en el orden dado (J0 es el creador).
create or replace function pg_temp.setup(p_prefix text, p_roles text[])
returns text language plpgsql as $$
declare
  v_code text;
  n integer := array_length(p_roles, 1);
begin
  select room_code into v_code
  from public.create_room('castronegro', 'custom', 'J0', pg_temp.tok(p_prefix, 0));
  for i in 1..n - 1 loop
    perform public.join_room(v_code, 'J' || i, pg_temp.tok(p_prefix, i));
  end loop;
  perform public.iniciar_partida(v_code, pg_temp.tok(p_prefix, 0), '{seer}', 1, false);
  for i in 0..n - 1 loop
    update public.roles_privados rp
    set role = p_roles[i + 1], initial_role = p_roles[i + 1], team = t.team,
        power_state = case when t.kind = 'protect' then '{"heal": true, "poison": true}'::jsonb
                           else '{}'::jsonb end
    from public.players p, public.theme_roles t
    where rp.player_id = p.id and p.name = 'J' || i
      and p.room_id = (select id from public.rooms where code = v_code)
      and t.theme = 'castronegro' and t.role = p_roles[i + 1];
  end loop;
  return v_code;
end;
$$;

create or replace function pg_temp.pid(p_code text, p_name text) returns uuid language sql as $$
  select p.id from public.players p join public.rooms r on r.id = p.room_id
  where r.code = p_code and p.name = p_name;
$$;

create or replace function pg_temp.room(p_code text, p_prefix text) returns jsonb language sql as $$
  select public.get_room(p_code, pg_temp.tok(p_prefix, 0));
$$;

create or replace function pg_temp.advance(p_code text, p_prefix text) returns jsonb language plpgsql as $$
begin
  perform public.avanzar_fase(p_code, pg_temp.tok(p_prefix, 0),
    (pg_temp.room(p_code, p_prefix)->>'version')::integer);
  return pg_temp.room(p_code, p_prefix);
end;
$$;

create or replace function pg_temp.step(p_code text, p_prefix text) returns text language sql as $$
  select pg_temp.room(p_code, p_prefix)->>'night_step';
$$;

create or replace function pg_temp.act(p_code text, p_prefix text, i integer, p_action text,
  p_target text default null, p_target2 text default null) returns jsonb language sql as $$
  select public.accion_nocturna(p_code, pg_temp.tok(p_prefix, i), p_action,
    pg_temp.pid(p_code, p_target), pg_temp.pid(p_code, p_target2));
$$;

create or replace function pg_temp.night(p_code text, p_prefix text, i integer) returns jsonb language sql as $$
  select public.mi_noche(p_code, pg_temp.tok(p_prefix, i));
$$;

create or replace function pg_temp.alive(p_code text, p_name text) returns boolean language sql as $$
  select is_alive from public.players where id = pg_temp.pid(p_code, p_name);
$$;

create or replace function pg_temp.cause(p_code text, p_name text) returns text language sql as $$
  select g.cause from public.game_log g
  where g.player_id = pg_temp.pid(p_code, p_name) and g.event = 'death';
$$;

-- En los tests todos entran en la misma transacción: se ordena la llegada a mano.
create or replace function pg_temp.seat(p_code text) returns void language sql as $$
  update public.players p set joined_at = now() + make_interval(secs => substr(p.name, 2)::integer)
  where p.room_id = (select id from public.rooms where code = p_code);
$$;

create or replace function pg_temp.vote(p_code text, p_prefix text, i integer, p_target text) returns void language sql as $$
  select public.votar(p_code, pg_temp.tok(p_prefix, i), pg_temp.pid(p_code, p_target));
$$;

create or replace function pg_temp.power(p_code text, p_name text) returns jsonb language sql as $$
  select power_state from public.roles_privados where player_id = pg_temp.pid(p_code, p_name);
$$;

create or replace function pg_temp.act_card(p_code text, p_prefix text, i integer, p_action text, p_card text,
  p_target text default null, p_target2 text default null) returns jsonb language sql as $$
  select public.accion_nocturna(p_code, pg_temp.tok(p_prefix, i), p_action,
    pg_temp.pid(p_code, p_target), pg_temp.pid(p_code, p_target2), p_card);
$$;

-- Al repartir, el Comediante recibe 3 cartas de aldeanos con poder nocturno
-- que no están en juego.
do $$
declare
  c text;
  v jsonb;
begin
  select room_code into c from public.create_room('castronegro', 'custom', 'J0', pg_temp.tok('sc', 0));
  for i in 1..6 loop perform public.join_room(c, 'J' || i, pg_temp.tok('sc', i)); end loop;
  perform public.iniciar_partida(c, pg_temp.tok('sc', 0), '{guardian,actor,seer}', 1, false);
  select rp.power_state->'cards' into v from public.roles_privados rp
  join public.rooms r on r.id = rp.room_id where r.code = c and rp.role = 'actor';
  perform pg_temp.check(jsonb_array_length(v) = 2 and v ? 'piper' and v ? 'witch',
    'solo las cartas que no están en juego ' || v::text);

  select room_code into c from public.create_room('castronegro', 'classic', 'J0', pg_temp.tok('sd', 0));
  for i in 1..5 loop perform public.join_room(c, 'J' || i, pg_temp.tok('sd', i)); end loop;
  perform pg_temp.expect_error(format('select public.iniciar_partida(%L, %L, %L, 1, false)',
    c, pg_temp.tok('sd', 0), '{guardian}'), 'no está disponible');
end;
$$;

-- Salvador: protege de los lobos, no al mismo dos noches seguidas.
-- J0 aldeano, J1 lobo, J2 Salvador, J3..J5 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('sg', '{villager,werewolf,guardian,villager,villager,villager}');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.check(pg_temp.step(c, 'sg') = 'guard', 'el Salvador actúa antes que los lobos');
  perform pg_temp.act(c, 'sg', 2, 'guard', 'J3');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.act(c, 'sg', 1, 'kill', 'J3');
  r := pg_temp.advance(c, 'sg');
  perform pg_temp.check(r->>'phase' = 'dawn' and jsonb_array_length(r->'last_deaths') = 0, 'nadie muere ' || r::text);
  perform pg_temp.check(pg_temp.alive(c, 'J3'), 'el protegido sobrevive');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.check(pg_temp.step(c, 'sg') = 'guard', 'noche 2');
  r := pg_temp.night(c, 'sg', 2);
  perform pg_temp.check(r->>'last_protected' = pg_temp.pid(c, 'J3')::text, 've a quién protegió ' || r::text);
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 2, %L, %L)', c, 'sg', 'guard', 'J3'),
    'dos noches seguidas');
  perform pg_temp.act(c, 'sg', 2, 'guard', 'J2');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.act(c, 'sg', 1, 'kill', 'J4');
  perform pg_temp.advance(c, 'sg');
  perform pg_temp.check(not pg_temp.alive(c, 'J4'), 'el no protegido muere');
end;
$$;

-- Salvador contra el Lobo Infecto: el protegido no se infecta.
do $$
declare
  c text;
begin
  c := pg_temp.setup('sh', '{villager,infect_wolf,guardian,villager,villager,villager}');
  perform pg_temp.advance(c, 'sh');
  perform pg_temp.advance(c, 'sh');
  perform pg_temp.act(c, 'sh', 2, 'guard', 'J3');
  perform pg_temp.advance(c, 'sh');
  perform pg_temp.act(c, 'sh', 1, 'kill', 'J3');
  perform pg_temp.advance(c, 'sh');
  perform pg_temp.check(pg_temp.step(c, 'sh') = 'infect', 'turno del Infecto');
  perform pg_temp.act(c, 'sh', 1, 'infect');
  perform pg_temp.advance(c, 'sh');
  perform pg_temp.check(pg_temp.alive(c, 'J3')
    and (select role from public.roles_privados where player_id = pg_temp.pid(c, 'J3')) = 'villager',
    'sigue siendo aldeano');
end;
$$;

-- Comediante: usa una carta por noche y cada carta una sola vez.
-- J0 aldeano, J1 lobo, J2 Comediante, J3..J5 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('sa', '{villager,werewolf,actor,villager,villager,villager}');
  update public.roles_privados set power_state = '{"cards": ["seer", "witch", "guardian"]}'
  where player_id = pg_temp.pid(c, 'J2');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.act(c, 'sa', 1, 'kill', 'J4');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.check(pg_temp.step(c, 'sa') = 'actor', 'turno del Comediante');
  r := pg_temp.night(c, 'sa', 2);
  perform pg_temp.check(jsonb_array_length(r->'cards') = 3 and r->>'victim' = pg_temp.pid(c, 'J4')::text,
    've sus cartas y la víctima ' || r::text);
  perform pg_temp.expect_error(format('select pg_temp.act_card(%L, %L, 2, %L, %L, %L)', c, 'sa', 'compare', 'piper', 'J0'),
    'una de tus cartas');
  perform pg_temp.expect_error(format('select pg_temp.act_card(%L, %L, 2, %L, %L, %L)', c, 'sa', 'see', 'guardian', 'J0'),
    'no puede hacer eso');
  r := pg_temp.act_card(c, 'sa', 2, 'guard', 'guardian', 'J4');
  perform pg_temp.check((r->>'done')::boolean and r->>'card' = 'guardian' and jsonb_array_length(r->'cards') = 2,
    'gasta la carta ' || r::text);
  perform pg_temp.check(not public.avanzar_noche(c, pg_temp.tok('sa', 0),
    (pg_temp.room(c, 'sa')->>'version')::integer), 'lo confirma el Comediante');
  perform pg_temp.check(public.avanzar_noche(c, pg_temp.tok('sa', 2),
    (pg_temp.room(c, 'sa')->>'version')::integer), 'el Comediante pasa el turno');
  perform pg_temp.check(pg_temp.alive(c, 'J4'), 'la carta del Salvador protege');

  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.check(pg_temp.step(c, 'sa') = 'actor', 'noche 2');
  perform pg_temp.expect_error(format('select pg_temp.act_card(%L, %L, 2, %L, %L, %L)', c, 'sa', 'guard', 'guardian', 'J0'),
    'una de tus cartas');
  r := pg_temp.act_card(c, 'sa', 2, 'see', 'seer', 'J1');
  perform pg_temp.check(r->'seen'->>'role' = 'werewolf', 'con la Vidente ve el rol ' || r::text);

  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.advance(c, 'sa');
  perform pg_temp.check(pg_temp.step(c, 'sa') = 'actor', 'noche 3');
  perform pg_temp.act_card(c, 'sa', 2, 'potions', 'witch', 'J1');
  r := pg_temp.advance(c, 'sa');
  perform pg_temp.check(pg_temp.cause(c, 'J1') = 'poisoned' and r->>'winner' = 'good', 'envenena al lobo ' || r::text);
end;
$$;

-- Sin cartas, el Comediante no tiene turno.
do $$
declare
  c text;
begin
  c := pg_temp.setup('sb', '{villager,werewolf,actor,villager,villager}');
  update public.roles_privados set power_state = '{"cards": []}' where player_id = pg_temp.pid(c, 'J2');
  perform pg_temp.advance(c, 'sb');
  perform pg_temp.advance(c, 'sb');
  perform pg_temp.advance(c, 'sb');
  perform pg_temp.check(pg_temp.room(c, 'sb')->>'phase' = 'dawn', 'sin turno del Comediante');
end;
$$;
