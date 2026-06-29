-- =========================================================================
-- 0010_recurring_income.sql — recurring/expected income (mirror of bills)
-- =========================================================================

create table if not exists public.recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  amount numeric(18,2) not null check (amount > 0),
  currency char(3) not null default 'IDR',
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  frequency public.sys_frequency not null default 'monthly',
  start_date date not null default current_date,
  next_due_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  last_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_recurring_incomes_updated_at on public.recurring_incomes;
create trigger trg_recurring_incomes_updated_at before update on public.recurring_incomes
  for each row execute function public.set_updated_at();
create index if not exists idx_recurring_incomes_org on public.recurring_incomes(organization_id, next_due_date);

-- create (owner/admin)
create or replace function public.create_recurring_income(
  p_name text, p_amount numeric, p_account_id uuid, p_category_id uuid default null,
  p_frequency public.sys_frequency default 'monthly', p_start_date date default null, p_end_date date default null
) returns public.recurring_incomes language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_row public.recurring_incomes;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus > 0'; end if;
  if p_account_id is null then raise exception 'Pilih akun'; end if;
  select organization_id into v_org from public.accounts where id = p_account_id and deleted_at is null;
  if v_org is null then raise exception 'Akun tidak ditemukan'; end if;
  if public.org_role(v_org) not in ('owner','admin') then raise exception 'Hanya owner/admin'; end if;
  insert into public.recurring_incomes
    (organization_id, name, amount, account_id, category_id, frequency, start_date, next_due_date, end_date)
  values (v_org, p_name, p_amount, p_account_id, p_category_id, p_frequency,
          coalesce(p_start_date, current_date), coalesce(p_start_date, current_date), p_end_date)
  returning * into v_row;
  return v_row;
end; $$;
grant execute on function public.create_recurring_income(text, numeric, uuid, uuid, public.sys_frequency, date, date) to authenticated;

-- next due date for a frequency
create or replace function public.income_next_due(p_freq public.sys_frequency, p_date date)
returns date language sql immutable as $$
  select case p_freq
    when 'weekly' then (p_date + interval '7 days')::date
    when 'monthly' then (p_date + interval '1 month')::date
    when 'yearly' then (p_date + interval '1 year')::date
    else p_date end;
$$;

-- receive (confirm): record an income transaction + advance next due (or finish)
create or replace function public.receive_recurring_income(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_org uuid; v_new date;
begin
  select * into r from public.recurring_incomes where id = p_id;
  if not found then raise exception 'Pendapatan tidak ditemukan'; end if;
  v_org := r.organization_id;
  if public.org_role(v_org) not in ('owner','admin','member') then raise exception 'Tidak diizinkan'; end if;

  insert into public.transactions (organization_id, account_id, type, amount, category_id, description, transaction_date, created_by, source, source_ref)
  values (v_org, r.account_id, 'income'::public.sys_tx_type, r.amount, r.category_id, 'Pendapatan: ' || r.name, current_date, auth.uid(), 'recurring'::public.sys_tx_source, 'income:' || r.id);

  if r.frequency = 'once' or r.is_active = false then
    update public.recurring_incomes set is_active = false, last_received_at = now() where id = p_id;
  else
    v_new := public.income_next_due(r.frequency, r.next_due_date);
    if r.end_date is not null and v_new > r.end_date then
      update public.recurring_incomes set is_active = false, last_received_at = now(), next_due_date = v_new where id = p_id;
    else
      update public.recurring_incomes set next_due_date = v_new, last_received_at = now() where id = p_id;
    end if;
  end if;
end; $$;
grant execute on function public.receive_recurring_income(uuid) to authenticated;

-- skip this occurrence only: advance next due WITHOUT a transaction
create or replace function public.skip_recurring_income(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_org uuid; v_new date;
begin
  select * into r from public.recurring_incomes where id = p_id;
  if not found then raise exception 'Pendapatan tidak ditemukan'; end if;
  v_org := r.organization_id;
  if public.org_role(v_org) not in ('owner','admin','member') then raise exception 'Tidak diizinkan'; end if;

  if r.frequency = 'once' or r.is_active = false then
    update public.recurring_incomes set is_active = false where id = p_id;
  else
    v_new := public.income_next_due(r.frequency, r.next_due_date);
    if r.end_date is not null and v_new > r.end_date then
      update public.recurring_incomes set is_active = false, next_due_date = v_new where id = p_id;
    else
      update public.recurring_incomes set next_due_date = v_new where id = p_id;
    end if;
  end if;
end; $$;
grant execute on function public.skip_recurring_income(uuid) to authenticated;

-- permanent cancel: delete entirely (owner/admin)
create or replace function public.delete_recurring_income(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.recurring_incomes where id = p_id;
  if v_org is null then raise exception 'Pendapatan tidak ditemukan'; end if;
  if public.org_role(v_org) not in ('owner','admin') then raise exception 'Hanya owner/admin'; end if;
  delete from public.recurring_incomes where id = p_id;
end; $$;
grant execute on function public.delete_recurring_income(uuid) to authenticated;

-- RLS: members read; owner/admin write
alter table public.recurring_incomes enable row level security;
drop policy if exists "ri member select" on public.recurring_incomes;
create policy "ri member select" on public.recurring_incomes
  for select using (public.is_org_member(organization_id));
drop policy if exists "ri admin write" on public.recurring_incomes;
create policy "ri admin write" on public.recurring_incomes
  for all using (public.org_role(organization_id) in ('owner','admin'))
  with check (public.org_role(organization_id) in ('owner','admin'));
