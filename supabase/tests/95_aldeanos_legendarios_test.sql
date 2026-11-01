-- Tests de los aldeanos nuevos: Caballero, Anciano, Tonto del Pueblo, Chivo Expiatorio y Flautista.

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

-- Composición: solo en modo personalizado.
do $$
declare
  c text;
begin
  select room_code into c from public.create_room('castronegro', 'custom', 'J0', pg_temp.tok('vac', 0));
  for i in 1..6 loop perform public.join_room(c, 'J' || i, pg_temp.tok('vac', i)); end loop;
  perform public.iniciar_partida(c, pg_temp.tok('vac', 0), '{rusty_knight,elder,village_idiot,scapegoat,piper}', 1, false);
  perform pg_temp.check((select count(*) from public.roles_privados rp join public.rooms r on r.id = rp.room_id
    where r.code = c and rp.role in ('rusty_knight', 'elder', 'village_idiot', 'scapegoat', 'piper')) = 5,
    'se reparten los cinco aldeanos');

  select room_code into c from public.create_room('castronegro', 'classic', 'J0', pg_temp.tok('vad', 0));
  for i in 1..5 loop perform public.join_room(c, 'J' || i, pg_temp.tok('vad', i)); end loop;
  perform pg_temp.expect_error(format('select public.iniciar_partida(%L, %L, %L, 1, false)',
    c, pg_temp.tok('vad', 0), '{elder}'), 'no está disponible');
end;
$$;

-- Caballero: devorado, contagia el tétanos al siguiente lobo de la lista, que
-- muere al final de la noche siguiente.
-- J0 aldeano, J1 lobo, J2 Caballero, J3 lobo, J4..J6 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('vak', '{villager,werewolf,rusty_knight,werewolf,villager,villager,villager}');
  perform pg_temp.seat(c);
  perform pg_temp.advance(c, 'vak');
  perform pg_temp.advance(c, 'vak');
  perform pg_temp.act(c, 'vak', 1, 'kill', 'J2');
  perform pg_temp.act(c, 'vak', 3, 'kill', 'J2');
  r := pg_temp.advance(c, 'vak');
  perform pg_temp.check(r->>'phase' = 'dawn', 'amanece');
  perform pg_temp.check(not pg_temp.alive(c, 'J2') and pg_temp.cause(c, 'J2') = 'bad', 'devoran al Caballero');
  perform pg_temp.check((pg_temp.power(c, 'J3')->>'tetanus_round')::integer = 2, 'J3 tiene el tétanos');
  perform pg_temp.check(pg_temp.power(c, 'J1')->>'tetanus_round' is null, 'J1 no');
  perform pg_temp.advance(c, 'vak');
  perform pg_temp.advance(c, 'vak');
  r := pg_temp.advance(c, 'vak');
  perform pg_temp.check(pg_temp.alive(c, 'J3'), 'J3 sigue vivo durante el día');
  perform pg_temp.act(c, 'vak', 1, 'kill', 'J4');
  perform pg_temp.act(c, 'vak', 3, 'kill', 'J4');
  r := pg_temp.advance(c, 'vak');
  perform pg_temp.check(r->>'phase' = 'dawn', 'amanece la noche 2');
  perform pg_temp.check(not pg_temp.alive(c, 'J3') and pg_temp.cause(c, 'J3') = 'tetanus', 'J3 muere de tétanos');
  perform pg_temp.check(not pg_temp.alive(c, 'J4'), 'y la víctima de la noche');
  perform pg_temp.check(pg_temp.alive(c, 'J1'), 'J1 sigue vivo');

  -- Dando la vuelta: el Caballero es el último y el lobo siguiente es J1.
  c := pg_temp.setup('val', '{villager,werewolf,villager,werewolf,villager,rusty_knight}');
  perform pg_temp.seat(c);
  perform pg_temp.advance(c, 'val');
  perform pg_temp.advance(c, 'val');
  perform pg_temp.act(c, 'val', 1, 'kill', 'J5');
  perform pg_temp.act(c, 'val', 3, 'kill', 'J5');
  perform pg_temp.advance(c, 'val');
  perform pg_temp.check((pg_temp.power(c, 'J1')->>'tetanus_round')::integer = 2, 'da la vuelta hasta J1');
end;
$$;

