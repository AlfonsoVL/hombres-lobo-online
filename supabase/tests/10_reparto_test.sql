-- Tests del esquema: RLS, salas, reparto de roles y obtener_mi_rol.
-- Se ejecutan como el rol anon, igual que el navegador.

set role anon;

-- Ayuda: espera que una sentencia falle con un mensaje que contenga p_text.
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
  select 'token-de-prueba-' || lpad(i::text, 32, '0');
$$;

do $$
declare
  v_code text;
  v_creator uuid;
  v_id uuid;
  v_role jsonb;
  v_bad integer := 0;
  v_seen text[] := '{}';
begin
  -- anon no puede leer tablas directamente.
  perform pg_temp.expect_error('select * from public.roles_privados', 'permission denied');
  perform pg_temp.expect_error('select * from public.players', 'permission denied');
  perform pg_temp.expect_error('select * from public.rooms', 'permission denied');

  select room_code, player_id into v_code, v_creator
  from public.create_room('castronegro', 'classic', 'Ana', pg_temp.tok(0));

  for i in 1..7 loop
    perform public.join_room(v_code, 'Jugador ' || i, pg_temp.tok(i));
  end loop;

  -- Reconexión: el mismo token devuelve el mismo jugador.
  v_id := public.join_room(lower(v_code), 'Otro nombre', pg_temp.tok(3));
  if v_id <> public.join_room(v_code, 'Jugador 3', pg_temp.tok(3)) then
    raise exception 'La reconexión debería devolver el mismo jugador';
  end if;

  perform pg_temp.expect_error(format(
    'select public.join_room(%L, %L, %L)', v_code, 'jugador 1', pg_temp.tok(50)),
    'Ya hay un jugador con ese nombre');

  -- Antes de empezar no hay rol.
  perform pg_temp.expect_error(format('select public.obtener_mi_rol(%L)', pg_temp.tok(1)),
    'todavía no ha empezado');

  -- Validaciones de iniciar_partida.
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 2)', v_code, pg_temp.tok(1), '{seer}'),
    'Solo el creador');
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 0)', v_code, pg_temp.tok(0), '{seer}'),
    'al menos 1 malo');
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 6)', v_code, pg_temp.tok(0), '{seer,witch,hunter}'),
    'Con 8 jugadores, 6 malos y 3 roles especiales no caben. Reduce alguno.');
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 2)', v_code, pg_temp.tok(0), '{little_girl}'),
    'no está disponible');
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 2)', v_code, pg_temp.tok(0), '{xenomorph}'),
    'no está disponible');
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 2)', v_code, 'corto', '{seer}'),
    'Token no válido');

  -- Reparto clásico para 8: 2 lobos, vidente, bruja, cazador y 3 aldeanos.
  perform public.iniciar_partida(v_code, pg_temp.tok(0), '{seer,witch,hunter}', 2);

  for i in 0..7 loop
    v_role := public.obtener_mi_rol(pg_temp.tok(i));
    v_seen := v_seen || (v_role->>'role');
    if v_role->>'team' = 'bad' then
      v_bad := v_bad + 1;
      if jsonb_array_length(v_role->'bad_teammates') <> 1 then
        raise exception 'Cada lobo debe ver a su único compañero: %', v_role;
      end if;
    elsif v_role->'bad_teammates' <> 'null'::jsonb then
      raise exception 'Un bueno no debe ver compañeros malos: %', v_role;
    end if;
  end loop;

  if v_bad <> 2 then raise exception 'Se esperaban 2 malos, hay %', v_bad; end if;
  if (select array_agg(r order by r) from unnest(v_seen) r)
     <> '{hunter,seer,villager,villager,villager,werewolf,werewolf,witch}'::text[] then
    raise exception 'Composición incorrecta: %', v_seen;
  end if;

  -- Token incorrecto.
  perform pg_temp.expect_error(format('select public.obtener_mi_rol(%L)', pg_temp.tok(99)),
    'Token no válido');

  -- No se puede iniciar dos veces ni unirse con la partida empezada.
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 2)', v_code, pg_temp.tok(0), '{seer}'),
    'ya ha empezado');
  perform pg_temp.expect_error(format(
    'select public.join_room(%L, %L, %L)', v_code, 'Tarde', pg_temp.tok(60)),
    'ya ha empezado');

  -- El estado público de la sala no contiene roles.
  if public.get_room(v_code, pg_temp.tok(2))::text ~ '(werewolf|seer|witch|hunter|villager)' then
    raise exception 'get_room no debe revelar roles';
  end if;
end;
$$;

-- Personalizado: roles repetidos y máximo de 24 jugadores.
do $$
declare
  v_code text;
begin
  select room_code into v_code
  from public.create_room('castronegro', 'custom', 'Creador', pg_temp.tok(100));
  for i in 101..123 loop
    perform public.join_room(v_code, 'J' || i, pg_temp.tok(i));
  end loop;
  perform pg_temp.expect_error(format(
    'select public.join_room(%L, %L, %L)', v_code, 'Sobra', pg_temp.tok(124)),
    'máximo 24');
  perform pg_temp.expect_error(format(
    'select public.iniciar_partida(%L, %L, %L, 3)', v_code, pg_temp.tok(100), '{seer,seer}'),
    'solo puede elegirse una vez');
  perform public.iniciar_partida(v_code, pg_temp.tok(100), '{seer,witch,little_girl}', 3);
end;
$$;

reset role;

-- Ningún evento Broadcast lleva roles.
do $$
begin
  if exists (select 1 from realtime.sent_messages
             where payload::text ~ '(werewolf|seer|witch|hunter|villager|little_girl|role)') then
    raise exception 'Un evento Broadcast contiene datos de rol';
  end if;
  if (select count(*) from realtime.sent_messages where event = 'partida_iniciada') <> 2 then
    raise exception 'Se esperaban 2 eventos partida_iniciada';
  end if;
end;
$$;
