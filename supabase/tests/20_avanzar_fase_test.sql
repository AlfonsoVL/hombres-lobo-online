-- Tests de avanzar_fase: solo el creador, en orden y sin datos de rol.
set role anon;

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

create or replace function pg_temp.tok(i integer) returns text language sql as $$
  select 'token-de-fases-' || lpad(i::text, 32, '0');
$$;

do $$
declare
  v_code text;
  v_room jsonb;
begin
  select room_code into v_code
  from public.create_room('alien', 'custom', 'Ripley', pg_temp.tok(0));
  perform public.join_room(v_code, 'Dallas', pg_temp.tok(1));
  perform public.join_room(v_code, 'Lambert', pg_temp.tok(2));

  v_room := public.get_room(v_code, pg_temp.tok(0));
  perform pg_temp.expect_error(format('select public.avanzar_fase(%L, %L, %s)',
    v_code, pg_temp.tok(0), v_room->>'version'), 'todavía no se puede avanzar');

  perform public.iniciar_partida(v_code, pg_temp.tok(0), '{scientist}', 1);
  v_room := public.get_room(v_code, pg_temp.tok(0));
  if v_room->>'phase' <> 'intro' then raise exception 'Debería empezar en intro'; end if;

  perform pg_temp.expect_error(format('select public.avanzar_fase(%L, %L, %s)',
    v_code, pg_temp.tok(1), v_room->>'version'), 'Solo el creador');
  perform pg_temp.expect_error(format('select public.avanzar_fase(%L, %L, %s)',
    v_code, pg_temp.tok(0), (v_room->>'version')::int - 1), 'ya ha avanzado');

  perform public.avanzar_fase(v_code, pg_temp.tok(0), (v_room->>'version')::int);
  v_room := public.get_room(v_code, pg_temp.tok(1));
  if v_room->>'phase' <> 'role_reveal' then raise exception 'Debería estar en role_reveal'; end if;

  perform public.avanzar_fase(v_code, pg_temp.tok(0), (v_room->>'version')::int);
  v_room := public.get_room(v_code, pg_temp.tok(1));
  if v_room->>'phase' <> 'night' or (v_room->>'round')::int <> 1 then
    raise exception 'Debería estar en la noche 1: %', v_room;
  end if;

  perform pg_temp.expect_error(format('select public.avanzar_fase(%L, %L, %s)',
    v_code, pg_temp.tok(0), v_room->>'version'), 'todavía no se puede avanzar');
end;
$$;

reset role;

-- Los avisos de fase no llevan roles.
do $$
declare
  v_msg record;
begin
  for v_msg in
    select payload from realtime.sent_messages where event = 'fase_cambiada'
  loop
    if v_msg.payload::text ~ '(xenomorph|crew_member|scientist|medic|marine|android|"role")' then
      raise exception 'fase_cambiada contiene datos de rol: %', v_msg.payload;
    end if;
  end loop;
  if (select count(*) from realtime.sent_messages where event = 'fase_cambiada') < 2 then
    raise exception 'Faltan avisos fase_cambiada';
  end if;
end;
$$;
