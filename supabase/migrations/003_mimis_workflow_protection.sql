-- Mimi's Tailoring workflow synchronization and record protection
-- REVIEW-ONLY, NON-DESTRUCTIVE FOLLOW-UP MIGRATION.
-- Apply only after backing up the existing project and applying migrations 001 and 002.
-- This migration adds optional columns, audit records, validation, and synchronization triggers.

alter table public.orders
  add column if not exists delivery_deadline_at timestamptz,
  add column if not exists ready_for_pickup_at timestamptz,
  add column if not exists pickup_due_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.bulk_orders
  add column if not exists delivery_deadline_at timestamptz;

create index if not exists orders_deadline_at_idx
  on public.orders(delivery_deadline_at)
  where order_status not in ('Completed', 'Cancelled');

create index if not exists bulk_orders_deadline_at_idx
  on public.bulk_orders(delivery_deadline_at)
  where status not in ('Completed', 'Cancelled');

create table if not exists public.payment_correction_history (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  previous_record jsonb not null,
  corrected_record jsonb not null,
  corrected_by uuid references auth.users(id) on delete restrict,
  corrected_at timestamptz not null default now()
);

alter table public.payment_correction_history enable row level security;
drop policy if exists "admin all" on public.payment_correction_history;
create policy "admin all"
  on public.payment_correction_history
  for all
  to authenticated
  using (public.is_mimis_admin())
  with check (public.is_mimis_admin());

grant select, insert on public.payment_correction_history to authenticated;
revoke all on public.payment_correction_history from anon;

create or replace function public.audit_payment_correction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.payment_correction_history(
    payment_id,
    previous_record,
    corrected_record,
    corrected_by
  )
  values (new.id, to_jsonb(old), to_jsonb(new), auth.uid());
  return new;
end;
$$;

drop trigger if exists payments_audit_correction on public.payments;
create trigger payments_audit_correction
after update on public.payments
for each row execute function public.audit_payment_correction();

create or replace function public.prevent_payment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Payment records cannot be deleted. Use a controlled correction instead.';
end;
$$;

drop trigger if exists payments_prevent_delete on public.payments;
create trigger payments_prevent_delete
before delete on public.payments
for each row execute function public.prevent_payment_delete();

create or replace function public.stamp_order_workflow_times()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.order_status = 'Ready for Pickup'
    and old.order_status is distinct from 'Ready for Pickup' then
    new.ready_for_pickup_at := coalesce(new.ready_for_pickup_at, now());
    new.pickup_due_at := coalesce(new.pickup_due_at, now() + interval '3 days');
  end if;

  if new.order_status = 'Completed'
    and old.order_status is distinct from 'Completed' then
    new.picked_up_at := coalesce(new.picked_up_at, now());
  end if;

  if new.order_status = 'Cancelled'
    and old.order_status is distinct from 'Cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists orders_stamp_workflow_times on public.orders;
create trigger orders_stamp_workflow_times
before update of order_status on public.orders
for each row execute function public.stamp_order_workflow_times();

create or replace function public.protect_order_history()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  amount_paid numeric;
begin
  if old.order_status in ('Completed', 'Cancelled')
    and (
      new.customer_id,
      new.measurement_id,
      new.garment_name,
      new.garment_category,
      new.customization_details,
      new.quantity,
      new.unit_price,
      new.order_date,
      new.delivery_deadline,
      new.delivery_deadline_at,
      new.notes,
      new.order_status
    ) is distinct from (
      old.customer_id,
      old.measurement_id,
      old.garment_name,
      old.garment_category,
      old.customization_details,
      old.quantity,
      old.unit_price,
      old.order_date,
      old.delivery_deadline,
      old.delivery_deadline_at,
      old.notes,
      old.order_status
    ) then
    raise exception 'Completed or cancelled orders are locked.';
  end if;

  select coalesce(sum(amount), 0)
  into amount_paid
  from public.payments
  where order_id = old.id;

  if amount_paid > 0 and new.customer_id <> old.customer_id then
    raise exception 'The customer cannot be changed after a payment is recorded.';
  end if;

  if new.quantity * new.unit_price < amount_paid then
    raise exception 'The revised total cannot be lower than recorded payments.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_protect_history on public.orders;
create trigger orders_protect_history
before update on public.orders
for each row execute function public.protect_order_history();

create or replace function public.protect_terminal_workflow_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'appointments'
    and old.status in ('Completed', 'Cancelled')
    and new is distinct from old then
    raise exception 'Completed or cancelled appointments are locked.';
  elsif tg_table_name = 'bulk_orders'
    and old.status in ('Completed', 'Cancelled')
    and new is distinct from old then
    raise exception 'Completed or cancelled bulk orders are locked.';
  elsif tg_table_name = 'bulk_order_items'
    and old.status in ('Completed', 'Cancelled')
    and new is distinct from old then
    raise exception 'Completed or cancelled bulk-order entries are locked.';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_protect_terminal on public.appointments;
create trigger appointments_protect_terminal
before update on public.appointments
for each row execute function public.protect_terminal_workflow_record();

drop trigger if exists bulk_orders_protect_terminal on public.bulk_orders;
create trigger bulk_orders_protect_terminal
before update on public.bulk_orders
for each row execute function public.protect_terminal_workflow_record();

