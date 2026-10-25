-- Tests de la noche, el amanecer, el día, el Alcalde y el final.
-- Los roles se fijan a mano (como superusuario) para que el guion sea determinista;
-- las acciones se hacen con las funciones públicas, igual que el navegador.

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

-- Partida 1: Cupido, Vidente, Bruja que cura y linchamiento del lobo.
do $$
declare
  c text;
  r jsonb;
  n jsonb;
begin
  c := pg_temp.setup('a', '{villager,werewolf,seer,witch,hunter,cupid}', false);
  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'phase' = 'role_reveal', 'role_reveal');
  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'phase' = 'night' and r->>'night_step' = 'link', 'primer turno: Cupido ' || r::text);
  perform pg_temp.check(not (r->>'step_done')::boolean, 'Cupido aún no ha actuado');

  -- Solo actúa quien tiene el turno.
  perform pg_temp.expect_error(format('select public.accion_nocturna(%L, %L, %L, %L)',
    c, pg_temp.tok('a', 1), 'kill', pg_temp.pid(c, 'J2')), 'No es tu turno');
  perform pg_temp.check(public.mi_noche(c, pg_temp.tok('a', 1))->>'state' = 'wait', 'el lobo espera');
  perform pg_temp.check(public.mi_noche(c, pg_temp.tok('a', 0))->>'state' = 'sleep', 'el aldeano duerme');

  perform public.accion_nocturna(c, pg_temp.tok('a', 5), 'link', pg_temp.pid(c, 'J0'), pg_temp.pid(c, 'J4'));
  perform pg_temp.check(public.obtener_mi_rol(pg_temp.tok('a', 0))->'lover'->>'name' = 'J4', 'los enamorados se conocen');
  perform pg_temp.check((pg_temp.room(c, 'a')->>'step_done')::boolean, 'Cupido ha actuado');

  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'night_step' = 'bad', 'turno de los lobos');
  perform pg_temp.expect_error(format('select public.accion_nocturna(%L, %L, %L, %L)',
    c, pg_temp.tok('a', 1), 'kill', pg_temp.pid(c, 'J1')), 'no sea de tu bando');
  perform public.accion_nocturna(c, pg_temp.tok('a', 1), 'kill', pg_temp.pid(c, 'J3'));
  -- Cambia de opinión: vale el último voto.
  perform public.accion_nocturna(c, pg_temp.tok('a', 1), 'kill', pg_temp.pid(c, 'J2'));

  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'night_step' = 'investigate', 'turno de la Vidente');
  n := public.accion_nocturna(c, pg_temp.tok('a', 2), 'see', pg_temp.pid(c, 'J1'));
  perform pg_temp.check(n->'seen'->>'role' = 'werewolf', 'la Vidente ve al lobo ' || n::text);
  perform pg_temp.expect_error(format('select public.accion_nocturna(%L, %L, %L, %L)',
    c, pg_temp.tok('a', 2), 'see', pg_temp.pid(c, 'J3')), 'Ya has actuado');

  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'night_step' = 'protect', 'turno de la Bruja');
  n := public.mi_noche(c, pg_temp.tok('a', 3));
  perform pg_temp.check(n->>'victim' = pg_temp.pid(c, 'J2')::text, 'la Bruja ve a la víctima');
  perform public.accion_nocturna(c, pg_temp.tok('a', 3), 'potions', null, pg_temp.pid(c, 'J2'));

  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'phase' = 'dawn' and jsonb_array_length(r->'last_deaths') = 0,
    'la cura salva a la víctima ' || r::text);

  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'phase' = 'day', 'día');
  perform public.votar(c, pg_temp.tok('a', 0), pg_temp.pid(c, 'J1'));
  perform public.votar(c, pg_temp.tok('a', 1), pg_temp.pid(c, 'J0'));
  perform public.votar(c, pg_temp.tok('a', 2), pg_temp.pid(c, 'J1'));
  perform public.votar(c, pg_temp.tok('a', 3), pg_temp.pid(c, 'J1'));
  perform pg_temp.check(jsonb_array_length(pg_temp.room(c, 'a')->'votes') = 4, 'votos públicos');

  r := pg_temp.advance(c, 'a');
  perform pg_temp.check(r->>'phase' = 'finished' and r->>'winner' = 'good', 'gana la aldea ' || r::text);
  perform pg_temp.check(
    (select bool_and(p->>'revealed_role' is not null) from jsonb_array_elements(r->'players') p),
    'al final se revelan todos los roles');
end;
$$;

