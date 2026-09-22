-- =========================================================
-- 交通組整合資訊系統 v0.1.0 — 資料庫結構
-- 在 Supabase SQL Editor 一次執行整份即可
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- 帳號 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  role text not null check (role in ('owner', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'owner');
$$;

-- ---------- 地點庫 ----------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  map_url text,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- 廠商與車型 ----------
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  name text not null,
  capacity integer not null check (capacity > 0),
  note text,
  created_at timestamptz not null default now()
);

-- ---------- 大會時程表 ----------
create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time,
  name text not null,
  location_id uuid references public.locations(id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- 用車需求 ----------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  depart_time time not null,
  arrive_time time,
  schedule_item_id uuid references public.schedule_items(id) on delete set null,
  origin_id uuid not null references public.locations(id) on delete restrict,
  destination_id uuid not null references public.locations(id) on delete restrict,
  headcount_mode text not null default 'manual' check (headcount_mode in ('manual', 'roster')),
  manual_count integer not null default 0 check (manual_count >= 0),
  roster_scope text not null default 'all' check (roster_scope in ('all', 'groups')),
  roster_groups text[] not null default '{}',
  extra_count integer not null default 0 check (extra_count >= 0),
  vehicle_type_id uuid references public.vehicle_types(id) on delete restrict,
  capacity_override integer check (capacity_override is null or capacity_override > 0),
  status text not null default 'planning' check (status in ('planning', 'confirmed')),
  note text,
  created_at timestamptz not null default now()
);

-- ---------- 搭車名單（僅擁有者可見） ----------
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  group_name text,
  phone text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- 內部備註（僅擁有者可見） ----------
create table if not exists public.private_notes (
  ref_table text not null check (ref_table in ('schedule_items', 'trips')),
  ref_id uuid not null,
  note text,
  primary key (ref_table, ref_id)
);

create or replace function public.cleanup_private_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.private_notes where ref_table = tg_table_name and ref_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_schedule_items_note_cleanup on public.schedule_items;
create trigger trg_schedule_items_note_cleanup after delete on public.schedule_items
  for each row execute function public.cleanup_private_note();
drop trigger if exists trg_trips_note_cleanup on public.trips;
create trigger trg_trips_note_cleanup after delete on public.trips
  for each row execute function public.cleanup_private_note();

-- ---------- 系統參數 ----------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values ('trip_lead_minutes', '30')
  on conflict (key) do nothing;

-- ---------- 各組人數統計（檢視者也可呼叫，但拿不到個資） ----------
create or replace function public.roster_group_counts()
returns table (group_name text, cnt bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.group_name), ''), '（未分組）') as group_name, count(*) as cnt
  from public.participants p
  where public.is_active_user()
  group by 1
  order by 1;
$$;

-- =========================================================
-- RLS
-- =========================================================
alter table public.profiles       enable row level security;
alter table public.locations      enable row level security;
alter table public.vendors        enable row level security;
alter table public.vehicle_types  enable row level security;
alter table public.schedule_items enable row level security;
alter table public.trips          enable row level security;
alter table public.participants   enable row level security;
alter table public.private_notes  enable row level security;
alter table public.settings       enable row level security;

-- 帳號：自己看得到自己，擁有者看得到全部；寫入一律走伺服器端（service role）
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_owner());

-- 共用資料：有效帳號可讀，擁有者可寫
do $$
declare t text;
begin
  foreach t in array array['locations', 'vendors', 'vehicle_types', 'schedule_items', 'trips', 'settings'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_active_user())', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- 僅擁有者：名單個資、內部備註
drop policy if exists participants_owner on public.participants;
create policy participants_owner on public.participants for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists private_notes_owner on public.private_notes;
create policy private_notes_owner on public.private_notes for all
  using (public.is_owner()) with check (public.is_owner());

-- 函式執行權限
revoke execute on function public.roster_group_counts() from anon;
grant execute on function public.roster_group_counts() to authenticated;
