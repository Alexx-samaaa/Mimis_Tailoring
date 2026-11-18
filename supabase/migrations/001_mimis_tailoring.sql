-- Mimi's Tailoring operational schema
-- Run once in Supabase Dashboard → SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_mimis_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid());
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  contact_number text not null,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  garment_category text not null,
  garment_type text not null,
  measurement_values jsonb not null default '{}'::jsonb,
  customization_details jsonb not null default '{}'::jsonb,
  version integer not null check (version > 0),
  notes text,
  created_at timestamptz not null default now(),
  unique(customer_id, version)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  measurement_id uuid references public.measurements(id) on delete restrict,
  order_type text not null default 'Personal' check (order_type in ('Personal', 'Bulk')),
  garment_name text not null,
  garment_category text,
  customization_details jsonb not null default '{}'::jsonb,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_price numeric(12,2) generated always as (quantity * unit_price) stored,
  order_status text not null default 'Pending' check (order_status in ('Pending','In Progress','For Fitting','For Alteration','Ready for Pickup','Completed','Cancelled')),
  order_date date not null default current_date,
  delivery_deadline date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_orders (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  group_name text,
  contact_person text not null,
  contact_number text not null,
  order_date date not null default current_date,
  delivery_deadline date,
  status text not null default 'Pending' check (status in ('Pending','In Progress','For Fitting','For Alteration','Ready for Pickup','Completed','Cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.bulk_order_items (
  id uuid primary key default gen_random_uuid(),
  bulk_order_id uuid not null references public.bulk_orders(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  individual_name text not null,
  garment_type text not null,
  size text,
  measurements jsonb not null default '{}'::jsonb,
  customization_details jsonb not null default '{}'::jsonb,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  status text not null default 'Pending' check (status in ('Pending','In Progress','For Fitting','For Alteration','Ready for Pickup','Completed','Cancelled')),
  notes text
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  appointment_type text not null check (appointment_type in ('Initial Fitting','Follow-up Fitting','Alteration Fitting','Final Fitting','Pickup')),
  appointment_date date not null,
  appointment_time time not null,
  status text not null default 'Scheduled' check (status in ('Scheduled','Completed','Rescheduled','Cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null default 'Cash',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  previous_status text,
  new_status text not null,
  notes text,
  changed_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  notification_type text not null,
  related_order_id uuid references public.orders(id) on delete restrict,
  related_customer_id uuid references public.customers(id) on delete restrict,
  dedupe_key text unique,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_idx
  on public.notifications(dedupe_key);

create or replace function public.refresh_system_notifications()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.notifications(title, message, notification_type, related_order_id, related_customer_id, dedupe_key)
  select
    case when o.delivery_deadline < current_date then 'Overdue order' else 'Upcoming delivery deadline' end,
    o.garment_name || ' is due ' || to_char(o.delivery_deadline, 'Mon DD, YYYY'),
    case when o.delivery_deadline < current_date then 'overdue_order' else 'upcoming_deadline' end,
    o.id,
    o.customer_id,
    'deadline:' || o.id::text || ':' || o.delivery_deadline::text
  from public.orders o
  where o.delivery_deadline between current_date - 365 and current_date + 3
    and o.order_status not in ('Completed', 'Cancelled')
  on conflict (dedupe_key) do update
    set title = excluded.title, message = excluded.message, notification_type = excluded.notification_type;

  insert into public.notifications(title, message, notification_type, related_order_id, related_customer_id, dedupe_key)
  select
    'Upcoming fitting appointment',
    a.appointment_type || ' on ' || to_char(a.appointment_date, 'Mon DD, YYYY') || ' at ' || to_char(a.appointment_time, 'HH12:MI AM'),
    'upcoming_fitting',
    a.order_id,
    a.customer_id,
    'appointment:' || a.id::text || ':' || a.appointment_date::text || ':' || a.appointment_time::text
  from public.appointments a
  where a.appointment_date between current_date and current_date + 3
    and a.status in ('Scheduled', 'Rescheduled')
  on conflict (dedupe_key) do update
    set title = excluded.title, message = excluded.message;

  insert into public.notifications(title, message, notification_type, related_order_id, related_customer_id, dedupe_key)
  select
    'Order ready for pickup',
    o.garment_name || ' is ready for pickup.',
    'ready_for_pickup',
    o.id,
    o.customer_id,
    'pickup:' || o.id::text
  from public.orders o
  where o.order_status = 'Ready for Pickup'
  on conflict (dedupe_key) do update
    set title = excluded.title, message = excluded.message;

  insert into public.notifications(title, message, notification_type, related_order_id, related_customer_id, dedupe_key)
  select
    'Outstanding order balance',
    o.garment_name || ' has a remaining balance of PHP ' ||
      to_char(o.total_price - coalesce(sum(p.amount), 0), 'FM999,999,990.00'),
    'outstanding_balance',
    o.id,
    o.customer_id,
    'balance:' || o.id::text
  from public.orders o
  left join public.payments p on p.order_id = o.id
  where o.order_status not in ('Cancelled')
  group by o.id
  having o.total_price - coalesce(sum(p.amount), 0) > 0
  on conflict (dedupe_key) do update
    set title = excluded.title, message = excluded.message;
end;
$$;

create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null default 'Mimi''s Tailoring',
  contact_number text,
  address text,
  default_measurement_unit text not null default 'inches',
  deadline_alert_days integer not null default 3 check (deadline_alert_days between 1 and 30),
  updated_at timestamptz not null default now()
);

create index if not exists customers_name_idx on public.customers(last_name, first_name);
create index if not exists customers_contact_idx on public.customers(contact_number);
create index if not exists measurements_customer_idx on public.measurements(customer_id, created_at desc);
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_status_deadline_idx on public.orders(order_status, delivery_deadline);
create index if not exists bulk_items_order_idx on public.bulk_order_items(bulk_order_id);
create index if not exists appointments_date_idx on public.appointments(appointment_date, appointment_time);
create index if not exists payments_order_idx on public.payments(order_id, payment_date);
create index if not exists status_history_order_idx on public.order_status_history(order_id, changed_at);
create index if not exists notifications_unread_idx on public.notifications(is_read, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();
drop trigger if exists settings_updated_at on public.business_settings;
create trigger settings_updated_at before update on public.business_settings
for each row execute function public.set_updated_at();

create or replace function public.prevent_measurement_history_update()
returns trigger language plpgsql as $$
begin
  raise exception 'Measurement history is immutable. Duplicate the record to create a new version.';
end;
$$;
drop trigger if exists measurements_immutable on public.measurements;
create trigger measurements_immutable before update or delete on public.measurements
for each row execute function public.prevent_measurement_history_update();

create or replace function public.record_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.order_status is distinct from new.order_status then
    insert into public.order_status_history(order_id, previous_status, new_status)
    values (new.id, old.order_status, new.order_status);
  end if;
  return new;
end;
$$;
drop trigger if exists orders_status_history on public.orders;
create trigger orders_status_history after update of order_status on public.orders
for each row execute function public.record_order_status_change();

create or replace function public.create_order_with_history(order_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare new_id uuid;
begin
  insert into public.orders(
    customer_id, measurement_id, order_type, garment_name, garment_category,
    customization_details, quantity, unit_price, order_status, order_date,
    delivery_deadline, notes
  ) values (
    (order_payload->>'customer_id')::uuid,
    nullif(order_payload->>'measurement_id','')::uuid,
    coalesce(order_payload->>'order_type','Personal'),
    order_payload->>'garment_name',
    order_payload->>'garment_category',
    coalesce(order_payload->'customization_details','{}'::jsonb),
    coalesce((order_payload->>'quantity')::integer,1),
    coalesce((order_payload->>'unit_price')::numeric,0),
    coalesce(order_payload->>'order_status','Pending'),
    coalesce((order_payload->>'order_date')::date,current_date),
    nullif(order_payload->>'delivery_deadline','')::date,
    order_payload->>'notes'
  ) returning id into new_id;
  insert into public.order_status_history(order_id, previous_status, new_status, notes)
  values(new_id, null, coalesce(order_payload->>'order_status','Pending'), 'Order created');
  return new_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.measurements enable row level security;
alter table public.orders enable row level security;
alter table public.bulk_orders enable row level security;
alter table public.bulk_order_items enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.notifications enable row level security;
alter table public.business_settings enable row level security;

drop policy if exists "profile own read" on public.profiles;
create policy "profile own read" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profile own update" on public.profiles;
create policy "profile own update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['customers','measurements','orders','bulk_orders','bulk_order_items','appointments','payments','order_status_history','notifications','business_settings']
  loop
    execute format('drop policy if exists "admin all" on public.%I', t);
    execute format('create policy "admin all" on public.%I for all to authenticated using (public.is_mimis_admin()) with check (public.is_mimis_admin())', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.create_order_with_history(jsonb) to authenticated;
grant execute on function public.refresh_system_notifications() to authenticated;
revoke all on all tables in schema public from anon;

-- After creating the administrator in Supabase Authentication, authorize it:
-- insert into public.profiles (id, full_name, email)
-- select id, 'Mimi Administrator', email from auth.users where email = 'your-admin@email.com';
