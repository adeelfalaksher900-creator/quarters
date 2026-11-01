-- Accord schema. Tables have RLS on with NO policies: clients can't read or write them directly.
-- Every action goes through SECURITY DEFINER functions that check a per-player secret
-- and never return secrets or (before the reveal) anyone's bids.

create table public.accord_rooms (
  code text primary key,
  title text not null check (char_length(title) between 1 and 80),
  rent numeric(12,2) not null check (rent > 0 and rent < 10000000),
  currency text not null default '$' check (char_length(currency) <= 4),
  rooms text[] not null check (array_length(rooms,1) between 2 and 8),
  status text not null default 'bidding' check (status in ('bidding','revealed','agreed')),
  round int not null default 1,
  created_at timestamptz not null default now()
);
create table public.accord_players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.accord_rooms(code) on delete cascade,
  secret uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 32),
  seat int not null,
  bids numeric(12,2)[],
  locked boolean not null default false,
  vote text check (vote in ('accept','dispute')),
  joined_at timestamptz not null default now(),
  unique (room_code, seat)
);
create index on public.accord_players(room_code);
alter table public.accord_rooms enable row level security;
alter table public.accord_players enable row level security;

create or replace function public.accord_get(p_code text)
returns json language sql security definer set search_path = public stable as $$
  select json_build_object(
    'room', (select row_to_json(r) from accord_rooms r where r.code = upper(p_code)),
    'players', coalesce((select json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'seat', p.seat, 'locked', p.locked, 'vote', p.vote,
        'bids', case when r.status <> 'bidding' then p.bids end) order by p.seat)
      from accord_players p join accord_rooms r on r.code = p.room_code
      where p.room_code = upper(p_code)), '[]'::json));
$$;

create or replace function public.accord_join(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare r accord_rooms; n int; p accord_players;
begin
  select * into r from accord_rooms where code = upper(p_code) for update;
  if not found then raise exception 'Room not found'; end if;
  select count(*) into n from accord_players where room_code = r.code;
  if n >= array_length(r.rooms,1) then raise exception 'Room is full'; end if;
  insert into accord_players(room_code, name, seat) values (r.code, trim(p_name), n) returning * into p;
  return json_build_object('code', r.code, 'player_id', p.id, 'secret', p.secret);
end $$;

create or replace function public.accord_create(p_title text, p_rent numeric, p_rooms text[], p_name text, p_currency text default '$')
returns json language plpgsql security definer set search_path = public as $$
declare c text; i int := 0; alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  loop
    select string_agg(substr(alpha, 1 + floor(random()*length(alpha))::int, 1), '') into c from generate_series(1,6);
    exit when not exists (select 1 from accord_rooms where code = c);
    i := i + 1; if i > 10 then raise exception 'Could not allocate code'; end if;
  end loop;
  if exists (select 1 from unnest(p_rooms) x where x is null or char_length(trim(x)) not between 1 and 40) then raise exception 'Room names must be 1-40 characters'; end if;
  insert into accord_rooms(code, title, rent, rooms, currency) values (c, trim(p_title), p_rent, p_rooms, coalesce(p_currency,'$'));
  return accord_join(c, p_name);
end $$;

create or replace function public.accord_submit(p_player uuid, p_secret uuid, p_bids numeric[])
returns void language plpgsql security definer set search_path = public as $$
declare p accord_players; r accord_rooms; s numeric; waiting int;
begin
  select * into p from accord_players where id = p_player and secret = p_secret;
  if not found then raise exception 'Not authorised'; end if;
  select * into r from accord_rooms where code = p.room_code for update;
  if r.status <> 'bidding' then raise exception 'Bidding is closed'; end if;
  if array_length(p_bids,1) is distinct from array_length(r.rooms,1) then raise exception 'Need one bid per room'; end if;
  if exists (select 1 from unnest(p_bids) b where b is null or b < 0) then raise exception 'Bids must be non-negative'; end if;
  select sum(b) into s from unnest(p_bids) b;
  if abs(s - r.rent) > 0.011 then raise exception 'Bids must add up to the total rent'; end if;
  update accord_players set bids = p_bids, locked = true where id = p.id;
  select count(*) into waiting from accord_players where room_code = r.code and not locked;
  if waiting = 0 and (select count(*) from accord_players where room_code = r.code) = array_length(r.rooms,1) then
    update accord_rooms set status = 'revealed' where code = r.code;
  end if;
end $$;

create or replace function public.accord_unlock(p_player uuid, p_secret uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update accord_players p set locked = false from accord_rooms r
   where p.id = p_player and p.secret = p_secret and r.code = p.room_code and r.status = 'bidding';
end $$;

create or replace function public.accord_vote(p_player uuid, p_secret uuid, p_vote text)
returns void language plpgsql security definer set search_path = public as $$
declare p accord_players; r accord_rooms;
begin
  select * into p from accord_players where id = p_player and secret = p_secret;
  if not found then raise exception 'Not authorised'; end if;
  select * into r from accord_rooms where code = p.room_code for update;
  if r.status <> 'revealed' then raise exception 'Nothing to vote on'; end if;
  if p_vote = 'dispute' then
    update accord_players set locked = false, vote = null where room_code = r.code;
    update accord_rooms set status = 'bidding', round = round + 1 where code = r.code;
  elsif p_vote = 'accept' then
    update accord_players set vote = 'accept' where id = p.id;
    if not exists (select 1 from accord_players where room_code = r.code and vote is distinct from 'accept') then
      update accord_rooms set status = 'agreed' where code = r.code;
    end if;
  else raise exception 'Invalid vote'; end if;
end $$;

revoke all on function public.accord_get(text), public.accord_join(text,text), public.accord_create(text,numeric,text[],text,text),
  public.accord_submit(uuid,uuid,numeric[]), public.accord_unlock(uuid,uuid), public.accord_vote(uuid,uuid,text) from public;
grant execute on function public.accord_get(text), public.accord_join(text,text), public.accord_create(text,numeric,text[],text,text),
  public.accord_submit(uuid,uuid,numeric[]), public.accord_unlock(uuid,uuid), public.accord_vote(uuid,uuid,text) to anon, authenticated;
