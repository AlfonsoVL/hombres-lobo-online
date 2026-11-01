-- Tests de los lobos nuevos: Lobo Feroz, Lobo Infecto, Lobo Blanco y Gran Lobo Malvado.

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

-- Composición: los lobos especiales cuentan como malos y solo van en personalizado.
do $$
declare
  c text;
begin
  select room_code into c from public.create_room('castronegro', 'custom', 'J0', pg_temp.tok('lc', 0));
  for i in 1..5 loop perform public.join_room(c, 'J' || i, pg_temp.tok('lc', i)); end loop;
  perform pg_temp.expect_error(format('select public.iniciar_partida(%L, %L, %L, 0, false)',
    c, pg_temp.tok('lc', 0), '{seer}'), 'al menos 1 malo');
  perform public.iniciar_partida(c, pg_temp.tok('lc', 0), '{big_bad_wolf,white_wolf}', 0, false);
  perform pg_temp.check((select count(*) from public.roles_privados rp join public.rooms r on r.id = rp.room_id
    where r.code = c and rp.team = 'bad') = 2, 'dos lobos especiales y ningún lobo normal');

  select room_code into c from public.create_room('castronegro', 'classic', 'J0', pg_temp.tok('ld', 0));
  for i in 1..5 loop perform public.join_room(c, 'J' || i, pg_temp.tok('ld', i)); end loop;
  perform pg_temp.expect_error(format('select public.iniciar_partida(%L, %L, %L, 1, false)',
    c, pg_temp.tok('ld', 0), '{fierce_wolf}'), 'no está disponible');
end;
$$;

-- Lobo Feroz: segunda víctima mientras no haya muerto ningún lobo.
-- J0 aldeano, J1 lobo, J2 Lobo Feroz, J3 Vidente, J4 Bruja, J5 y J6 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('lf', '{villager,werewolf,fierce_wolf,seer,witch,villager,villager}');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(pg_temp.step(c, 'lf') = 'bad', 'empieza la manada');
  r := pg_temp.night(c, 'lf', 2);
  perform pg_temp.check(r->>'state' = 'act' and r->>'kind' = 'bad', 'el Feroz vota con la manada ' || r::text);
  perform pg_temp.act(c, 'lf', 1, 'kill', 'J5');
  perform pg_temp.act(c, 'lf', 2, 'kill', 'J5');
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 2, %L, %L)', c, 'lf', 'devour', 'J6'), 'No es tu turno');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(pg_temp.step(c, 'lf') = 'fierce', 'turno del Lobo Feroz');
  perform pg_temp.check(pg_temp.night(c, 'lf', 1)->>'state' = 'sleep', 'el lobo normal duerme');
  r := pg_temp.night(c, 'lf', 2);
  perform pg_temp.check(r->>'kind' = 'fierce' and r->>'victim' = pg_temp.pid(c, 'J5')::text,
    'el Feroz ve a la víctima de la manada ' || r::text);
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 2, %L, %L)', c, 'lf', 'devour', 'J5'),
    'ya es la víctima');
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 2, %L, %L)', c, 'lf', 'devour', 'J1'),
    'no sea de tu bando');
  perform pg_temp.act(c, 'lf', 2, 'devour', 'J6');
  perform pg_temp.check((pg_temp.room(c, 'lf')->>'step_done')::boolean, 'Feroz hecho');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(pg_temp.step(c, 'lf') = 'investigate', 'turno de la Vidente');
  perform pg_temp.advance(c, 'lf');
  r := pg_temp.night(c, 'lf', 4);
  perform pg_temp.check(r->>'victim' = pg_temp.pid(c, 'J5')::text and r->>'victim2' = pg_temp.pid(c, 'J6')::text,
    'la Bruja ve las dos víctimas ' || r::text);
  perform pg_temp.act(c, 'lf', 4, 'potions', null, 'J6');
  r := pg_temp.advance(c, 'lf');
  perform pg_temp.check(r->>'phase' = 'dawn', 'amanece');
  perform pg_temp.check(not pg_temp.alive(c, 'J5') and pg_temp.cause(c, 'J5') = 'bad', 'muere la víctima de la manada');
  perform pg_temp.check(pg_temp.alive(c, 'J6'), 'la Bruja salva a la del Feroz');

  -- Noche 2: la manada no vota y el Feroz devora a J6 sin cura.
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(pg_temp.step(c, 'lf') = 'bad', 'noche 2');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(pg_temp.step(c, 'lf') = 'fierce', 'el Feroz actúa aunque la manada no elija');
  perform pg_temp.act(c, 'lf', 2, 'devour', 'J6');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(not pg_temp.alive(c, 'J6') and pg_temp.cause(c, 'J6') = 'fierce', 'muere devorado por el Feroz');

  -- Muere un lobo: el Feroz ya no tiene turno.
  update public.players set is_alive = false where id = pg_temp.pid(c, 'J1');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(pg_temp.step(c, 'lf') = 'bad', 'noche 3');
  perform pg_temp.act(c, 'lf', 2, 'kill', 'J3');
  perform pg_temp.advance(c, 'lf');
  perform pg_temp.check(pg_temp.step(c, 'lf') = 'investigate', 'sin turno del Feroz tras morir un lobo');
end;
$$;