-- Anciano: resiste el primer ataque.
-- J0 aldeano, J1 lobo, J2 Anciano, J3 Bruja, J4 y J5 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('vae', '{villager,werewolf,elder,witch,villager,villager}');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.act(c, 'vae', 1, 'kill', 'J2');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.check(pg_temp.step(c, 'vae') = 'protect', 'turno de la Bruja');
  r := pg_temp.advance(c, 'vae');
  perform pg_temp.check(r->>'phase' = 'dawn' and jsonb_array_length(r->'last_deaths') = 0, 'nadie muere ' || r::text);
  perform pg_temp.check(pg_temp.alive(c, 'J2') and (pg_temp.power(c, 'J2')->>'wounded')::boolean, 'el Anciano resiste');
  perform pg_temp.check(exists (select 1 from public.game_log where player_id = pg_temp.pid(c, 'J2') and event = 'resist'),
    'queda en la crónica');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.act(c, 'vae', 1, 'kill', 'J2');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.advance(c, 'vae');
  perform pg_temp.check(not pg_temp.alive(c, 'J2') and pg_temp.cause(c, 'J2') = 'bad', 'al segundo ataque muere');
  perform pg_temp.check(not (pg_temp.room(c, 'vae')->>'powers_lost')::boolean, 'morir por lobos no quita poderes');
end;
$$;

-- Anciano linchado: los aldeanos pierden sus poderes.
-- J0 aldeano, J1 lobo, J2 Anciano, J3 Vidente, J4 Cazador, J5 y J6 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('vam', '{villager,werewolf,elder,seer,hunter,villager,villager}');
  perform pg_temp.advance(c, 'vam');
  perform pg_temp.advance(c, 'vam');
  perform pg_temp.advance(c, 'vam');
  perform pg_temp.check(pg_temp.step(c, 'vam') = 'investigate', 'la Vidente tiene turno');
  perform pg_temp.advance(c, 'vam');
  perform pg_temp.advance(c, 'vam');
  perform pg_temp.vote(c, 'vam', 0, 'J2');
  perform pg_temp.vote(c, 'vam', 1, 'J2');
  perform pg_temp.vote(c, 'vam', 3, 'J2');
  r := pg_temp.advance(c, 'vam');
  perform pg_temp.check(r->>'phase' = 'lynch' and pg_temp.cause(c, 'J2') = 'lynched', 'linchan al Anciano');
  perform pg_temp.check((r->>'powers_lost')::boolean, 'los aldeanos pierden sus poderes');
  perform pg_temp.advance(c, 'vam');
  perform pg_temp.check(pg_temp.step(c, 'vam') = 'bad', 'noche 2');
  perform pg_temp.act(c, 'vam', 1, 'kill', 'J4');
  r := pg_temp.advance(c, 'vam');
  perform pg_temp.check(r->>'phase' = 'dawn', 'la Vidente ya no tiene turno ' || r::text);
  perform pg_temp.check(not pg_temp.alive(c, 'J4') and r->>'pending_shot' is null, 'el Cazador no dispara');
end;
$$;

-- Anciano envenenado por la Bruja: también pierden los poderes.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('vap', '{villager,werewolf,elder,witch,seer,villager}');
  perform pg_temp.advance(c, 'vap');
  perform pg_temp.advance(c, 'vap');
  perform pg_temp.advance(c, 'vap');
  perform pg_temp.advance(c, 'vap');
  perform pg_temp.check(pg_temp.step(c, 'vap') = 'protect', 'turno de la Bruja');
  perform pg_temp.act(c, 'vap', 3, 'potions', 'J2');
  r := pg_temp.advance(c, 'vap');
  perform pg_temp.check(pg_temp.cause(c, 'J2') = 'poisoned' and (r->>'powers_lost')::boolean, 'envenenado: sin poderes');
  perform pg_temp.advance(c, 'vap');
  perform pg_temp.advance(c, 'vap');
  perform pg_temp.advance(c, 'vap');
  r := pg_temp.advance(c, 'vap');
  perform pg_temp.check(r->>'phase' = 'dawn', 'noche 2 solo con la manada ' || r::text);
end;
$$;

-- Tonto del Pueblo: la primera vez se le perdona y pierde el voto.
-- J0 aldeano, J1 lobo, J2 Tonto, J3..J5 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('vat', '{villager,werewolf,village_idiot,villager,villager,villager}');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.vote(c, 'vat', 0, 'J2');
  perform pg_temp.vote(c, 'vat', 3, 'J2');
  perform pg_temp.vote(c, 'vat', 4, 'J2');
  r := pg_temp.advance(c, 'vat');
  perform pg_temp.check(pg_temp.alive(c, 'J2') and r->>'pardoned' = pg_temp.pid(c, 'J2')::text
    and jsonb_array_length(r->'last_deaths') = 0, 'se le perdona ' || r::text);
  perform pg_temp.check((select revealed_role from public.players where id = pg_temp.pid(c, 'J2')) = 'village_idiot',
    'su carta queda a la vista');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.check(pg_temp.room(c, 'vat')->>'phase' = 'day', 'día 2');
  perform pg_temp.expect_error(format('select pg_temp.vote(%L, %L, 2, %L)', c, 'vat', 'J1'), 'ya no puede votar');
  perform pg_temp.vote(c, 'vat', 0, 'J2');
  perform pg_temp.vote(c, 'vat', 3, 'J2');
  perform pg_temp.advance(c, 'vat');
  perform pg_temp.check(not pg_temp.alive(c, 'J2') and pg_temp.cause(c, 'J2') = 'lynched', 'la segunda vez muere');