-- Partida 2: el lobo mata a un Enamorado, muere el Cazador por amor y dispara.
-- Después, empate en el día que deshace el Alcalde.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('b', '{villager,werewolf,werewolf,hunter,cupid,villager}', true);
  perform pg_temp.check(pg_temp.room(c, 'b')->>'mayor_id' is not null, 'hay Alcalde');

  perform pg_temp.advance(c, 'b');
  perform pg_temp.advance(c, 'b');
  perform public.accion_nocturna(c, pg_temp.tok('b', 4), 'link', pg_temp.pid(c, 'J3'), pg_temp.pid(c, 'J5'));
  perform pg_temp.advance(c, 'b');
  perform public.accion_nocturna(c, pg_temp.tok('b', 1), 'kill', pg_temp.pid(c, 'J5'));
  perform pg_temp.check(not (pg_temp.room(c, 'b')->>'step_done')::boolean, 'falta el otro lobo');
  perform public.accion_nocturna(c, pg_temp.tok('b', 2), 'kill', pg_temp.pid(c, 'J0'));
  perform pg_temp.check(not (pg_temp.room(c, 'b')->>'step_done')::boolean, 'los lobos no coinciden');
  perform public.accion_nocturna(c, pg_temp.tok('b', 2), 'kill', pg_temp.pid(c, 'J5'));
  perform pg_temp.check((pg_temp.room(c, 'b')->>'step_done')::boolean, 'los dos lobos coinciden');

  r := pg_temp.advance(c, 'b');
  perform pg_temp.check(r->>'phase' = 'dawn', 'amanecer ' || r::text);
  perform pg_temp.check(jsonb_array_length(r->'last_deaths') = 2, 'mueren los dos enamorados');
  perform pg_temp.check(r->>'pending_shot' = pg_temp.pid(c, 'J3')::text, 'el Cazador tiene que disparar');
  perform pg_temp.expect_error(format('select public.avanzar_fase(%L, %L, %s)',
    c, pg_temp.tok('b', 0), r->>'version'), 'Falta que dispare');

  perform public.disparar(c, pg_temp.tok('b', 3), pg_temp.pid(c, 'J1'));
  r := pg_temp.room(c, 'b');
  perform pg_temp.check(r->>'pending_shot' is null and r->>'phase' = 'dawn', 'disparo hecho');
  perform pg_temp.check(
    exists (select 1 from jsonb_array_elements(r->'players') p
            where p->>'id' = r->>'mayor_id' and (p->>'is_alive')::boolean),
    'el Alcalde está vivo (se sortea otro si murió)');

  r := pg_temp.advance(c, 'b');
  -- Vivos: J0, J2 (lobo) y J4. Empate entre J0 y J2; el Alcalde (J4) vota a J2.
  update public.rooms set mayor_id = pg_temp.pid(c, 'J4') where code = c;
  perform public.votar(c, pg_temp.tok('b', 0), pg_temp.pid(c, 'J2'));
  perform public.votar(c, pg_temp.tok('b', 2), pg_temp.pid(c, 'J0'));
  perform pg_temp.expect_error(format('select public.votar(%L, %L, %L)',
    c, pg_temp.tok('b', 5), pg_temp.pid(c, 'J0')), 'muertos no pueden votar');
  perform pg_temp.check(public.mi_noche(c, pg_temp.tok('b', 5))->>'state' = 'dead', 'muerto');

  -- Sin el voto del Alcalde, empate: no muere nadie.
  r := pg_temp.advance(c, 'b');
  perform pg_temp.check(r->>'phase' = 'lynch' and jsonb_array_length(r->'last_deaths') = 0,
    'empate sin desempate ' || r::text);

  -- Noche 2: Cupido no vuelve a actuar.
  r := pg_temp.advance(c, 'b');
  perform pg_temp.check(r->>'night_step' = 'bad' and (r->>'round')::int = 2, 'noche 2 ' || r::text);
  perform public.accion_nocturna(c, pg_temp.tok('b', 2), 'kill', pg_temp.pid(c, 'J0'));
  r := pg_temp.advance(c, 'b');
  -- Quedan J2 (lobo) y J4: gana el lobo.
  perform pg_temp.check(r->>'phase' = 'finished' and r->>'winner' = 'bad', 'ganan los lobos ' || r::text);
end;
$$;

-- Partida 3: empate que deshace el Alcalde.
do $$
declare
  c text;
  r jsonb;
