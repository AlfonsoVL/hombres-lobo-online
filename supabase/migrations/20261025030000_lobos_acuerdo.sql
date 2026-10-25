-- Los malos tienen que ponerse de acuerdo: su turno solo termina cuando todos
-- los vivos han votado a la misma víctima. Si el creador lo salta antes, vale
-- la más votada (empate: al azar entre las empatadas).

create or replace function public._step_done(p_room public.rooms)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_room.night_step
    when 'bad' then (
      select count(*) = count(a.target_id) and count(distinct a.target_id) = 1
      from public.players p
      left join public.night_actions a
        on a.actor_id = p.id and a.room_id = p_room.id and a.round = p_room.round
       and a.step = 'bad' and a.action = 'kill'
      where p.room_id = p_room.id and p.is_alive and public._kind_of(p.id) = 'bad')
    else exists (
      select 1 from public.night_actions a
      where a.room_id = p_room.id and a.round = p_room.round and a.step = p_room.night_step)
  end;
$$;

revoke all on function public._step_done(public.rooms) from public, anon, authenticated;
