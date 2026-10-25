-- Simula lo mínimo de Supabase para probar las migraciones en un Postgres
-- normal. No se aplica nunca en Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists extensions;
create schema if not exists realtime;

-- Guarda los eventos Broadcast para poder comprobarlos en los tests.
create table if not exists realtime.sent_messages (
  topic text, event text, payload jsonb, private boolean, sent_at timestamptz default now()
);

create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$
  insert into realtime.sent_messages (topic, event, payload, private) values (topic, event, payload, private);
$$;

grant usage on schema public, extensions to anon, authenticated;
