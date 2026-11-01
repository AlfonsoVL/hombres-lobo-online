-- Tests de la noche sin el creador: avanzar_noche por tiempo, por acción hecha o por el rol activo.

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

-- Crea una sala de 6, reparte y fija los roles en el orden dado.
create or replace function pg_temp.setup(p_prefix text, p_roles text[], p_mayor boolean)
returns text language plpgsql as $$
declare
  v_code text;
begin
  select room_code into v_code
  from public.create_room('castronegro', 'custom', 'J0', pg_temp.tok(p_prefix, 0));
  for i in 1..5 loop
    perform public.join_room(v_code, 'J' || i, pg_temp.tok(p_prefix, i));
  end loop;
  perform public.iniciar_partida(v_code, pg_temp.tok(p_prefix, 0),
    '{seer,witch,hunter,cupid}', 1, p_mayor);
  for i in 0..5 loop
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

create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'Fallo: %', p_msg; end if;
end;
$$;

-- Para simular que han pasado los 60 s.
create or replace function pg_temp.time_up(p_code text) returns void language sql as $$
  update public.rooms set step_started_at = now() - interval '61 seconds' where code = p_code;
$$;

create or replace function pg_temp.version(p_code text, p_prefix text) returns integer language sql as $$
  select (pg_temp.room(p_code, p_prefix)->>'version')::integer;
$$;

-- Pide el avance desde el móvil del jugador i.
create or replace function pg_temp.night(p_code text, p_prefix text, i integer) returns boolean language sql as $$
  select public.avanzar_noche(p_code, pg_temp.tok(p_prefix, i), pg_temp.version(p_code, p_prefix));
$$;

create or replace function pg_temp.step(p_code text, p_prefix text) returns text language sql as $$
  select pg_temp.room(p_code, p_prefix)->>'night_step';
$$;

-- J0 aldeano (creador), J1 lobo, J2 Cupido, J3 Vidente, J4 Bruja, J5 aldeano.
do $$
declare
  c text;
  v integer;
  r jsonb;
begin
  c := pg_temp.setup('an', '{villager,werewolf,cupid,seer,witch,villager}', false);
  perform pg_temp.advance(c, 'an');
  r := pg_temp.advance(c, 'an');
  perform pg_temp.check(r->>'night_step' = 'link', 'empieza Cupido ' || r::text);
  perform pg_temp.check((r->>'step_ends_at')::timestamptz > now() + interval '59 seconds',
    'Cupido tiene cuenta atrás ' || r::text);

  -- Nadie puede pasar un turno que no ha terminado si no es el rol activo.
  perform pg_temp.check(not pg_temp.night(c, 'an', 5), 'J5 no puede pasar el turno de Cupido');
  perform pg_temp.check(not pg_temp.night(c, 'an', 0), 'el creador tampoco con avanzar_noche');
  perform pg_temp.check(pg_temp.step(c, 'an') = 'link', 'sigue Cupido');

  -- Vía 2: Cupido actúa y cualquier móvil pasa el turno.
  perform public.accion_nocturna(c, pg_temp.tok('an', 2), 'link', pg_temp.pid(c, 'J3'), pg_temp.pid(c, 'J5'));
  v := pg_temp.version(c, 'an');
  perform pg_temp.check(public.avanzar_noche(c, pg_temp.tok('an', 5), v), 'acción hecha: avanza');
  perform pg_temp.check(pg_temp.step(c, 'an') = 'bad', 'turno de los malos');
  -- Otro móvil con la versión vieja no se salta el turno siguiente.
  perform pg_temp.check(not public.avanzar_noche(c, pg_temp.tok('an', 0), v), 'versión vieja');
  perform pg_temp.check(pg_temp.step(c, 'an') = 'bad', 'sigue el turno de los malos');

  -- Los malos no tienen el botón: el lobo no puede pasar sin votar.
  perform pg_temp.check(not pg_temp.night(c, 'an', 1), 'el lobo no pasa sin votar');
  perform public.accion_nocturna(c, pg_temp.tok('an', 1), 'kill', pg_temp.pid(c, 'J0'));
  perform pg_temp.check(pg_temp.night(c, 'an', 3), 'votado: avanza');
  perform pg_temp.check(pg_temp.step(c, 'an') = 'investigate', 'turno de la Vidente');
  perform pg_temp.check((select night_victim from public.rooms where code = c) = pg_temp.pid(c, 'J0'),
    'víctima fijada al cerrar el turno de los malos');

  -- La Vidente no pasa sola al ver el rol: lo confirma ella (vía 3).
  perform public.accion_nocturna(c, pg_temp.tok('an', 3), 'see', pg_temp.pid(c, 'J1'));
  perform pg_temp.check((pg_temp.room(c, 'an')->>'step_done')::boolean, 'Vidente hecha');
  perform pg_temp.check(not pg_temp.night(c, 'an', 5), 'nadie más la corta mientras mira');
  perform pg_temp.check(pg_temp.night(c, 'an', 3), 'la Vidente confirma');
  perform pg_temp.check(pg_temp.step(c, 'an') = 'protect', 'turno de la Bruja');

  -- Vía 1: se acaba el tiempo de la Bruja; ya no puede actuar y cualquiera pasa.
  perform pg_temp.time_up(c);
  perform pg_temp.check((pg_temp.room(c, 'an')->>'step_done') = 'false', 'la Bruja no ha actuado');
  perform pg_temp.expect_error(format('select public.accion_nocturna(%L, %L, %L)',
    c, pg_temp.tok('an', 4), 'potions'), 'acabado el tiempo');
  perform pg_temp.check(pg_temp.night(c, 'an', 5), 'tiempo acabado: avanza');
  r := pg_temp.room(c, 'an');
  perform pg_temp.check(r->>'phase' = 'dawn' and r->>'night_step' is null and r->>'step_ends_at' is null,
    'último turno: amanece ' || r::text);
  perform pg_temp.check(not (select is_alive from public.players where id = pg_temp.pid(c, 'J0')),
    'muere la víctima');
  perform pg_temp.check(not pg_temp.night(c, 'an', 5), 'de día no hace nada');
end;
$$;

-- Vía 3 sin actuar: el rol activo pasa su turno. Un muerto no puede.
do $$
declare
  c text;
begin
  c := pg_temp.setup('am', '{villager,werewolf,cupid,seer,witch,villager}', false);
  perform pg_temp.advance(c, 'am');
  perform pg_temp.advance(c, 'am');
  perform pg_temp.check(pg_temp.night(c, 'am', 2), 'Cupido pasa sin elegir');
  perform pg_temp.check(pg_temp.step(c, 'am') = 'bad', 'turno de los malos');
  perform pg_temp.check(not exists (select 1 from public.links l join public.rooms r on r.id = l.room_id
    where r.code = c), 'sin pareja');
  -- El creador sigue pudiendo saltar el turno con avanzar_fase.
  perform pg_temp.advance(c, 'am');
  perform pg_temp.check(pg_temp.step(c, 'am') = 'investigate', 'el creador salta a los malos');
  update public.players set is_alive = false where id = pg_temp.pid(c, 'J3');
  perform pg_temp.check(not pg_temp.night(c, 'am', 3), 'la Vidente muerta no pasa el turno');
end;
$$;
