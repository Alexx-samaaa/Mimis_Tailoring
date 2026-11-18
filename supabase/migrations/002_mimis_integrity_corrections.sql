-- Mimi's Tailoring integrity corrections
-- REVIEWED, NON-DESTRUCTIVE FOLLOW-UP MIGRATION.
-- Do not run automatically. Apply once to the existing project only after taking a backup
-- and confirming migration 001_mimis_tailoring.sql is already present.

alter table public.measurements
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders
  add column if not exists measurement_snapshot jsonb;

alter table public.bulk_order_items
  add column if not exists measurement_id uuid references public.measurements(id) on delete restrict;

create index if not exists bulk_items_measurement_idx
  on public.bulk_order_items(measurement_id);

-- Preserve the exact measurement details used by every existing linked order.
update public.orders o
set measurement_snapshot = jsonb_build_object(
  'id', m.id,
  'version', m.version,
  'garment_category', m.garment_category,
  'garment_type', m.garment_type,
  'measurement_values', m.measurement_values,
  'customization_details', m.customization_details,
  'notes', m.notes
)
from public.measurements m
where o.measurement_id = m.id
  and o.measurement_snapshot is null;

drop trigger if exists measurements_immutable on public.measurements;

drop trigger if exists measurements_updated_at on public.measurements;
create trigger measurements_updated_at
before update on public.measurements
for each row execute function public.set_updated_at();

create or replace function public.measurement_limit(measurement_name text)
returns numrange
language sql
immutable
set search_path = public
as $$
  select case measurement_name
    when 'bust' then numrange(18, 80, '[]')
    when 'chest' then numrange(18, 80, '[]')
    when 'waist' then numrange(15, 75, '[]')
    when 'hips' then numrange(20, 85, '[]')
    when 'shoulder' then numrange(8, 30, '[]')
    when 'armhole' then numrange(8, 40, '[]')
    when 'sleeveLength' then numrange(2, 45, '[]')
    when 'blouseLength' then numrange(8, 50, '[]')
    when 'fullLength' then numrange(20, 90, '[]')
    when 'shoulderToFloor' then numrange(25, 90, '[]')
    when 'thigh' then numrange(10, 50, '[]')
    when 'frontRise' then numrange(5, 30, '[]')
    when 'inseam' then numrange(8, 50, '[]')
    when 'outseam' then numrange(12, 60, '[]')
    when 'skirtLength' then numrange(8, 65, '[]')
    else null
  end;
$$;

create or replace function public.validate_measurement_values()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  entry record;
  allowed_range numrange;
  numeric_value numeric;
begin
  if jsonb_typeof(new.measurement_values) <> 'object' then
    raise exception 'Measurement values must be an object.';
  end if;

  if new.garment_category = 'Tops'
    and not (new.measurement_values ?& array['bust', 'shoulder', 'waist']) then
    raise exception 'Bust, shoulder, and waist are required for tops.';
  elsif new.garment_category = 'Dresses and Gowns'
    and not (new.measurement_values ?& array['bust', 'waist', 'hips', 'shoulder']) then
    raise exception 'Bust, waist, hips, and shoulder are required for dresses and gowns.';
  elsif new.garment_category = 'Bottoms'
    and not (new.measurement_values ?& array['waist', 'hips']) then
    raise exception 'Waist and hips are required for bottoms.';
  elsif new.garment_category = 'Formal Wear'
    and new.garment_type = 'Formal trousers'
    and not (new.measurement_values ?& array['waist', 'hips']) then
    raise exception 'Waist and hips are required for formal trousers.';
  elsif new.garment_category = 'Formal Wear'
    and new.garment_type <> 'Formal trousers'
    and not (new.measurement_values ?& array['chest', 'shoulder', 'waist', 'hips']) then
    raise exception 'Chest, shoulder, waist, and hips are required for formal wear.';
  elsif new.garment_category = 'Other Garments'
    and not (new.measurement_values ?& array['bust', 'shoulder', 'waist', 'hips']) then
    raise exception 'Bust, shoulder, waist, and hips are required for this garment.';
  end if;

  if new.customization_details->>'sleeveStyle' = 'Sleeveless'
    and new.measurement_values ? 'sleeveLength' then
    raise exception 'Sleeve length does not apply to a sleeveless garment.';
  end if;

  if new.garment_type = 'Skirt'
    and new.measurement_values ?| array['thigh', 'frontRise', 'inseam', 'outseam'] then
    raise exception 'Trouser measurements do not apply to a skirt.';
  end if;

  if new.garment_type <> 'Skirt' and new.measurement_values ? 'skirtLength' then
    raise exception 'Skirt length only applies to skirts.';
  end if;

  for entry in select * from jsonb_each_text(new.measurement_values)
  loop
    allowed_range := public.measurement_limit(entry.key);
    if allowed_range is null then
      raise exception 'Unsupported measurement field: %', entry.key;
    end if;
    begin
      numeric_value := entry.value::numeric;
    exception when others then
      raise exception '% must be a number.', entry.key;
    end;
    if not allowed_range @> numeric_value then
      raise exception '% is outside the allowed range %.', entry.key, allowed_range;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists measurements_validate_values on public.measurements;
