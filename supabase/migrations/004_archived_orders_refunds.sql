-- Mimi's Tailoring archived orders, refund ledger, and controlled restoration.
-- ADDITIVE, NON-DESTRUCTIVE MIGRATION.
-- Apply after migrations 001, 002, and 003.

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  refund_date date not null default current_date,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists refunds_order_idx
  on public.refunds(order_id, refund_date desc);
create index if not exists refunds_payment_idx
  on public.refunds(payment_id, refund_date desc);

alter table public.refunds enable row level security;
drop policy if exists "admin all" on public.refunds;
create policy "admin all"
  on public.refunds
  for all
  to authenticated
  using (public.is_mimis_admin())
  with check (public.is_mimis_admin());

create or replace function public.validate_refund()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  payment_order_id uuid;
  payment_amount numeric;
  order_state text;
  already_refunded numeric;
begin
  select p.order_id, p.amount, o.order_status
  into payment_order_id, payment_amount, order_state
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = new.payment_id
  for update of p;

  if not found then
    raise exception 'The related payment was not found.';
  end if;

  if payment_order_id <> new.order_id then
    raise exception 'The related payment does not belong to this order.';
  end if;

  if order_state <> 'Cancelled' then
    raise exception 'Refunds can only be recorded for cancelled orders.';
  end if;

  if new.refund_date > current_date then
    raise exception 'A refund can only be recorded after money has been returned.';
  end if;

  select coalesce(sum(amount), 0)
  into already_refunded
  from public.refunds
  where payment_id = new.payment_id;

  if already_refunded + new.amount > payment_amount then
    raise exception 'Refund exceeds the unrefunded amount of the related payment.';
  end if;

  new.reason := trim(new.reason);
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists refunds_validate on public.refunds;
create trigger refunds_validate
before insert on public.refunds
for each row execute function public.validate_refund();

create or replace function public.prevent_refund_modification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Refund records cannot be changed or deleted. Record only completed refunds.';
end;
$$;

drop trigger if exists refunds_immutable on public.refunds;
create trigger refunds_immutable
before update or delete on public.refunds
for each row execute function public.prevent_refund_modification();

create or replace function public.prevent_order_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Orders cannot be permanently deleted. Use the archive workflow.';
end;
$$;

drop trigger if exists orders_prevent_delete on public.orders;
create trigger orders_prevent_delete
before delete on public.orders
for each row execute function public.prevent_order_delete();

create or replace function public.protect_order_history()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  amount_paid numeric;
  is_restore boolean;
begin
  is_restore :=
    old.order_status in ('Completed', 'Cancelled')
    and new.order_status in (
      'Pending',
      'In Progress',
      'For Fitting',
      'For Alteration',
      'Ready for Pickup'
    )
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
      new.notes
    ) is not distinct from (
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
      old.notes
    );

  if old.order_status in ('Completed', 'Cancelled')
    and new is distinct from old
    and not is_restore then
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

create or replace function public.restore_order(
  target_order_id uuid,
  restored_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_status text;
begin
  if restored_status not in (
    'Pending',
    'In Progress',
    'For Fitting',
    'For Alteration',
    'Ready for Pickup'
  ) then
    raise exception 'Choose a valid active order status.';
  end if;

  select order_status
  into current_status
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order was not found.';
  end if;

  if current_status not in ('Completed', 'Cancelled') then
    raise exception 'Only archived orders can be restored.';
  end if;

  update public.orders
  set order_status = restored_status
  where id = target_order_id;

  return target_order_id;
end;
$$;

create or replace function public.protect_terminal_workflow_record()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  valid_restore boolean := false;
begin
  if tg_table_name = 'appointments'
    and old.status in ('Completed', 'Cancelled')
    and new is distinct from old then
    raise exception 'Completed or cancelled appointments are locked.';
  elsif tg_table_name = 'bulk_orders'
    and old.status in ('Completed', 'Cancelled')
    and new is distinct from old then
    valid_restore :=
      new.status in (
        'Pending',
        'In Progress',
        'For Fitting',
        'For Alteration',
        'Ready for Pickup'
      )
      and (
        new.organization_name,
        new.group_name,
        new.contact_person,
        new.contact_number,
        new.order_date,
        new.delivery_deadline,
        new.delivery_deadline_at,
        new.notes,
        new.created_at
      ) is not distinct from (
        old.organization_name,
        old.group_name,
        old.contact_person,
        old.contact_number,
        old.order_date,
        old.delivery_deadline,
        old.delivery_deadline_at,
        old.notes,
        old.created_at
      );
    if not valid_restore then
      raise exception 'Completed or cancelled bulk orders are locked.';
    end if;
  elsif tg_table_name = 'bulk_order_items'
    and old.status in ('Completed', 'Cancelled')
    and new is distinct from old then
    raise exception 'Completed or cancelled bulk-order entries are locked.';
  end if;
  return new;
end;
$$;

create or replace function public.restore_bulk_order(
  target_bulk_order_id uuid,
  restored_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_status text;
begin
  if restored_status not in (
    'Pending',
    'In Progress',
    'For Fitting',
    'For Alteration',
    'Ready for Pickup'
  ) then
    raise exception 'Choose a valid active order status.';
  end if;

  select status
  into current_status
  from public.bulk_orders
  where id = target_bulk_order_id
  for update;

  if not found then
    raise exception 'Bulk order was not found.';
  end if;

  if current_status not in ('Completed', 'Cancelled') then
    raise exception 'Only archived bulk orders can be restored.';
  end if;

  update public.bulk_orders
  set status = restored_status
  where id = target_bulk_order_id;

  return target_bulk_order_id;
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
  already_refunded numeric;
begin
  select total_price, order_status
  into order_total, order_state
  from public.orders
  where id = new.order_id
  for update;

  if order_state = 'Cancelled' then
    raise exception 'Payments cannot be added to or changed on a cancelled order.';
  end if;

  select coalesce(sum(amount), 0)
  into already_paid
  from public.payments
  where order_id = new.order_id
    and id is distinct from new.id;

  select coalesce(sum(amount), 0)
  into already_refunded
  from public.refunds
  where payment_id = new.id;

  if already_refunded > new.amount then
    raise exception 'The payment cannot be reduced below its recorded refunds.';
  end if;

  if tg_op = 'UPDATE' and old.order_id <> new.order_id and already_refunded > 0 then
    raise exception 'A payment with refunds cannot be moved to another order.';
  end if;

  if already_paid + new.amount > order_total then
    raise exception 'Payment exceeds the remaining balance.';
  end if;
  return new;
end;
$$;

grant select, insert on public.refunds to authenticated;
grant execute on function public.restore_order(uuid, text) to authenticated;
grant execute on function public.restore_bulk_order(uuid, text) to authenticated;
revoke all on public.refunds from anon;
