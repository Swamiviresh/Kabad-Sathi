create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  role text not null check (role in ('customer','collector', 'admin')),
  profile_photo text,
  created_at timestamptz default now()
);

create table if not exists pickup_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete set null,
  collector_id uuid references profiles(id) on delete set null,
  waste_type text not null,
  quantity text not null,
  image_url text,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  pickup_date text,
  pickup_time text,
  notes text,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','ON_THE_WAY','COMPLETED','CANCELLED','REJECTED')),
  customer_confirmed_complete boolean default false,
  collector_confirmed_complete boolean default false,
  created_at timestamptz default now(),
  accepted_at timestamptz,
  completed_at timestamptz
);

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  pickup_id uuid references pickup_requests(id) on delete cascade,
  customer_id uuid references profiles(id) on delete set null,
  collector_id uuid references profiles(id) on delete set null,
  rating int check (rating between 1 and 5),
  review text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table pickup_requests enable row level security;
alter table ratings enable row level security;

drop policy if exists "demo read pickups" on pickup_requests;
drop policy if exists "demo insert pickups" on pickup_requests;
drop policy if exists "demo update pickups" on pickup_requests;
drop policy if exists "customers read own pickups" on pickup_requests;
drop policy if exists "collectors read pickups" on pickup_requests;
drop policy if exists "customers insert own pickups" on pickup_requests;
drop policy if exists "collectors update pickups" on pickup_requests;
drop policy if exists "customers cancel own pickups" on pickup_requests;
drop policy if exists "profiles own read" on profiles;
drop policy if exists "profiles own insert" on profiles;
drop policy if exists "ratings read" on ratings;
drop policy if exists "ratings insert" on ratings;

create policy "customers read own pickups" on pickup_requests
  for select using (auth.uid() = customer_id);
create policy "collectors read pickups" on pickup_requests
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'collector'
    )
  );
create policy "customers insert own pickups" on pickup_requests
  for insert with check (auth.uid() = customer_id and collector_id is null);
create policy "collectors update pickups" on pickup_requests
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'collector'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'collector'
    )
  );
create policy "customers cancel own pickups" on pickup_requests
  for update using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id and status = 'CANCELLED');
create policy "profiles own read" on profiles for select using (auth.uid()=id);
-- Contact sharing: once a collector has accepted an order, both parties can read each
-- other's profile (name/phone/email) from the request. Pending requests expose nothing.
drop policy if exists "profiles contact on accepted orders" on profiles;
create policy "profiles contact on accepted orders" on profiles
  for select using (
    exists (
      select 1 from pickup_requests pr
      where pr.status in ('ACCEPTED','ON_THE_WAY')
        and (
          (pr.customer_id = auth.uid() and pr.collector_id = profiles.id)
          or (pr.collector_id = auth.uid() and pr.customer_id = profiles.id)
        )
    )
  );
create policy "profiles own insert" on profiles for insert with check (auth.uid()=id);
create policy "ratings read" on ratings
  for select using (auth.uid() in (customer_id, collector_id));
create policy "ratings insert" on ratings
  for insert with check (auth.uid() in (customer_id, collector_id));

do $$
begin
  alter publication supabase_realtime add table pickup_requests;
exception
  when duplicate_object then null;
end $$;


-- ── Auth: auto-create profile on signup ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    new.raw_user_meta_data->>'phone',
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Allow users to update their own profile
drop policy if exists "profiles own update" on profiles;
create policy "profiles own update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);


-- ── Multi-item pickups with fixed rates ─────────────────────────────
alter table pickup_requests add column if not exists items jsonb;
alter table pickup_requests add column if not exists total_amount numeric(10,2) default 0;
alter table pickup_requests add column if not exists address text;
-- items = [{ "type": "Paper", "kg": 5 }, ...]  (rates live in lib/rates.ts)

-- ── Accept/reject + dual-confirm completion lifecycle ───────────────
-- Collectors who rejected a PENDING request (it stays hidden from them only —
-- other collectors still see it).
alter table pickup_requests add column if not exists rejected_by uuid[] default '{}';

-- Completion needs BOTH parties to confirm. The app archives + deletes the row once
-- both are true; run a periodic job (or a trigger) to move fully-completed rows into
-- a ledger table if you need the history server-side.
alter table pickup_requests add column if not exists collector_confirmed_complete boolean default false;
alter table pickup_requests add column if not exists customer_confirmed_complete boolean default false;

-- Monthly ledger mirroring lib/localdb.ts DBLedgerEntry (hard-delete + keep totals).
create table if not exists pickup_ledger (
  pickup_id uuid primary key,
  customer_id uuid references profiles(id) on delete set null,
  collector_id uuid references profiles(id) on delete set null,
  waste_type text not null,
  items jsonb,
  total_amount numeric(10,2) default 0,
  total_kg numeric(10,2) default 0,
  address text,
  completed_at timestamptz,
  month text
);
alter table pickup_ledger enable row level security;
create policy "ledger read own" on pickup_ledger
  for select using (auth.uid() in (customer_id, collector_id));

-- Allow assigned collectors to update a pickup (was: any collector).
drop policy if exists "collectors update pickups" on pickup_requests;
create policy "collectors update pickups" on pickup_requests
  for update using (
    id in (select id from pickup_requests where collector_id = auth.uid())
    or (status = 'PENDING' and exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'collector'
    ))
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'collector'
    )
  );
