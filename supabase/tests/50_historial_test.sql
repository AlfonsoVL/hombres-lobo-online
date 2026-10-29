-- Tests del histórico de la partida y del estado público de la sala.

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

create or replace function pg_temp.log_of(p_hist jsonb, p_event text, p_player uuid) returns text language sql as $$
  select string_agg(coalesce(e->>'cause', e->>'event'), ',')
  from jsonb_array_elements(p_hist->'log') e
  where e->>'event' = p_event and (e->>'player')::uuid = p_player;
$$;

-- Partida 1: la Bruja salva a la Vidente, la Vidente ve al lobo y lo linchan.
do $$
declare
  c text;
  r jsonb;
  h jsonb;
  s jsonb;
begin
  c := pg_temp.setup('h', '{villager,werewolf,seer,witch,hunter,cupid}', false);
  s := public.estado_sala(c);
  perform pg_temp.check(s->>'phase' = 'playing' and s->'winner' = 'null'::jsonb, 'en juego ' || s::text);
  perform pg_temp.check(not (s ? 'players'), 'el estado no lleva jugadores');

  r := pg_temp.advance(c, 'h');
  r := pg_temp.advance(c, 'h');
  perform public.accion_nocturna(c, pg_temp.tok('h', 5), 'link', pg_temp.pid(c, 'J0'), pg_temp.pid(c, 'J4'));
  r := pg_temp.advance(c, 'h');
  perform public.accion_nocturna(c, pg_temp.tok('h', 1), 'kill', pg_temp.pid(c, 'J2'));
  r := pg_temp.advance(c, 'h');
  perform public.accion_nocturna(c, pg_temp.tok('h', 2), 'see', pg_temp.pid(c, 'J1'));
  r := pg_temp.advance(c, 'h');
  perform public.accion_nocturna(c, pg_temp.tok('h', 3), 'potions', null, pg_temp.pid(c, 'J2'));
  r := pg_temp.advance(c, 'h');
  perform pg_temp.check(r->>'phase' = 'dawn', 'amanecer');

  -- Antes de terminar no hay histórico.
  perform pg_temp.expect_error(format('select public.historial_partida(%L, %L)', c, pg_temp.tok('h', 0)),
    'al terminar la partida');

  r := pg_temp.advance(c, 'h');
  perform public.votar(c, pg_temp.tok('h', 0), pg_temp.pid(c, 'J1'));
  perform public.votar(c, pg_temp.tok('h', 2), pg_temp.pid(c, 'J1'));
  perform public.votar(c, pg_temp.tok('h', 3), pg_temp.pid(c, 'J1'));
  r := pg_temp.advance(c, 'h');
  perform pg_temp.check(r->>'phase' = 'finished' and r->>'winner' = 'good', 'gana la aldea');

  h := public.historial_partida(c, pg_temp.tok('h', 4));
  perform pg_temp.check(h->>'winner' = 'good', 'ganador en el histórico');
  perform pg_temp.check(jsonb_array_length(h->'players') = 6, 'todos los jugadores con su rol');
  perform pg_temp.check(pg_temp.log_of(h, 'attack', pg_temp.pid(c, 'J2')) = 'attack', 'ataque a la Vidente');
  perform pg_temp.check(pg_temp.log_of(h, 'death', pg_temp.pid(c, 'J2')) is null, 'la Vidente se salvó');
  perform pg_temp.check(pg_temp.log_of(h, 'death', pg_temp.pid(c, 'J1')) = 'lynched', 'el lobo, linchado');
  perform pg_temp.check(jsonb_array_length(h->'votes') = 3, 'votos del día');
  perform pg_temp.check(jsonb_array_length(h->'links') = 1, 'enamorados');
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(h->'night') a
    where a->>'action' = 'see' and (a->>'target')::uuid = pg_temp.pid(c, 'J1')), 'la Vidente vio al lobo');

  s := public.estado_sala(c);
  perform pg_temp.check(s->>'phase' = 'finished' and s->>'winner' = 'good', 'terminada ' || s::text);
  perform pg_temp.check((public.estado_sala('ZZZZZZ')->>'exists')::boolean = false, 'sala que no existe');
end;
$$;

-- Partida 2: el lobo mata a un Enamorado, el otro (Cazador) muere de amor y
-- dispara al lobo.
do $$
declare
  c text;
  r jsonb;
  h jsonb;
begin
  c := pg_temp.setup('i', '{villager,werewolf,seer,witch,hunter,cupid}', false);
  r := pg_temp.advance(c, 'i');
  r := pg_temp.advance(c, 'i');
  perform public.accion_nocturna(c, pg_temp.tok('i', 5), 'link', pg_temp.pid(c, 'J0'), pg_temp.pid(c, 'J4'));
  r := pg_temp.advance(c, 'i');
  perform public.accion_nocturna(c, pg_temp.tok('i', 1), 'kill', pg_temp.pid(c, 'J0'));
  r := pg_temp.advance(c, 'i');
  r := pg_temp.advance(c, 'i');
  r := pg_temp.advance(c, 'i');
  perform pg_temp.check(r->>'phase' = 'dawn' and r->>'pending_shot' = pg_temp.pid(c, 'J4')::text,
    'el Cazador tiene que disparar ' || r::text);
  perform public.disparar(c, pg_temp.tok('i', 4), pg_temp.pid(c, 'J1'));
  r := pg_temp.room(c, 'i');
  perform pg_temp.check(r->>'phase' = 'finished', 'fin tras el disparo');

  h := public.historial_partida(c, pg_temp.tok('i', 0));
  perform pg_temp.check(pg_temp.log_of(h, 'death', pg_temp.pid(c, 'J0')) = 'bad', 'J0, víctima de los lobos');
  perform pg_temp.check(pg_temp.log_of(h, 'death', pg_temp.pid(c, 'J4')) = 'lover', 'J4, de amor');
  perform pg_temp.check(pg_temp.log_of(h, 'death', pg_temp.pid(c, 'J1')) = 'shot', 'J1, disparo');
end;
$$;

-- Ni anon ni authenticated leen el registro directamente.
do $$
begin
  if has_table_privilege('anon', 'public.game_log', 'select') then
    raise exception 'anon no debe leer game_log';
  end if;
end;
$$;
