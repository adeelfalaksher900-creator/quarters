-- Hardening after QA: friendly validation errors, duplicate-name checks, a global creation throttle.

create or replace function public.accord_join(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare r accord_rooms; n int; p accord_players; nm text := trim(coalesce(p_name, ''));
begin
  if char_length(nm) = 0 then raise exception 'Please enter your name'; end if;
  if char_length(nm) > 32 then raise exception 'Name must be 32 characters or fewer'; end if;
  select * into r from accord_rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Split not found. Check the code.'; end if;
  if r.status <> 'bidding' then raise exception 'This split has already been revealed'; end if;
  select count(*) into n from accord_players where room_code = r.code;
  if n >= array_length(r.rooms,1) then raise exception 'Room is full'; end if;
  if exists (select 1 from accord_players where room_code = r.code and lower(name) = lower(nm)) then
    raise exception 'Someone in this split already uses that name. Try another.';
  end if;
  insert into accord_players(room_code, name, seat) values (r.code, nm, n) returning * into p;
  return json_build_object('code', r.code, 'player_id', p.id, 'secret', p.secret);
end $$;

create or replace function public.accord_create(p_title text, p_rent numeric, p_rooms text[], p_name text, p_currency text default '$')
returns json language plpgsql security definer set search_path = public as $$
declare c text; i int := 0; alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; t text := trim(coalesce(p_title, ''));
begin
  -- shortcut: global throttle instead of per-IP limits; enough to stop a runaway script on the free tier.
  if (select count(*) from accord_rooms where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many new splits right now. Please try again in a minute.';
  end if;
  if p_rent is null or p_rent <= 0 or p_rent >= 10000000 then raise exception 'Enter a rent between 1 and 9,999,999'; end if;
  if p_rooms is null or array_length(p_rooms,1) not between 2 and 8 then raise exception 'A split needs 2 to 8 rooms'; end if;
  if exists (select 1 from unnest(p_rooms) x where x is null or char_length(trim(x)) not between 1 and 40) then raise exception 'Room names must be 1-40 characters'; end if;
  if (select count(distinct lower(trim(x))) from unnest(p_rooms) x) <> array_length(p_rooms,1) then raise exception 'Each room needs a different name'; end if;
  if char_length(t) = 0 then t := 'Our place'; end if;
  if char_length(t) > 80 then raise exception 'Home name must be 80 characters or fewer'; end if;
  if coalesce(p_currency,'$') not in ('$','€','£','Rs ','₹','A$','C$') then raise exception 'Unsupported currency'; end if;
  loop
    select string_agg(substr(alpha, 1 + floor(random()*length(alpha))::int, 1), '') into c from generate_series(1,6);
    exit when not exists (select 1 from accord_rooms where code = c);
    i := i + 1; if i > 10 then raise exception 'Could not allocate code'; end if;
  end loop;
  insert into accord_rooms(code, title, rent, rooms, currency)
    values (c, t, round(p_rent, 2), array(select trim(u.x) from unnest(p_rooms) with ordinality u(x, o) order by u.o), coalesce(p_currency,'$'));
  return accord_join(c, p_name);
end $$;
