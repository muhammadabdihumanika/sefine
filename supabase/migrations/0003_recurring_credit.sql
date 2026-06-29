-- =========================================================================
-- 0003_recurring_credit.sql — bills, loans, installments, budgets, goals
-- =========================================================================

do $$ begin
  create type public.sys_frequency as enum ('once','weekly','monthly','yearly');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_loan_direction as enum ('lent','borrowed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_loan_status as enum ('active','paid','written_off');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_budget_period as enum ('weekly','monthly','yearly');
exception when duplicate_object then null; end $$;

-- ===== bills (tagihan) =====
create table if not exists public.bills (
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
  is_paid boolean not null default false,
  auto_pay boolean not null default false,
  last_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_bills_updated_at on public.bills;
create trigger trg_bills_updated_at before update on public.bills
  for each row execute function public.set_updated_at();
create index if not exists idx_bills_org_due on public.bills(organization_id, next_due_date);

-- ===== loans (pinjaman) =====
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  direction public.sys_loan_direction not null,
  counterparty text,
  principal numeric(18,2) not null check (principal > 0),
  currency char(3) not null default 'IDR',
  interest_rate numeric(6,3),
  term_months int,
  start_date date not null default current_date,
  account_id uuid references public.accounts(id) on delete set null,
  status public.sys_loan_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_loans_updated_at on public.loans;
create trigger trg_loans_updated_at before update on public.loans
  for each row execute function public.set_updated_at();

-- ===== installments (cicilan) =====
create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  counterparty text,
  principal numeric(18,2) not null check (principal > 0),
  interest_rate numeric(6,3),
  term_months int not null check (term_months > 0),
  installment_amount numeric(18,2) not null check (installment_amount > 0),
  currency char(3) not null default 'IDR',
  account_id uuid references public.accounts(id) on delete set null,
  start_date date not null default current_date,
  next_due_date date not null default current_date,
  total_paid numeric(18,2) not null default 0,
  paid_count int not null default 0,
  status public.sys_loan_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_installments_updated_at on public.installments;
create trigger trg_installments_updated_at before update on public.installments
  for each row execute function public.set_updated_at();
create index if not exists idx_installments_org_due on public.installments(organization_id, next_due_date);

-- ===== budgets (anggaran) =====
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  category_id uuid references public.categories(id) on delete cascade,
  period public.sys_budget_period not null default 'monthly',
  amount numeric(18,2) not null check (amount > 0),
  start_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_budgets_updated_at on public.budgets;
create trigger trg_budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

-- ===== savings_goals (target) =====
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  target_amount numeric(18,2) not null check (target_amount > 0),
  current_amount numeric(18,2) not null default 0,
  currency char(3) not null default 'IDR',
  target_date date,
  account_id uuid references public.accounts(id) on delete set null,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_goals_updated_at on public.savings_goals;
create trigger trg_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();

-- =========================================================================
-- RPCs
-- =========================================================================
create or replace function public.create_bill(
  p_name text, p_amount numeric, p_account_id uuid default null,
  p_category_id uuid default null, p_frequency public.sys_frequency default 'monthly',
  p_start_date date default null, p_auto_pay boolean default false
) returns public.bills language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_row public.bills;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus > 0'; end if;
  if p_account_id is null then raise exception 'Pilih akun pembayaran'; end if;
  select organization_id into v_org from public.accounts where id = p_account_id and deleted_at is null;
  if v_org is null then raise exception 'Akun tidak ditemukan'; end if;
  if public.org_role(v_org) not in ('owner','admin') then raise exception 'Hanya owner/admin'; end if;
  insert into public.bills (organization_id, name, amount, account_id, category_id, frequency, start_date, next_due_date, auto_pay)
  values (v_org, p_name, p_amount, p_account_id, p_category_id, p_frequency, coalesce(p_start_date,current_date), coalesce(p_start_date,current_date), p_auto_pay)
  returning * into v_row;
  return v_row;
end; $$;
grant execute on function public.create_bill(text, numeric, uuid, uuid, public.sys_frequency, date, boolean) to authenticated;

create or replace function public.pay_bill(p_bill uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; v_org uuid;
begin
  select * into b from public.bills where id = p_bill;
  if not found then raise exception 'Tagihan tidak ditemukan'; end if;
  v_org := b.organization_id;
  if public.org_role(v_org) not in ('owner','admin','member') then raise exception 'Tidak diizinkan'; end if;

  insert into public.transactions (organization_id, account_id, type, amount, category_id, description, transaction_date, created_by, source, source_ref)
  values (v_org, b.account_id, 'expense'::public.sys_tx_type, b.amount, b.category_id, 'Tagihan: ' || b.name, current_date, auth.uid(), 'recurring'::public.sys_tx_source, 'bill:' || b.id);

  if b.frequency = 'once' then
    update public.bills set is_paid = true, last_paid_at = now() where id = p_bill;
  else
    update public.bills set is_paid = false, last_paid_at = now(),
      next_due_date = case b.frequency
        when 'weekly' then (b.next_due_date + interval '7 days')::date
        when 'monthly' then (b.next_due_date + interval '1 month')::date
        when 'yearly' then (b.next_due_date + interval '1 year')::date
        else b.next_due_date
      end
    where id = p_bill;
  end if;
end; $$;
grant execute on function public.pay_bill(uuid) to authenticated;

create or replace function public.pay_installment(p_installment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i record; v_org uuid;
begin
  select * into i from public.installments where id = p_installment;
  if not found then raise exception 'Cicilan tidak ditemukan'; end if;
  v_org := i.organization_id;
  if public.org_role(v_org) not in ('owner','admin','member') then raise exception 'Tidak diizinkan'; end if;

  if i.account_id is not null then
    insert into public.transactions (organization_id, account_id, type, amount, description, transaction_date, created_by, source, source_ref)
    values (v_org, i.account_id, 'expense'::public.sys_tx_type, i.installment_amount, 'Cicilan: ' || i.name, current_date, auth.uid(), 'recurring'::public.sys_tx_source, 'installment:' || i.id);
  end if;

  update public.installments set
    total_paid = total_paid + installment_amount,
    paid_count = paid_count + 1,
    next_due_date = (next_due_date + interval '1 month')::date,
    status = case when paid_count + 1 >= term_months then 'paid'::public.sys_loan_status else status end
  where id = p_installment;
end; $$;
grant execute on function public.pay_installment(uuid) to authenticated;

create or replace function public.contribute_to_goal(p_goal uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus > 0'; end if;
  select organization_id into v_org from public.savings_goals where id = p_goal;
  if v_org is null then raise exception 'Target tidak ditemukan'; end if;
  if public.org_role(v_org) not in ('owner','admin','member') then raise exception 'Tidak diizinkan'; end if;
  update public.savings_goals set
    current_amount = current_amount + p_amount,
    is_completed = (current_amount + p_amount >= target_amount)
  where id = p_goal;
end; $$;
grant execute on function public.contribute_to_goal(uuid, numeric) to authenticated;

-- =========================================================================
-- RLS (members read; owner/admin manage for bills/loans/installments/goals;
-- budgets: members read + manage per RBAC matrix)
-- =========================================================================
alter table public.bills enable row level security;
alter table public.loans enable row level security;
alter table public.installments enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;

-- generic member-read / admin-write policy template applied per table
drop policy if exists "bills member select" on public.bills;
create policy "bills member select" on public.bills
  for select using (public.is_org_member(organization_id));
drop policy if exists "bills admin write" on public.bills;
create policy "bills admin write" on public.bills
  for all using (public.org_role(organization_id) in ('owner','admin'))
  with check (public.org_role(organization_id) in ('owner','admin'));

drop policy if exists "loans member select" on public.loans;
create policy "loans member select" on public.loans
  for select using (public.is_org_member(organization_id));
drop policy if exists "loans admin write" on public.loans;
create policy "loans admin write" on public.loans
  for all using (public.org_role(organization_id) in ('owner','admin'))
  with check (public.org_role(organization_id) in ('owner','admin'));

drop policy if exists "installments member select" on public.installments;
create policy "installments member select" on public.installments
  for select using (public.is_org_member(organization_id));
drop policy if exists "installments admin write" on public.installments;
create policy "installments admin write" on public.installments
  for all using (public.org_role(organization_id) in ('owner','admin'))
  with check (public.org_role(organization_id) in ('owner','admin'));

drop policy if exists "budgets member select" on public.budgets;
create policy "budgets member select" on public.budgets
  for select using (public.is_org_member(organization_id));
drop policy if exists "budgets member write" on public.budgets;
create policy "budgets member write" on public.budgets
  for all using (public.org_role(organization_id) in ('owner','admin','member'))
  with check (public.org_role(organization_id) in ('owner','admin','member'));

drop policy if exists "goals member select" on public.savings_goals;
create policy "goals member select" on public.savings_goals
  for select using (public.is_org_member(organization_id));
drop policy if exists "goals member write" on public.savings_goals;
create policy "goals member write" on public.savings_goals
  for all using (public.org_role(organization_id) in ('owner','admin','member'))
  with check (public.org_role(organization_id) in ('owner','admin','member'));