end;
$$;

-- Chivo Expiatorio: muere en el empate y elige a los votantes del día siguiente.
-- J0 aldeano, J1 lobo, J2 Chivo, J3..J6 aldeanos.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('vas', '{villager,werewolf,scapegoat,villager,villager,villager,villager}');
  perform pg_temp.advance(c, 'vas');
  perform pg_temp.advance(c, 'vas');
  perform pg_temp.advance(c, 'vas');
  perform pg_temp.advance(c, 'vas');
  perform pg_temp.vote(c, 'vas', 0, 'J1');
  perform pg_temp.vote(c, 'vas', 3, 'J4');
  r := pg_temp.advance(c, 'vas');
  perform pg_temp.check(not pg_temp.alive(c, 'J2') and pg_temp.cause(c, 'J2') = 'scapegoat', 'muere el Chivo');
  perform pg_temp.check((r->>'scapegoat')::boolean and r->>'pending_voters' = pg_temp.pid(c, 'J2')::text,
    'tiene que elegir ' || r::text);
  perform pg_temp.expect_error(format('select pg_temp.advance(%L, %L)', c, 'vas'), 'Chivo Expiatorio');
  perform pg_temp.expect_error(format('select public.elegir_votantes(%L, %L, array[%L]::uuid[])',
    c, pg_temp.tok('vas', 0), pg_temp.pid(c, 'J0')), 'no puedes elegir');
  perform pg_temp.expect_error(format('select public.elegir_votantes(%L, %L, array[]::uuid[])',
    c, pg_temp.tok('vas', 2)), 'al menos a un jugador');
  perform public.elegir_votantes(c, pg_temp.tok('vas', 2), array[pg_temp.pid(c, 'J0'), pg_temp.pid(c, 'J3')]);
  perform pg_temp.advance(c, 'vas');
  perform pg_temp.advance(c, 'vas');
  perform pg_temp.advance(c, 'vas');
  perform pg_temp.check(pg_temp.room(c, 'vas')->>'phase' = 'day', 'día 2');
  perform pg_temp.expect_error(format('select pg_temp.vote(%L, %L, 4, %L)', c, 'vas', 'J1'), 'no te deja votar');
  perform pg_temp.vote(c, 'vas', 0, 'J1');
  perform pg_temp.vote(c, 'vas', 3, 'J1');
  r := pg_temp.advance(c, 'vas');
  perform pg_temp.check(r->>'winner' = 'good', 'linchan al lobo y gana la aldea');
end;
$$;

-- Flautista: sabe si dos jugadores son del mismo bando.
-- J0 aldeano, J1 lobo, J2 Flautista, J3 Gran Lobo Malvado, J4 aldeano, J5 aldeano.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('vaf', '{villager,werewolf,piper,big_bad_wolf,villager,villager}');
  perform pg_temp.advance(c, 'vaf');
  perform pg_temp.advance(c, 'vaf');
  perform pg_temp.advance(c, 'vaf');
  perform pg_temp.check(pg_temp.step(c, 'vaf') = 'compare', 'turno del Flautista');
  perform pg_temp.expect_error(format('select pg_temp.act(%L, %L, 2, %L, %L, %L)', c, 'vaf', 'compare', 'J2', 'J1'),
    'otros dos');
  r := pg_temp.act(c, 'vaf', 2, 'compare', 'J0', 'J1');
  perform pg_temp.check(r->'compared'->>'same' = 'false', 'aldeano y lobo: distinto bando ' || r::text);
  perform pg_temp.check(not public.avanzar_noche(c, pg_temp.tok('vaf', 0),
    (pg_temp.room(c, 'vaf')->>'version')::integer), 'no pasa solo: lo confirma el Flautista');
  perform pg_temp.check(public.avanzar_noche(c, pg_temp.tok('vaf', 2),
    (pg_temp.room(c, 'vaf')->>'version')::integer), 'el Flautista pasa el turno');
  perform pg_temp.advance(c, 'vaf');
  perform pg_temp.advance(c, 'vaf');
  perform pg_temp.advance(c, 'vaf');
  perform pg_temp.advance(c, 'vaf');
  perform pg_temp.check(pg_temp.step(c, 'vaf') = 'compare', 'noche 2');
  r := pg_temp.act(c, 'vaf', 2, 'compare', 'J3', 'J4');
  perform pg_temp.check(r->'compared'->>'same' = 'true', 'el Gran Lobo Malvado parece aldeano ' || r::text);
end;
$$;
