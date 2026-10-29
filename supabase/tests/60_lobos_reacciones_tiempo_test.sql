-- Tests del turno de los malos: reacciones y tiempo límite.

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

-- Dos lobos: reacciones, desacuerdo y fin del tiempo.
do $$
declare
  c text;
  r jsonb;
  n jsonb;
begin
  c := pg_temp.setup('w', '{villager,werewolf,werewolf,seer,witch,villager}', false);
  perform pg_temp.advance(c, 'w');
  r := pg_temp.advance(c, 'w');
  perform pg_temp.check(r->>'night_step' = 'bad', 'turno de los lobos ' || r::text);
  perform pg_temp.check(r->>'step_ends_at' is not null and r->>'server_time' is not null, 'hay cuenta atrás');
  perform pg_temp.check((r->>'step_ends_at')::timestamptz > now() + interval '59 seconds', 'dura 60 s');

  -- Solo los lobos vivos reaccionan, y solo a candidatos.
  perform pg_temp.expect_error(format('select public.reaccion_malos(%L, %L, %L, %L)',
    c, pg_temp.tok('w', 0), pg_temp.pid(c, 'J3'), 'yes'), 'No es tu turno');
  perform pg_temp.expect_error(format('select public.reaccion_malos(%L, %L, %L, %L)',
    c, pg_temp.tok('w', 1), pg_temp.pid(c, 'J2'), 'yes'), 'no sea de tu bando');
  perform pg_temp.expect_error(format('select public.reaccion_malos(%L, %L, %L, %L)',
    c, pg_temp.tok('w', 1), pg_temp.pid(c, 'J3'), 'hola'), 'Reacción no válida');

  perform public.reaccion_malos(c, pg_temp.tok('w', 1), pg_temp.pid(c, 'J3'), 'seer');
  perform public.reaccion_malos(c, pg_temp.tok('w', 1), pg_temp.pid(c, 'J3'), 'yes');
  perform public.reaccion_malos(c, pg_temp.tok('w', 1), pg_temp.pid(c, 'J4'), 'no');
  perform public.reaccion_malos(c, pg_temp.tok('w', 1), pg_temp.pid(c, 'J4'), null);
  n := public.mi_noche(c, pg_temp.tok('w', 2));
  perform pg_temp.check(jsonb_array_length(n->'reactions') = 1
    and n->'reactions'->0->>'reaction' = 'yes'
    and n->'reactions'->0->>'voter' = 'J1'
    and not (n->'reactions'->0->>'mine')::boolean, 'el compañero ve la reacción ' || n::text);
  perform pg_temp.check((public.mi_noche(c, pg_temp.tok('w', 1))->'reactions'->0->>'mine')::boolean,
    'la propia se marca');
  perform pg_temp.check(public.mi_noche(c, pg_temp.tok('w', 0))->'reactions' is null,
    'los demás no ven reacciones');

  -- No coinciden: el turno no está hecho hasta que se acaba el tiempo.
  perform public.accion_nocturna(c, pg_temp.tok('w', 1), 'kill', pg_temp.pid(c, 'J3'));
  perform public.accion_nocturna(c, pg_temp.tok('w', 2), 'kill', pg_temp.pid(c, 'J4'));
  perform pg_temp.check(not (pg_temp.room(c, 'w')->>'step_done')::boolean, 'aún no coinciden');
  perform pg_temp.time_up(c);
  perform pg_temp.check((pg_temp.room(c, 'w')->>'step_done')::boolean, 'tiempo acabado');
  perform pg_temp.check((public.mi_noche(c, pg_temp.tok('w', 1))->>'time_up')::boolean, 'el lobo lo ve');
  perform pg_temp.expect_error(format('select public.accion_nocturna(%L, %L, %L, %L)',
    c, pg_temp.tok('w', 2), 'kill', pg_temp.pid(c, 'J3')), 'acabado el tiempo');
  perform pg_temp.expect_error(format('select public.reaccion_malos(%L, %L, %L, %L)',
    c, pg_temp.tok('w', 2), pg_temp.pid(c, 'J3'), 'yes'), 'acabado el tiempo');

  -- Empate: la víctima sale al azar entre las empatadas.
  r := pg_temp.advance(c, 'w');
  perform pg_temp.check(r->>'night_step' = 'investigate' and r->>'step_ends_at' is null,
    'turno de la Vidente sin cuenta atrás ' || r::text);
  perform pg_temp.check((select night_victim in (pg_temp.pid(c, 'J3'), pg_temp.pid(c, 'J4'))
    from public.rooms where code = c), 'víctima entre las empatadas');
end;
$$;

-- Si coinciden antes de tiempo, el turno está hecho como hasta ahora.
do $$
declare
  c text;
begin
  c := pg_temp.setup('v', '{villager,werewolf,werewolf,seer,witch,villager}', false);
  perform pg_temp.advance(c, 'v');
  perform pg_temp.advance(c, 'v');
  perform public.accion_nocturna(c, pg_temp.tok('v', 1), 'kill', pg_temp.pid(c, 'J5'));
  perform public.accion_nocturna(c, pg_temp.tok('v', 2), 'kill', pg_temp.pid(c, 'J5'));
  perform pg_temp.check((pg_temp.room(c, 'v')->>'step_done')::boolean, 'coinciden');
end;
$$;