begin
  c := pg_temp.setup('m', '{villager,werewolf,seer,witch,hunter,cupid}', true);
  perform pg_temp.advance(c, 'm');
  perform pg_temp.advance(c, 'm');
  perform public.accion_nocturna(c, pg_temp.tok('m', 5), 'link', pg_temp.pid(c, 'J4'), pg_temp.pid(c, 'J5'));
  perform pg_temp.advance(c, 'm');
  perform public.accion_nocturna(c, pg_temp.tok('m', 1), 'kill', pg_temp.pid(c, 'J0'));
  perform pg_temp.advance(c, 'm');
  perform public.accion_nocturna(c, pg_temp.tok('m', 2), 'see', pg_temp.pid(c, 'J3'));
  perform pg_temp.advance(c, 'm');
  perform public.accion_nocturna(c, pg_temp.tok('m', 3), 'potions', null, null);
  r := pg_temp.advance(c, 'm');
  perform pg_temp.check(r->'last_deaths' = jsonb_build_array(pg_temp.pid(c, 'J0')), 'muere J0 ' || r::text);
  perform pg_temp.advance(c, 'm');

  update public.rooms set mayor_id = pg_temp.pid(c, 'J3') where code = c;
  perform public.votar(c, pg_temp.tok('m', 1), pg_temp.pid(c, 'J2'));
  perform public.votar(c, pg_temp.tok('m', 2), pg_temp.pid(c, 'J1'));
  perform public.votar(c, pg_temp.tok('m', 3), pg_temp.pid(c, 'J1'));
  perform public.votar(c, pg_temp.tok('m', 4), pg_temp.pid(c, 'J2'));
  r := pg_temp.advance(c, 'm');
  perform pg_temp.check(r->'last_deaths' = jsonb_build_array(pg_temp.pid(c, 'J1')), 'el Alcalde desempata ' || r::text);
  perform pg_temp.check(r->>'winner' = 'good', 'gana la aldea');
end;
$$;

-- Protección del Médico (Alien): ni a sí mismo ni al mismo dos noches seguidas.
do $$
declare
  c text;
begin
  select room_code into c from public.create_room('alien', 'custom', 'M0', pg_temp.tok('x', 0));
  for i in 1..3 loop
    perform public.join_room(c, 'M' || i, pg_temp.tok('x', i));
  end loop;
  perform public.iniciar_partida(c, pg_temp.tok('x', 0), '{medic}', 1, false);
  update public.roles_privados rp set role = v.role, team = v.team
  from (values ('M0', 'crew_member', 'good'), ('M1', 'xenomorph', 'bad'),
               ('M2', 'medic', 'good'), ('M3', 'crew_member', 'good')) v(name, role, team),
       public.players p
  where rp.player_id = p.id and p.name = v.name
    and p.room_id = (select id from public.rooms where code = c);

  perform pg_temp.advance(c, 'x');
  perform pg_temp.advance(c, 'x');
  perform public.accion_nocturna(c, pg_temp.tok('x', 1), 'kill', pg_temp.pid(c, 'M3'));
  perform pg_temp.advance(c, 'x');
  perform pg_temp.expect_error(format('select public.accion_nocturna(%L, %L, %L, %L)',
    c, pg_temp.tok('x', 2), 'protect', pg_temp.pid(c, 'M2')), 'protegerte a ti mismo');
  perform public.accion_nocturna(c, pg_temp.tok('x', 2), 'protect', pg_temp.pid(c, 'M3'));
  perform pg_temp.check(jsonb_array_length(pg_temp.advance(c, 'x')->'last_deaths') = 0, 'el Médico salva');
  perform pg_temp.advance(c, 'x');
  perform public.votar(c, pg_temp.tok('x', 0), pg_temp.pid(c, 'M0'));
  perform pg_temp.advance(c, 'x');
  perform pg_temp.advance(c, 'x');
  perform public.accion_nocturna(c, pg_temp.tok('x', 1), 'kill', pg_temp.pid(c, 'M3'));
  perform pg_temp.advance(c, 'x');
  perform pg_temp.expect_error(format('select public.accion_nocturna(%L, %L, %L, %L)',
    c, pg_temp.tok('x', 2), 'protect', pg_temp.pid(c, 'M3')), 'dos noches seguidas');
end;
$$;

-- Ningún aviso lleva roles.
do $$
begin
  if exists (
    select 1 from realtime.sent_messages
    where event in ('fase_cambiada', 'actualizado')
      and payload::text ~ '(werewolf|villager|seer|witch|hunter|cupid|xenomorph|crew_member|medic|"role")') then
    raise exception 'Hay avisos con datos de rol';
  end if;
end;
$$;