create trigger measurements_validate_values
before insert or update of measurement_values on public.measurements
for each row execute function public.validate_measurement_values();

create or replace function public.save_measurement_version(
  measurement_payload jsonb,
  existing_measurement_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_id uuid;
  next_version integer;
  target_customer uuid := (measurement_payload->>'customer_id')::uuid;
begin
  if not exists (
    select 1 from public.customers
    where id = target_customer and archived_at is null
  ) then
    raise exception 'Customer is unavailable for new measurements.';
  end if;

  if existing_measurement_id is not null then
    update public.measurements
    set garment_category = measurement_payload->>'garment_category',
        garment_type = measurement_payload->>'garment_type',
        measurement_values = coalesce(measurement_payload->'measurement_values', '{}'::jsonb),
        customization_details = coalesce(measurement_payload->'customization_details', '{}'::jsonb),
        notes = nullif(measurement_payload->>'notes', '')
    where id = existing_measurement_id
      and customer_id = target_customer
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Measurement version was not found for this customer.';
    end if;
    return saved_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_customer::text, 0));
  select coalesce(max(version), 0) + 1
  into next_version
  from public.measurements
  where customer_id = target_customer;

  insert into public.measurements(
    customer_id,
    garment_category,
    garment_type,
    measurement_values,
    customization_details,
    version,
    notes
  )
  values (
    target_customer,
    measurement_payload->>'garment_category',
    measurement_payload->>'garment_type',
    coalesce(measurement_payload->'measurement_values', '{}'::jsonb),
    coalesce(measurement_payload->'customization_details', '{}'::jsonb),
    next_version,
    nullif(measurement_payload->>'notes', '')
  )
  returning id into saved_id;

  return saved_id;
end;
$$;