-- Lobo Infecto: convierte a la víctima en lobo, una vez por partida.
-- J0 aldeano, J1 Lobo Infecto, J2 lobo, J3 Vidente, J4 Bruja, J5 aldeano.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('li', '{villager,infect_wolf,werewolf,seer,witch,villager}');
  perform pg_temp.advance(c, 'li');
  perform pg_temp.advance(c, 'li');
  perform pg_temp.act(c, 'li', 1, 'kill', 'J3');
  perform pg_temp.act(c, 'li', 2, 'kill', 'J3');
  perform pg_temp.advance(c, 'li');
  perform pg_temp.check(pg_temp.step(c, 'li') = 'infect', 'turno del Infecto');
  r := pg_temp.night(c, 'li', 1);
  perform pg_temp.check(r->>'kind' = 'infect' and (r->>'can_infect')::boolean
    and r->>'victim' = pg_temp.pid(c, 'J3')::text, 'el Infecto ve a la víctima ' || r::text);
  perform pg_temp.act(c, 'li', 1, 'infect');
  perform pg_temp.advance(c, 'li');
  perform pg_temp.check(pg_temp.step(c, 'li') = 'investigate', 'la Vidente infectada actúa esta noche');
  perform pg_temp.advance(c, 'li');
  r := pg_temp.night(c, 'li', 4);
  perform pg_temp.check(r->>'victim' is null, 'la Bruja no ve víctima ' || r::text);
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 4, %L, null, %L)', c, 'li', 'potions', 'J3'),
    'Solo puedes curar');
  perform pg_temp.advance(c, 'li');
  perform pg_temp.check(pg_temp.alive(c, 'J3'), 'la víctima infectada no muere');
  r := public.obtener_mi_rol(pg_temp.tok('li', 3));
  perform pg_temp.check(r->>'role' = 'werewolf' and r->>'team' = 'bad'
    and (r->'power_state'->>'infected_round')::integer = 1
    and jsonb_array_length(r->'bad_teammates') = 2, 'ahora es lobo ' || r::text);
  perform pg_temp.check(pg_temp.room(c, 'li')->>'winner' = 'bad', 'tres lobos contra tres: ganan los lobos');
end;
$$;

-- Infección ya gastada y sin víctima.
do $$
declare
  c text;
begin
  c := pg_temp.setup('lj', '{villager,infect_wolf,werewolf,seer,villager,villager,villager}');
  perform pg_temp.advance(c, 'lj');
  perform pg_temp.advance(c, 'lj');
  perform pg_temp.advance(c, 'lj');
  perform pg_temp.check(pg_temp.step(c, 'lj') = 'infect', 'turno del Infecto sin víctima');
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 1, %L)', c, 'lj', 'infect'), 'no hay víctima');
  update public.roles_privados set power_state = '{"infect_used": true}' where player_id = pg_temp.pid(c, 'J1');
  perform pg_temp.check(not (pg_temp.night(c, 'lj', 1)->>'can_infect')::boolean, 'ya la usó');
end;
$$;

-- Lobo Blanco: mata a otro lobo las noches pares y gana si queda solo.
-- J0 aldeano, J1 Lobo Blanco, J2 lobo, J3 Vidente, J4..J6 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('lb', '{villager,white_wolf,werewolf,seer,villager,villager,villager}');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.check(pg_temp.night(c, 'lb', 1)->>'kind' = 'bad', 'el Blanco vota con la manada');
  perform pg_temp.act(c, 'lb', 1, 'kill', 'J4');
  perform pg_temp.act(c, 'lb', 2, 'kill', 'J4');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.check(pg_temp.step(c, 'lb') = 'investigate', 'noche 1: el Blanco no tiene turno');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.check(pg_temp.step(c, 'lb') = 'bad', 'noche 2');
  perform pg_temp.check(pg_temp.night(c, 'lb', 1)->>'state' = 'act', 'el Blanco con la manada');
  perform pg_temp.act(c, 'lb', 1, 'kill', 'J5');
  perform pg_temp.act(c, 'lb', 2, 'kill', 'J5');
  perform pg_temp.advance(c, 'lb');
  perform pg_temp.check(pg_temp.step(c, 'lb') = 'white', 'noche 2: turno del Blanco');
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 1, %L, %L)', c, 'lb', 'white_kill', 'J0'),
    'otro lobo');
  perform pg_temp.act(c, 'lb', 1, 'white_kill', 'J2');
  perform pg_temp.advance(c, 'lb');
  r := pg_temp.advance(c, 'lb');
  perform pg_temp.check(r->>'phase' = 'dawn', 'amanece');
  perform pg_temp.check(not pg_temp.alive(c, 'J2') and pg_temp.cause(c, 'J2') = 'white', 'el Blanco mata al lobo');

  -- Con el Blanco vivo los lobos no ganan por número; gana solo si queda solo.
  update public.players set is_alive = false where id in (pg_temp.pid(c, 'J3'), pg_temp.pid(c, 'J6'));
  perform pg_temp.check(public._winner((select id from public.rooms where code = c)) is null,
    'Blanco contra uno: sigue la partida');
  update public.players set is_alive = false where id = pg_temp.pid(c, 'J0');
  perform pg_temp.check(public._winner((select id from public.rooms where code = c)) = 'white_wolf',
    'gana el Lobo Blanco');
end;
$$;

-- Gran Lobo Malvado: la Vidente lo ve como Aldeano.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('lg', '{villager,big_bad_wolf,werewolf,seer,villager,villager}');
  perform pg_temp.advance(c, 'lg');
  perform pg_temp.advance(c, 'lg');
  perform pg_temp.check(pg_temp.night(c, 'lg', 1)->>'kind' = 'bad', 'vota con la manada');
  perform pg_temp.act(c, 'lg', 1, 'kill', 'J4');
  perform pg_temp.act(c, 'lg', 2, 'kill', 'J4');
  perform pg_temp.advance(c, 'lg');
  r := pg_temp.act(c, 'lg', 3, 'see', 'J1');
  perform pg_temp.check(r->'seen'->>'role' = 'villager', 'parece Aldeano ' || r::text);
end;
$$;
