-- Tests de cancel_room: solo el creador y solo en la sala de espera.
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
  select 'token-de-cancelar-' || lpad(i::text, 32, '0');
$$;

do $$
declare
  v_code text;
begin
  select room_code into v_code from public.create_room('castronegro', 'custom', 'Ana', pg_temp.tok(0));
  perform public.join_room(v_code, 'Bea', pg_temp.tok(1));

  perform pg_temp.expect_error(format('select public.cancel_room(%L, %L)', v_code, pg_temp.tok(1)),
    'Solo el creador');
  perform pg_temp.expect_error(format('select public.cancel_room(%L, %L)', v_code, pg_temp.tok(9)),
    'Token no válido');

  perform public.cancel_room(v_code, pg_temp.tok(0));
  perform pg_temp.expect_error(format('select public.get_room(%L, %L)', v_code, pg_temp.tok(1)),
    'Token no válido');
  perform pg_temp.expect_error(format('select public.join_room(%L, %L, %L)', v_code, 'Carl', pg_temp.tok(2)),
    'La sala no existe');

  -- Con la partida empezada ya no se puede cancelar.
  select room_code into v_code from public.create_room('alien', 'custom', 'Ripley', pg_temp.tok(3));
  perform public.join_room(v_code, 'Dallas', pg_temp.tok(4));
  perform public.join_room(v_code, 'Lambert', pg_temp.tok(5));
  perform public.iniciar_partida(v_code, pg_temp.tok(3), '{scientist}', 1);
  perform pg_temp.expect_error(format('select public.cancel_room(%L, %L)', v_code, pg_temp.tok(3)),
    'La partida ya ha empezado');
end;
$$;

reset role;

do $$
begin
  if not exists (select 1 from realtime.sent_messages where event = 'sala_cancelada' and payload ? 'version') then
    raise exception 'Falta el aviso sala_cancelada';
  end if;
end;
$$;