create or replace function public.create_order_with_history(order_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  selected_measurement public.measurements%rowtype;
  target_customer uuid := (order_payload->>'customer_id')::uuid;
  target_measurement uuid := nullif(order_payload->>'measurement_id', '')::uuid;
  snapshot jsonb;
begin
  if target_measurement is not null then
    select * into selected_measurement
    from public.measurements
    where id = target_measurement and customer_id = target_customer;

    if not found then
      raise exception 'The selected measurement does not belong to this customer.';
    end if;

    snapshot := jsonb_build_object(
      'id', selected_measurement.id,
      'version', selected_measurement.version,
      'garment_category', selected_measurement.garment_category,
      'garment_type', selected_measurement.garment_type,
      'measurement_values', selected_measurement.measurement_values,
      'customization_details', selected_measurement.customization_details,
      'notes', selected_measurement.notes
    );
  end if;

  insert into public.orders(
    customer_id, measurement_id, measurement_snapshot, order_type, garment_name,
    garment_category, customization_details, quantity, unit_price, order_status,
    order_date, delivery_deadline, notes
  ) values (
    target_customer,
    target_measurement,
    snapshot,
    coalesce(order_payload->>'order_type', 'Personal'),
    case when target_measurement is null
      then order_payload->>'garment_name'
      else selected_measurement.garment_type
    end,
    case when target_measurement is null
      then order_payload->>'garment_category'
      else selected_measurement.garment_category
    end,
    case when target_measurement is null
      then coalesce(order_payload->'customization_details', '{}'::jsonb)
      else selected_measurement.customization_details
    end,
    greatest(coalesce((order_payload->>'quantity')::integer, 1), 1),
    greatest(coalesce((order_payload->>'unit_price')::numeric, 0), 0),
    coalesce(order_payload->>'order_status', 'Pending'),
    coalesce((order_payload->>'order_date')::date, (now() at time zone 'Asia/Manila')::date),
    nullif(order_payload->>'delivery_deadline', '')::date,
    nullif(order_payload->>'notes', '')
  )
  returning id into new_id;

  insert into public.order_status_history(order_id, previous_status, new_status, notes)
  values (new_id, null, coalesce(order_payload->>'order_status', 'Pending'), 'Order created');
  return new_id;
end;
$$;

create or replace function public.prevent_payment_overage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  order_total numeric;
  order_state text;
  already_paid numeric;
begin
  select total_price, order_status
  into order_total, order_state
  from public.orders
  where id = new.order_id
  for update;

  if order_state = 'Cancelled' then
    raise exception 'Payments cannot be added to a cancelled order.';
  end if;

  select coalesce(sum(amount), 0)
  into already_paid
  from public.payments
  where order_id = new.order_id
    and id is distinct from new.id;

  if already_paid + new.amount > order_total then
    raise exception 'Payment exceeds the remaining balance.';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_prevent_overage on public.payments;
create trigger payments_prevent_overage
before insert or update of amount, order_id on public.payments
for each row execute function public.prevent_payment_overage();

create or replace function public.sync_bulk_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_id uuid := coalesce(new.bulk_order_id, old.bulk_order_id);
  active_count integer;
  completed_count integer;
  pending_count integer;
  total_count integer;
begin
  select
    count(*) filter (where status <> 'Cancelled'),
    count(*) filter (where status = 'Completed'),
    count(*) filter (where status = 'Pending'),
    count(*)
  into active_count, completed_count, pending_count, total_count
  from public.bulk_order_items
  where bulk_order_id = parent_id;

  update public.bulk_orders
  set status = case
    when total_count > 0 and active_count = 0 then 'Cancelled'
    when active_count > 0 and completed_count = active_count then 'Completed'
    when active_count > 0 and pending_count = active_count then 'Pending'
    else 'In Progress'
  end
  where id = parent_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists bulk_items_sync_parent on public.bulk_order_items;
create trigger bulk_items_sync_parent
after insert or update or delete on public.bulk_order_items
for each row execute function public.sync_bulk_order_status();

create or replace function public.refresh_system_notifications()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  local_today date := (now() at time zone 'Asia/Manila')::date;
  alert_days integer := coalesce(
    (select max(deadline_alert_days) from public.business_settings),
    3
  );
begin
  insert into public.notifications(
    title, message, notification_type, related_order_id, related_customer_id, dedupe_key
  )
  select
    case when o.delivery_deadline < local_today
      then 'Overdue order'
      else 'Upcoming delivery deadline'
    end,
    c.first_name || '''s ' || o.garment_name ||
      case when o.delivery_deadline < local_today
        then ' was due on '
        else ' is due on '
      end ||
      to_char(o.delivery_deadline, 'FMMonth DD, YYYY') || '.',
    case when o.delivery_deadline < local_today
      then 'overdue_order'
      else 'upcoming_deadline'
    end,
    o.id,
    o.customer_id,
    'deadline:' || o.id::text
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.delivery_deadline between local_today - 365 and local_today + alert_days
    and o.order_status not in ('Completed', 'Cancelled')
  on conflict (dedupe_key) do update
  set title = excluded.title,
      message = excluded.message,
      notification_type = excluded.notification_type;

  insert into public.notifications(
    title, message, notification_type, related_order_id, related_customer_id, dedupe_key
  )
  select
    case when a.appointment_date < local_today
      then 'Missed fitting appointment'
      else 'Upcoming fitting appointment'
    end,
    c.first_name || '''s ' || coalesce(o.garment_name, a.appointment_type) ||
      case when a.appointment_date < local_today
        then ' fitting was scheduled for '
        else ' fitting is scheduled for '
      end ||
      to_char(a.appointment_date, 'FMMonth DD, YYYY') || ', at ' ||
      to_char(a.appointment_time, 'FMHH12:MI AM') || '.',
    case when a.appointment_date < local_today then 'missed_fitting' else 'upcoming_fitting' end,
    a.order_id,
    a.customer_id,
    'appointment:' || a.id::text
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  left join public.orders o on o.id = a.order_id
  where a.status in ('Scheduled', 'Rescheduled')
    and a.appointment_date between local_today - 365 and local_today + alert_days
  on conflict (dedupe_key) do update
  set title = excluded.title,
      message = excluded.message,
      notification_type = excluded.notification_type;

  insert into public.notifications(
    title, message, notification_type, related_order_id, related_customer_id, dedupe_key
  )
  select
    'Order ready for pickup',
    c.first_name || '''s ' || o.garment_name || ' is ready for pickup.',
    'ready_for_pickup',
    o.id,
    o.customer_id,
    'pickup:' || o.id::text
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.order_status = 'Ready for Pickup'
  on conflict (dedupe_key) do update
  set title = excluded.title,
      message = excluded.message;

  insert into public.notifications(
    title, message, notification_type, related_order_id, related_customer_id, dedupe_key
  )
  select
    'Outstanding order balance',
    c.first_name || '''s ' || o.garment_name || ' has a remaining balance of ₱' ||
      to_char(o.total_price - coalesce(sum(p.amount), 0), 'FM999,999,990.00') || '.',
    'outstanding_balance',
    o.id,
    o.customer_id,
    'balance:' || o.id::text
  from public.orders o
  join public.customers c on c.id = o.customer_id
  left join public.payments p on p.order_id = o.id
  where o.order_status <> 'Cancelled'
  group by o.id, c.first_name
  having o.total_price - coalesce(sum(p.amount), 0) > 0
  on conflict (dedupe_key) do update
  set title = excluded.title,
      message = excluded.message;

  delete from public.notifications n
  where n.notification_type in ('overdue_order', 'upcoming_deadline')
    and not exists (
      select 1
      from public.orders o
      where n.dedupe_key = 'deadline:' || o.id::text
        and o.delivery_deadline between local_today - 365 and local_today + alert_days
        and o.order_status not in ('Completed', 'Cancelled')
    );

  delete from public.notifications n
  where n.notification_type in ('upcoming_fitting', 'missed_fitting')
    and not exists (
      select 1
      from public.appointments a
      where n.dedupe_key = 'appointment:' || a.id::text
        and a.status in ('Scheduled', 'Rescheduled')
        and a.appointment_date between local_today - 365 and local_today + alert_days
    );

  delete from public.notifications n
  where n.notification_type = 'ready_for_pickup'
    and not exists (
      select 1 from public.orders o
      where n.dedupe_key = 'pickup:' || o.id::text
        and o.order_status = 'Ready for Pickup'
    );

  delete from public.notifications n
  where n.notification_type = 'outstanding_balance'
    and not exists (
      select 1
      from public.orders o
      left join public.payments p on p.order_id = o.id
      where n.dedupe_key = 'balance:' || o.id::text
        and o.order_status <> 'Cancelled'
      group by o.id
      having o.total_price - coalesce(sum(p.amount), 0) > 0
    );
end;
$$;

grant execute on function public.save_measurement_version(jsonb, uuid) to authenticated;
grant execute on function public.measurement_limit(text) to authenticated;
grant execute on function public.create_order_with_history(jsonb) to authenticated;
grant execute on function public.refresh_system_notifications() to authenticated;
