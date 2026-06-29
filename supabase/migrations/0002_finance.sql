-- =========================================================================
-- 0002_finance.sql — accounts, categories, transactions, balances view, RPCs
-- =========================================================================

do $$ begin
  create type public.sys_account_type as enum ('cash','bank','ewallet','credit','investment');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_category_type as enum ('income','expense','transfer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_tx_type as enum ('income','expense','transfer_debit','transfer_credit');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_tx_source as enum ('manual','wa_assistant','import','recurring');
exception when duplicate_object then null; end $$;

-- ===== accounts =====
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type public.sys_account_type not null default 'cash',
  balance numeric(18,2) not null default 0,       -- opening balance
  currency char(3) not null default 'IDR',
  institution text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
drop trigger if exists trg_accounts_updated_at on public.accounts;
create trigger trg_accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create index if not exists idx_accounts_org on public.accounts(organization_id);

-- ===== categories =====
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type public.sys_category_type not null,
  parent_id uuid references public.categories(id) on delete set null,
  icon text,
  color text,
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_categories_org_type on public.categories(organization_id, type);

-- ===== transactions (ledger; one row per leg) =====
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  type public.sys_tx_type not null,
  amount numeric(18,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  description text,
  transaction_date date not null default current_date,
  transfer_pair_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  source public.sys_tx_source not null default 'manual',
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create index if not exists idx_tx_org_date on public.transactions(organization_id, transaction_date desc);
create index if not exists idx_tx_account on public.transactions(account_id);
create index if not exists idx_tx_category on public.transactions(category_id);
create index if not exists idx_tx_pair on public.transactions(transfer_pair_id) where transfer_pair_id is not null;

-- ===== balances view (opening + net movement; RLS-respecting) =====
create or replace view public.account_balances as
select
  a.id, a.organization_id, a.name, a.type, a.currency, a.institution,
  a.is_archived, a.balance as opening_balance,
  coalesce(
    sum(case when t.type in ('income','transfer_credit') then t.amount else 0 end)
    - sum(case when t.type in ('expense','transfer_debit') then t.amount else 0 end),
    0
  ) as movement,
  a.balance + coalesce(
    sum(case when t.type in ('income','transfer_credit') then t.amount else 0 end)
    - sum(case when t.type in ('expense','transfer_debit') then t.amount else 0 end),
    0
  ) as current_balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id and t.deleted_at is null
where a.deleted_at is null
group by a.id;

-- =========================================================================
-- RPCs
-- =========================================================================
create or replace function public.create_transaction(
  p_type text,
  p_amount numeric,
  p_account_id uuid,
  p_to_account_id uuid default null,
  p_category_id uuid default null,
  p_description text default null,
  p_date date default null,
  p_source public.sys_tx_source default 'manual',
  p_source_ref text default null
) returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_pair uuid;
  v_row public.transactions;
  v_tx_type public.sys_tx_type;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select organization_id into v_org from public.accounts where id = p_account_id and deleted_at is null;
  if v_org is null then raise exception 'Akun tidak ditemukan'; end if;
  if public.org_role(v_org) not in ('owner','admin','member') then
    raise exception 'Peran Anda tidak diizinkan mencatat transaksi';
  end if;

  if p_type = 'income' or p_type = 'expense' then
    v_tx_type := p_type::public.sys_tx_type;
    insert into public.transactions
      (organization_id, account_id, type, amount, category_id, description, transaction_date, created_by, source, source_ref)
    values (v_org, p_account_id, v_tx_type, p_amount, p_category_id, p_description, coalesce(p_date, current_date), auth.uid(), p_source, p_source_ref)
    returning * into v_row;
  elsif p_type = 'transfer' then
    if p_to_account_id is null then raise exception 'Akun tujuan wajib untuk transfer'; end if;
    if p_to_account_id = p_account_id then raise exception 'Akun asal dan tujuan tidak boleh sama'; end if;
    if not exists (select 1 from public.accounts where id = p_to_account_id and organization_id = v_org and deleted_at is null) then
      raise exception 'Akun tujuan tidak valid';
    end if;
    v_pair := gen_random_uuid();
    insert into public.transactions
      (organization_id, account_id, type, amount, description, transaction_date, transfer_pair_id, created_by, source, source_ref)
    values (v_org, p_account_id, 'transfer_debit'::public.sys_tx_type, p_amount, p_description, coalesce(p_date, current_date), v_pair, auth.uid(), p_source, p_source_ref);
    insert into public.transactions
      (organization_id, account_id, type, amount, description, transaction_date, transfer_pair_id, created_by, source, source_ref)
    values (v_org, p_to_account_id, 'transfer_credit'::public.sys_tx_type, p_amount, p_description, coalesce(p_date, current_date), v_pair, auth.uid(), p_source, p_source_ref);
    select * into v_row from public.transactions where transfer_pair_id = v_pair and type = 'transfer_debit' limit 1;
  else
    raise exception 'Tipe transaksi tidak valid (income/expense/transfer)';
  end if;

  return v_row;
end; $$;
grant execute on function public.create_transaction(text, numeric, uuid, uuid, uuid, text, date, public.sys_tx_source, text) to authenticated;

create or replace function public.update_transaction(
  p_id uuid,
  p_amount numeric default null,
  p_category_id uuid default null,
  p_description text default null,
  p_date date default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_type public.sys_tx_type; v_by uuid; v_pair uuid; v_can boolean;
begin
  select organization_id, type, created_by, transfer_pair_id into v_org, v_type, v_by, v_pair
  from public.transactions where id = p_id and deleted_at is null;
  if v_org is null then raise exception 'Transaksi tidak ditemukan'; end if;

  if public.org_role(v_org) in ('owner','admin') then
    v_can := true;
  elseif public.org_role(v_org) = 'member' and v_by = auth.uid() then
    v_can := true;
  else
    v_can := false;
  end if;
  if not v_can then raise exception 'Tidak diizinkan mengubah transaksi ini'; end if;

  if p_amount is not null and p_amount <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;

  if v_pair is not null then
    update public.transactions set
      amount = coalesce(p_amount, amount),
      description = coalesce(p_description, description),
      transaction_date = coalesce(p_date, transaction_date)
    where transfer_pair_id = v_pair;
  else
    update public.transactions set
      amount = coalesce(p_amount, amount),
      category_id = coalesce(p_category_id, category_id),
      description = coalesce(p_description, description),
      transaction_date = coalesce(p_date, transaction_date)
    where id = p_id;
  end if;
end; $$;
grant execute on function public.update_transaction(uuid, numeric, uuid, text, date) to authenticated;

create or replace function public.delete_transaction(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_pair uuid;
begin
  select organization_id, transfer_pair_id into v_org, v_pair
  from public.transactions where id = p_id and deleted_at is null;
  if v_org is null then raise exception 'Transaksi tidak ditemukan'; end if;
  if public.org_role(v_org) not in ('owner','admin') then
    raise exception 'Hanya owner/admin yang dapat menghapus transaksi';
  end if;
  if v_pair is not null then
    update public.transactions set deleted_at = now() where transfer_pair_id = v_pair;
  else
    update public.transactions set deleted_at = now() where id = p_id;
  end if;
end; $$;
grant execute on function public.delete_transaction(uuid) to authenticated;

-- Seed default categories for an org (idempotent). Called lazily from the app.
create or replace function public.ensure_default_categories(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Bukan anggota'; end if;
  if exists (select 1 from public.categories where organization_id = p_org) then return; end if;

  insert into public.categories (organization_id, type, name, icon, sort_order, is_system)
  values
    (p_org,'income','Gaji','wallet', 1, true),
    (p_org,'income','Bonus','gift', 2, true),
    (p_org,'income','Investasi','trending-up', 3, true),
    (p_org,'income','Lainnya','plus', 99, true),
    (p_org,'expense','Makanan & Minuman','utensils', 1, true),
    (p_org,'expense','Transportasi','car', 2, true),
    (p_org,'expense','Belanja','shopping-bag', 3, true),
    (p_org,'expense','Tagihan','receipt', 4, true),
    (p_org,'expense','Hiburan','film', 5, true),
    (p_org,'expense','Kesehatan','heart-pulse', 6, true),
    (p_org,'expense','Pendidikan','graduation-cap', 7, true),
    (p_org,'expense','Lainnya','minus', 99, true);
end; $$;
grant execute on function public.ensure_default_categories(uuid) to authenticated;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-- accounts: members read; owner/admin manage
drop policy if exists "accounts member select" on public.accounts;
create policy "accounts member select" on public.accounts
  for select using (public.is_org_member(organization_id));
drop policy if exists "accounts admin insert" on public.accounts;
create policy "accounts admin insert" on public.accounts
  for insert with check (public.org_role(organization_id) in ('owner','admin'));
drop policy if exists "accounts admin update" on public.accounts;
create policy "accounts admin update" on public.accounts
  for update using (public.org_role(organization_id) in ('owner','admin'))
  with check (public.org_role(organization_id) in ('owner','admin'));
drop policy if exists "accounts admin delete" on public.accounts;
create policy "accounts admin delete" on public.accounts
  for delete using (public.org_role(organization_id) in ('owner','admin'));

-- categories: members read; owner/admin manage
drop policy if exists "categories member select" on public.categories;
create policy "categories member select" on public.categories
  for select using (public.is_org_member(organization_id));
drop policy if exists "categories admin insert" on public.categories;
create policy "categories admin insert" on public.categories
  for insert with check (public.org_role(organization_id) in ('owner','admin'));
drop policy if exists "categories admin update" on public.categories;
create policy "categories admin update" on public.categories
  for update using (public.org_role(organization_id) in ('owner','admin'))
  with check (public.org_role(organization_id) in ('owner','admin'));
drop policy if exists "categories admin delete" on public.categories;
create policy "categories admin delete" on public.categories
  for delete using (public.org_role(organization_id) in ('owner','admin'));

-- transactions: members read; non-viewer insert (direct; RPC is the main path)
drop policy if exists "tx member select" on public.transactions;
create policy "tx member select" on public.transactions
  for select using (public.is_org_member(organization_id));
drop policy if exists "tx member insert" on public.transactions;
create policy "tx member insert" on public.transactions
  for insert with check (public.is_org_member(organization_id) and public.org_role(organization_id) in ('owner','admin','member'));
