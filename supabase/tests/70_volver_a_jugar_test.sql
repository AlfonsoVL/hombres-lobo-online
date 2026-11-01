-- Tests de volver a jugar con los mismos participantes y de quitar jugadores.

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

do $$
declare
  c text;
  r jsonb;
  v_version integer;
begin
  c := pg_temp.setup('r', '{villager,werewolf,seer,witch,hunter,cupid}', true);
  perform pg_temp.expect_error(format('select public.volver_a_jugar(%L, %L)', c, pg_temp.tok('r', 0)),
    'no ha terminado');

  -- Partida rápida: los lobos matan a J2 y de día linchan al lobo.
  perform pg_temp.advance(c, 'r');
  r := pg_temp.advance(c, 'r');
  perform public.accion_nocturna(c, pg_temp.tok('r', 5), 'link', pg_temp.pid(c, 'J0'), pg_temp.pid(c, 'J3'));
  r := pg_temp.advance(c, 'r');
  perform public.accion_nocturna(c, pg_temp.tok('r', 1), 'kill', pg_temp.pid(c, 'J2'));
  while (pg_temp.room(c, 'r')->>'phase') = 'night' loop
    perform pg_temp.advance(c, 'r');
  end loop;
  r := pg_temp.advance(c, 'r');
  perform pg_temp.check(r->>'phase' = 'day', 'día ' || r::text);
  for i in 0..5 loop
    begin
      perform public.votar(c, pg_temp.tok('r', i), pg_temp.pid(c, 'J1'));
    exception when others then null; -- los muertos no votan
    end;
  end loop;
  r := pg_temp.advance(c, 'r');
  perform pg_temp.check(r->>'phase' = 'finished', 'fin ' || r::text);

  -- Solo el creador.
  perform pg_temp.expect_error(format('select public.volver_a_jugar(%L, %L)', c, pg_temp.tok('r', 1)),
    'Solo el creador');

  v_version := (r->>'version')::integer;
  perform public.volver_a_jugar(c, pg_temp.tok('r', 0));
  r := pg_temp.room(c, 'r');
  perform pg_temp.check(r->>'phase' = 'lobby' and (r->>'round')::int = 0 and r->>'winner' is null
    and r->>'mayor_id' is null and (r->>'version')::int > v_version, 'vuelve a la sala ' || r::text);
  perform pg_temp.check(jsonb_array_length(r->'players') = 6, 'mismos jugadores');
  perform pg_temp.check(not exists (
    select 1 from jsonb_array_elements(r->'players') p
    where not (p->>'is_alive')::boolean or p->>'revealed_role' is not null), 'todos vivos y sin rol');
  perform pg_temp.check(not exists (select 1 from public.roles_privados rp
    join public.rooms ro on ro.id = rp.room_id where ro.code = c), 'sin roles');
  perform pg_temp.check(not exists (select 1 from public.links l
    join public.rooms ro on ro.id = l.room_id where ro.code = c), 'sin pareja');
  perform pg_temp.check(not exists (select 1 from public.game_log g
    join public.rooms ro on ro.id = g.room_id where ro.code = c), 'sin crónica');
  perform pg_temp.expect_error(format('select public.obtener_mi_rol(%L)', pg_temp.tok('r', 1)), 'no ha empezado');
  perform pg_temp.check(exists (select 1 from realtime.sent_messages
    where topic = 'sala:' || c and event = 'fase_cambiada' and payload->>'phase' = 'lobby'), 'aviso a todos');

  -- Se puede entrar, quitar a alguien y volver a empezar.
  perform public.join_room(c, 'J6', pg_temp.tok('r', 6));
  perform pg_temp.expect_error(format('select public.quitar_jugador(%L, %L, %L)',
    c, pg_temp.tok('r', 1), pg_temp.pid(c, 'J2')), 'Solo el creador');
  perform pg_temp.expect_error(format('select public.quitar_jugador(%L, %L, %L)',
    c, pg_temp.tok('r', 0), pg_temp.pid(c, 'J0')), 'quitarte a ti mismo');
  perform public.quitar_jugador(c, pg_temp.tok('r', 0), pg_temp.pid(c, 'J2'));
  perform pg_temp.check(exists (select 1 from realtime.sent_messages
    where topic = 'sala:' || c and event = 'jugador_quitado'), 'aviso de jugador quitado');
  perform pg_temp.expect_error(format('select public.get_room(%L, %L)', c, pg_temp.tok('r', 2)), 'Token no válido');
  perform public.iniciar_partida(c, pg_temp.tok('r', 0), '{seer,witch}', 1, false);
  r := pg_temp.room(c, 'r');
  perform pg_temp.check(r->>'phase' = 'intro' and jsonb_array_length(r->'players') = 6, 'segunda partida ' || r::text);
  perform pg_temp.expect_error(format('select public.quitar_jugador(%L, %L, %L)',
    c, pg_temp.tok('r', 0), pg_temp.pid(c, 'J3')), 'sala de espera');
end;
$$;