drop trigger if exists bulk_items_protect_terminal on public.bulk_order_items;
create trigger bulk_items_protect_terminal
before update on public.bulk_order_items
for each row execute function public.protect_terminal_workflow_record();

create or replace function public.validate_appointment_order()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_customer uuid;
  linked_status text;
begin
  if new.order_id is null then
    return new;
  end if;

  select customer_id, order_status
  into linked_customer, linked_status
  from public.orders
  where id = new.order_id;

  if linked_customer is null then
    raise exception 'The linked order was not found.';
  end if;

  if linked_customer <> new.customer_id then
    raise exception 'The linked order does not belong to the selected customer.';
  end if;

  if linked_status in ('Completed', 'Cancelled')
    and new.status in ('Scheduled', 'Rescheduled') then
    raise exception 'Completed or cancelled orders cannot receive a new active fitting.';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_validate_order on public.appointments;
create trigger appointments_validate_order
before insert or update of customer_id, order_id, status on public.appointments
for each row execute function public.validate_appointment_order();

create or replace function public.sync_order_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order_status text;
begin
  if new.order_id is null or new.status = 'Cancelled' then
    return new;
  end if;

  if new.status in ('Scheduled', 'Rescheduled') then
    update public.orders
    set order_status = 'For Fitting'
    where id = new.order_id
      and order_status not in ('Ready for Pickup', 'Completed', 'Cancelled');
    return new;
  end if;

  if new.status = 'Completed'
    and (tg_op = 'INSERT' or old.status is distinct from 'Completed') then
    next_order_status := case new.appointment_type
      when 'Final Fitting' then 'Ready for Pickup'
      when 'Pickup' then 'Completed'
      else 'For Alteration'
    end;

    update public.orders
    set order_status = next_order_status
    where id = new.order_id
      and order_status not in ('Completed', 'Cancelled');
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_sync_order on public.appointments;
create trigger appointments_sync_order
after insert or update of status, order_id, appointment_type on public.appointments
for each row execute function public.sync_order_from_appointment();

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
  if not exists (
    select 1 from public.customers
    where id = target_customer and archived_at is null
  ) then
    raise exception 'An active customer is required to create an order.';
  end if;

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
    order_date, delivery_deadline, delivery_deadline_at, notes
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
    'Pending',
    coalesce((order_payload->>'order_date')::date, (now() at time zone 'Asia/Manila')::date),
    nullif(order_payload->>'delivery_deadline', '')::date,
    nullif(order_payload->>'delivery_deadline_at', '')::timestamptz,
    nullif(order_payload->>'notes', '')
  )
  returning id into new_id;

  insert into public.order_status_history(order_id, previous_status, new_status, notes)
  values (new_id, null, 'Pending', 'Order created');
  return new_id;
end;
$$;

create or replace function public.update_order_preserving_history(
  target_order_id uuid,
  order_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing_order public.orders%rowtype;
  selected_measurement public.measurements%rowtype;
  target_customer uuid := (order_payload->>'customer_id')::uuid;
  target_measurement uuid := nullif(order_payload->>'measurement_id', '')::uuid;
  snapshot jsonb;
  new_quantity integer := greatest(coalesce((order_payload->>'quantity')::integer, 1), 1);
  new_unit_price numeric := greatest(coalesce((order_payload->>'unit_price')::numeric, 0), 0);
  amount_paid numeric;
begin
  select * into existing_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order was not found.';
  end if;

  if existing_order.order_status in ('Completed', 'Cancelled') then
    raise exception 'Completed or cancelled orders cannot be edited.';
  end if;

  if not exists (
    select 1 from public.customers
    where id = target_customer and archived_at is null
  ) then
    raise exception 'An active customer is required.';
  end if;

  select coalesce(sum(amount), 0)
  into amount_paid
  from public.payments
  where order_id = target_order_id;

  if target_customer <> existing_order.customer_id and amount_paid > 0 then
    raise exception 'The customer cannot be changed after a payment is recorded.';
  end if;

  if new_quantity * new_unit_price < amount_paid then
    raise exception 'The revised total cannot be lower than recorded payments.';
  end if;

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

  update public.orders
  set customer_id = target_customer,
      measurement_id = target_measurement,
      measurement_snapshot = snapshot,
      garment_name = case when target_measurement is null
        then order_payload->>'garment_name'
        else selected_measurement.garment_type
      end,
      garment_category = case when target_measurement is null
        then order_payload->>'garment_category'
        else selected_measurement.garment_category
      end,
      customization_details = case when target_measurement is null
        then coalesce(order_payload->'customization_details', '{}'::jsonb)
        else selected_measurement.customization_details
      end,
      quantity = new_quantity,
      unit_price = new_unit_price,
      order_date = coalesce(
        (order_payload->>'order_date')::date,
        existing_order.order_date
      ),
      delivery_deadline = nullif(order_payload->>'delivery_deadline', '')::date,
      delivery_deadline_at = nullif(order_payload->>'delivery_deadline_at', '')::timestamptz,
      notes = nullif(order_payload->>'notes', '')
  where id = target_order_id;

  return target_order_id;
end;
$$;

grant execute on function public.create_order_with_history(jsonb) to authenticated;
grant execute on function public.update_order_preserving_history(uuid, jsonb) to authenticated;
