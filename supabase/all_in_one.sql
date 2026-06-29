-- Sefine — skema lengkap (gabungan 0001..0010). Paste ke SQL Editor sekali.


-- ========== 0001_init_core.sql ==========

-- =========================================================================
-- 0001_init_core.sql — identity, organizations, RBAC, RLS, RPCs
-- =========================================================================
create extension if not exists "pgcrypto";

-- ===== Enums =====
do $$ begin
  create type public.sys_org_role as enum ('owner', 'admin', 'member', 'viewer');
exception when duplicate_object then null; end $$;

-- ===== updated_at helper =====
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ===== profiles (1:1 auth.users) =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  default_currency char(3) not null default 'IDR',
  active_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ===== organizations =====
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  base_currency char(3) not null default 'IDR',
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

-- link active org fk (after organizations exists)
alter table public.profiles
  drop constraint if exists profiles_active_organization_id_fkey;
alter table public.profiles
  add constraint profiles_active_organization_id_fkey
  foreign key (active_organization_id) references public.organizations(id) on delete set null;

-- invite_code default must not depend on pgcrypto search_path (gen_random_uuid is core/pg_catalog)
alter table public.organizations alter column invite_code set default
  substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

-- ===== organization_members =====
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.sys_org_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org on public.organization_members(organization_id);

-- ===== organization_permissions (RBAC overrides, optional) =====
create table if not exists public.organization_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.sys_org_role not null,
  permissions jsonb not null default '{}'::jsonb,
  primary key (organization_id, role)
);

-- ===== auto-create profile on signup =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      case when new.email is not null then split_part(new.email, '@', 1) else null end
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- RLS helper functions (SECURITY DEFINER, avoid recursion)
-- =========================================================================
create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role(_org uuid)
returns public.sys_org_role language sql stable security definer set search_path = public as $$
  select m.role from public.organization_members m
  where m.organization_id = _org and m.user_id = auth.uid();
$$;

-- =========================================================================
-- RPCs (security definer; authoritative org operations)
-- =========================================================================
create or replace function public.create_organization(p_name text, p_currency char(3) default 'IDR')
returns public.organizations language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'Nama organisasi wajib diisi'; end if;
  v_slug := btrim(lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g')), '-');
  if v_slug = '' then v_slug := 'org'; end if;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  insert into public.organizations (name, slug, base_currency, created_by)
    values (btrim(p_name), v_slug, coalesce(nullif(p_currency, ''), 'IDR'), auth.uid())
    returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
    values (v_org.id, auth.uid(), 'owner'::public.sys_org_role);

  update public.profiles set active_organization_id = v_org.id where id = auth.uid();
  return v_org;
end; $$;
grant execute on function public.create_organization(text, char) to authenticated;

create or replace function public.join_organization(p_invite_code text)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare v_org public.organizations;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_org from public.organizations
    where invite_code = p_invite_code and deleted_at is null;
  if not found then raise exception 'Kode undangan tidak valid'; end if;

  if not exists (
    select 1 from public.organization_members where organization_id = v_org.id and user_id = auth.uid()
  ) then
    insert into public.organization_members (organization_id, user_id, role)
      values (v_org.id, auth.uid(), 'member'::public.sys_org_role);
  end if;

  update public.profiles set active_organization_id = v_org.id where id = auth.uid();
  return v_org;
end; $$;
grant execute on function public.join_organization(text) to authenticated;

create or replace function public.set_active_organization(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Bukan anggota organisasi ini'; end if;
  update public.profiles set active_organization_id = p_org where id = auth.uid();
end; $$;
grant execute on function public.set_active_organization(uuid) to authenticated;

create or replace function public.regenerate_invite_code(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if public.org_role(p_org) not in ('owner', 'admin') then raise exception 'Tidak diizinkan'; end if;
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  update public.organizations set invite_code = v_code where id = p_org;
  return v_code;
end; $$;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

create or replace function public.add_member_by_email(
  p_org uuid, p_email text, p_role public.sys_org_role default 'member'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if public.org_role(p_org) not in ('owner', 'admin') then raise exception 'Hanya owner/admin yang dapat menambah anggota'; end if;
  if p_role = 'owner' and public.org_role(p_org) <> 'owner' then raise exception 'Hanya owner yang dapat menambah owner'; end if;
  select id into v_user from public.profiles where lower(email) = lower(btrim(p_email));
  if v_user is null then raise exception 'Pengguna belum terdaftar. Bagikan kode undangan agar mereka bisa mendaftar & bergabung.'; end if;
  insert into public.organization_members (organization_id, user_id, role)
    values (p_org, v_user, p_role)
    on conflict (organization_id, user_id) do update set role = excluded.role;
  return v_user;
end; $$;
grant execute on function public.add_member_by_email(uuid, text, public.sys_org_role) to authenticated;

create or replace function public.update_member_role(p_member uuid, p_role public.sys_org_role)
returns void language plpgsql security definer set search_path = public as $$
declare m_rec record; v_owner_count int;
begin
  select organization_id, user_id, role into m_rec from public.organization_members where id = p_member;
  if not found then raise exception 'Anggota tidak ditemukan'; end if;
  if public.org_role(m_rec.organization_id) <> 'owner' then raise exception 'Hanya owner yang dapat mengubah peran'; end if;
  if m_rec.user_id = auth.uid() then raise exception 'Tidak dapat mengubah peran sendiri'; end if;
  select count(*) into v_owner_count from public.organization_members
    where organization_id = m_rec.organization_id and role = 'owner';
  if m_rec.role = 'owner' and p_role <> 'owner' and v_owner_count <= 1 then
    raise exception 'Organisasi harus memiliki minimal satu owner';
  end if;
  update public.organization_members set role = p_role where id = p_member;
end; $$;
grant execute on function public.update_member_role(uuid, public.sys_org_role) to authenticated;

create or replace function public.remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m_rec record; v_owner_count int;
begin
  select organization_id, user_id, role into m_rec from public.organization_members where id = p_member;
  if not found then raise exception 'Anggota tidak ditemukan'; end if;
  if m_rec.user_id = auth.uid() then raise exception 'Gunakan "keluar organisasi" untuk diri sendiri'; end if;
  if public.org_role(m_rec.organization_id) not in ('owner', 'admin') then raise exception 'Tidak diizinkan'; end if;
  select count(*) into v_owner_count from public.organization_members
    where organization_id = m_rec.organization_id and role = 'owner';
  if m_rec.role = 'owner' and v_owner_count <= 1 then
    raise exception 'Tidak dapat menghapus owner terakhir';
  end if;
  delete from public.organization_members where id = p_member;
end; $$;
grant execute on function public.remove_member(uuid) to authenticated;

create or replace function public.leave_organization(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role public.sys_org_role; v_owner_count int;
begin
  v_role := public.org_role(p_org);
  if v_role is null then raise exception 'Bukan anggota organisasi ini'; end if;
  if v_role = 'owner' then
    select count(*) into v_owner_count from public.organization_members
      where organization_id = p_org and role = 'owner';
    if v_owner_count <= 1 then raise exception 'Anda satu-satunya owner. Tambahkan owner lain sebelum keluar.'; end if;
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = auth.uid();
  update public.profiles set active_organization_id = null
    where id = auth.uid() and active_organization_id = p_org;
end; $$;
grant execute on function public.leave_organization(uuid) to authenticated;

-- List members of an org WITH profile display info. Profiles are self-only
-- under RLS, so a security-definer function exposes minimal fields to fellow
-- members (name/email/avatar).
create or replace function public.list_org_members(p_org uuid)
returns table (
  id uuid,
  user_id uuid,
  role public.sys_org_role,
  joined_at timestamptz,
  email text,
  full_name text,
  avatar_url text
) language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, m.role, m.joined_at, p.email, p.full_name, p.avatar_url
  from public.organization_members m
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_org and public.is_org_member(p_org);
$$;
grant execute on function public.list_org_members(uuid) to authenticated;

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_permissions enable row level security;

-- profiles: self only
drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations: members read; creator insert; owner/admin update; owner delete
drop policy if exists "orgs members select" on public.organizations;
create policy "orgs members select" on public.organizations
  for select using (public.is_org_member(id));
drop policy if exists "orgs creator insert" on public.organizations;
create policy "orgs creator insert" on public.organizations
  for insert with check (created_by = auth.uid());
drop policy if exists "orgs admin update" on public.organizations;
create policy "orgs admin update" on public.organizations
  for update using (public.org_role(id) in ('owner', 'admin'))
  with check (public.org_role(id) in ('owner', 'admin'));
drop policy if exists "orgs owner delete" on public.organizations;
create policy "orgs owner delete" on public.organizations
  for delete using (public.org_role(id) = 'owner');

-- organization_members: members read; admin manage
drop policy if exists "members select in org" on public.organization_members;
create policy "members select in org" on public.organization_members
  for select using (public.is_org_member(organization_id));
drop policy if exists "members admin insert" on public.organization_members;
create policy "members admin insert" on public.organization_members
  for insert with check (public.org_role(organization_id) in ('owner', 'admin'));
drop policy if exists "members admin update" on public.organization_members;
create policy "members admin update" on public.organization_members
  for update using (public.org_role(organization_id) in ('owner', 'admin'))
  with check (public.org_role(organization_id) in ('owner', 'admin'));
drop policy if exists "members admin delete" on public.organization_members;
create policy "members admin delete" on public.organization_members
  for delete using (public.org_role(organization_id) in ('owner', 'admin'));

-- organization_permissions: owner/admin only
drop policy if exists "orgperms admin all" on public.organization_permissions;
create policy "orgperms admin all" on public.organization_permissions
  for all using (public.org_role(organization_id) in ('owner', 'admin'))
  with check (public.org_role(organization_id) in ('owner', 'admin'));


-- ========== 0002_finance.sql ==========

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


-- ========== 0003_recurring_credit.sql ==========

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


-- ========== 0004_ai_whatsapp.sql ==========

-- =========================================================================
-- 0004_ai_whatsapp.sql — WhatsApp links, AI provider config (encrypted),
-- AI messages/pending actions, inbound idempotency, generic settings.
-- =========================================================================

do $$ begin
  create type public.sys_ai_provider as enum ('anthropic','openai');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_ai_channel as enum ('whatsapp','web');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_wa_status as enum ('pending','verified','disabled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sys_settings_scope as enum ('org','user');
exception when duplicate_object then null; end $$;

-- ===== whatsapp_links (sender phone → user resolution) =====
create table if not exists public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone_number text not null,           -- E.164 normalized, e.g. 62812...
  phone_number_display text,
  status public.sys_wa_status not null default 'pending',
  verification_code text,
  code_expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_number)
);
drop trigger if exists trg_wa_links_updated_at on public.whatsapp_links;
create trigger trg_wa_links_updated_at before update on public.whatsapp_links
  for each row execute function public.set_updated_at();
create index if not exists idx_wa_links_user on public.whatsapp_links(user_id);
create index if not exists idx_wa_links_phone on public.whatsapp_links(phone_number);

-- ===== ai_provider_configs (encrypted API key, one active config per org) =====
create table if not exists public.ai_provider_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider public.sys_ai_provider not null,
  api_key_encrypted bytea not null,
  model text,
  is_active boolean not null default true,
  temperature numeric(3,2) not null default 0.3,
  max_tokens int not null default 2048,
  system_prompt_extra text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_aipc_updated_at on public.ai_provider_configs;
create trigger trg_aipc_updated_at before update on public.ai_provider_configs
  for each row execute function public.set_updated_at();

-- ===== ai_messages (conversation transcript) =====
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel public.sys_ai_channel not null default 'whatsapp',
  role text not null,             -- user | assistant | tool
  content jsonb not null default '{}'::jsonb,
  tool_name text,
  wa_message_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_org_user on public.ai_messages(organization_id, user_id, created_at);

-- ===== ai_pending_actions (awaiting user "YA" confirmation) =====
create table if not exists public.ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  payload jsonb not null,
  wa_message_id text,
  created_at timestamptz not null default now()
);

-- ===== wa_inbound (idempotency: dedupe by Meta message id) =====
create table if not exists public.wa_inbound (
  message_id text primary key,
  processed_at timestamptz not null default now()
);

-- ===== settings (generic org/user key-value) =====
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  scope public.sys_settings_scope not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'org' and organization_id is not null) or (scope = 'user' and user_id is not null))
);
drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
create unique index if not exists uniq_settings_org on public.settings(scope, organization_id, key) where scope = 'org';
create unique index if not exists uniq_settings_user on public.settings(scope, user_id, key) where scope = 'user';

-- =========================================================================
-- Encryption helpers (pgcrypto + Supabase Vault passphrase).
-- One-time setup: select vault.create_secret('<a-strong-passphrase>', 'sefine_ai_key');
-- =========================================================================
create or replace function public.ai_encryption_passphrase()
returns text language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select secret into v from vault.decrypted_secrets where name = 'sefine_ai_key' limit 1;
  return v;
end; $$;
grant execute on function public.ai_encryption_passphrase() to authenticated;

-- Upsert the org's AI provider config (owner/admin). Key is encrypted at rest.
create or replace function public.set_ai_provider_config(
  p_provider public.sys_ai_provider,
  p_api_key text,
  p_model text default null,
  p_temperature numeric default 0.3,
  p_max_tokens int default 2048,
  p_system_prompt_extra text default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_pass text;
begin
  select active_organization_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then raise exception 'Belum ada organisasi aktif'; end if;
  if public.org_role(v_org) not in ('owner','admin') then raise exception 'Hanya owner/admin'; end if;
  v_pass := public.ai_encryption_passphrase();
  if v_pass is null then
    raise exception 'Vault belum dikonfigurasi. Jalankan sekali: select vault.create_secret(''<passphrase>'', ''sefine_ai_key'');';
  end if;
  insert into public.ai_provider_configs
    (organization_id, provider, api_key_encrypted, model, is_active, temperature, max_tokens, system_prompt_extra)
  values (v_org, p_provider, pgp_sym_encrypt(p_api_key, v_pass), p_model, true, p_temperature, p_max_tokens, p_system_prompt_extra)
  on conflict (organization_id) do update set
    provider = excluded.provider,
    api_key_encrypted = excluded.api_key_encrypted,
    model = excluded.model,
    temperature = excluded.temperature,
    max_tokens = excluded.max_tokens,
    system_prompt_extra = excluded.system_prompt_extra,
    updated_at = now();
end; $$;
grant execute on function public.set_ai_provider_config(public.sys_ai_provider, text, text, numeric, int, text) to authenticated;

-- Decrypt the active provider key. SERVICE ROLE ONLY (Edge Functions).
create or replace function public.decrypt_ai_provider_key(p_org uuid)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare v_key text;
begin
  select pgp_sym_decrypt(api_key_encrypted, public.ai_encryption_passphrase()) into v_key
  from public.ai_provider_configs where organization_id = p_org and is_active;
  return v_key;
end; $$;
grant execute on function public.decrypt_ai_provider_key(uuid) to service_role;

-- Safe config (no key) for the UI — owner/admin read.
create or replace function public.get_ai_provider_config_safe()
returns table (
  provider public.sys_ai_provider, model text, is_active boolean,
  temperature numeric, max_tokens int, system_prompt_extra text
) language sql stable security definer set search_path = public as $$
  select provider, model, is_active, temperature, max_tokens, system_prompt_extra
  from public.ai_provider_configs c
  where c.organization_id = (select active_organization_id from public.profiles where id = auth.uid())
    and public.org_role(c.organization_id) in ('owner','admin');
$$;
grant execute on function public.get_ai_provider_config_safe() to authenticated;

-- ===== WhatsApp linking =====
create or replace function public.request_wa_verification(p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_clean text;
begin
  v_clean := regexp_replace(btrim(p_phone), '[^0-9]', '', 'g');
  if v_clean = '' then raise exception 'Nomor tidak valid'; end if;
  if v_clean ~ '^0' then v_clean := '62' || substring(v_clean from 2); end if;
  if v_clean !~ '^62' then v_clean := '62' || v_clean; end if;

  v_code := lpad(floor(random() * 900000 + 100000)::int::text, 6, '0');
  insert into public.whatsapp_links (user_id, phone_number, phone_number_display, status, verification_code, code_expires_at)
  values (auth.uid(), v_clean, p_phone, 'pending', v_code, now() + interval '10 minutes')
  on conflict (phone_number) do update set
    verification_code = excluded.verification_code,
    code_expires_at = excluded.code_expires_at,
    status = case when whatsapp_links.user_id = auth.uid() then 'pending' else whatsapp_links.status end
  where whatsapp_links.user_id = auth.uid();
  return v_code;
end; $$;
grant execute on function public.request_wa_verification(text) to authenticated;

create or replace function public.verify_wa(p_phone text, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_clean text; v_row record;
begin
  v_clean := regexp_replace(btrim(p_phone), '[^0-9]', '', 'g');
  if v_clean ~ '^0' then v_clean := '62' || substring(v_clean from 2); end if;
  if v_clean !~ '^62' then v_clean := '62' || v_clean; end if;
  select * into v_row from public.whatsapp_links where phone_number = v_clean and user_id = auth.uid();
  if not found then return false; end if;
  if v_row.verification_code = p_code and v_row.code_expires_at > now() then
    update public.whatsapp_links set status = 'verified', verified_at = now(), verification_code = null, code_expires_at = null where id = v_row.id;
    return true;
  end if;
  return false;
end; $$;
grant execute on function public.verify_wa(text, text) to authenticated;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.whatsapp_links enable row level security;
alter table public.ai_provider_configs enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_pending_actions enable row level security;
alter table public.wa_inbound enable row level security;
alter table public.settings enable row level security;

-- whatsapp_links: owner-only (self)
drop policy if exists "wa_links self select" on public.whatsapp_links;
create policy "wa_links self select" on public.whatsapp_links
  for select using (user_id = auth.uid());
drop policy if exists "wa_links self write" on public.whatsapp_links;
create policy "wa_links self write" on public.whatsapp_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ai_provider_configs: owner/admin read; writes only via RPC
drop policy if exists "aipc admin select" on public.ai_provider_configs;
create policy "aipc admin select" on public.ai_provider_configs
  for select using (public.org_role(organization_id) in ('owner','admin'));
drop policy if exists "aipc no direct write" on public.ai_provider_configs;
create policy "aipc no direct write" on public.ai_provider_configs
  for insert with check (false);

-- ai_messages / pending: members read own; service role writes (Edge Function)
drop policy if exists "ai_messages self select" on public.ai_messages;
create policy "ai_messages self select" on public.ai_messages
  for select using (user_id = auth.uid());
drop policy if exists "ai_pending self select" on public.ai_pending_actions;
create policy "ai_pending self select" on public.ai_pending_actions
  for select using (user_id = auth.uid());

-- wa_inbound: service role only (no client access)
drop policy if exists "wa_inbound none" on public.wa_inbound;
create policy "wa_inbound none" on public.wa_inbound
  for select using (false);

-- settings: org members read org settings (owner/admin write); user self
drop policy if exists "settings org select" on public.settings;
create policy "settings org select" on public.settings
  for select using (
    (scope = 'org' and public.is_org_member(organization_id))
    or (scope = 'user' and user_id = auth.uid())
  );
drop policy if exists "settings org admin write" on public.settings;
create policy "settings org admin write" on public.settings
  for all using (scope = 'org' and public.org_role(organization_id) in ('owner','admin'))
  with check (scope = 'org' and public.org_role(organization_id) in ('owner','admin'));
drop policy if exists "settings user self" on public.settings;
create policy "settings user self" on public.settings
  for all using (scope = 'user' and user_id = auth.uid())
  with check (scope = 'user' and user_id = auth.uid());


-- ========== 0005_reconcile.sql ==========

-- =========================================================================
-- 0005_reconcile.sql — default account per category + account reconciliation
-- =========================================================================

-- Default account to debit/credit when a category is chosen (e.g. "entertainment" → Bank A).
alter table public.categories
  add column if not exists default_account_id uuid references public.accounts(id) on delete set null;
comment on column public.categories.default_account_id is
  'Akun default saat transaksi dengan kategori ini (opsional).';

-- =========================================================================
-- Reconciliation: given an account + its REAL balance, record an adjustment
-- transaction so the recorded balance matches reality.
--   diff > 0  → actual higher than recorded → income (top-up)
--   diff < 0  → actual lower than recorded   → expense (write-down)
-- =========================================================================
create or replace function public.reconcile_account(
  p_account uuid,
  p_actual numeric
) returns table (
  recorded numeric,
  actual numeric,
  diff numeric,
  transaction_id uuid
) language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_recorded numeric;
  v_diff numeric;
  v_cat uuid;
  v_type public.sys_tx_type;
  v_cat_type public.sys_category_type;
  v_id uuid;
begin
  select a.organization_id into v_org
  from public.accounts a
  where a.id = p_account and a.deleted_at is null;
  if v_org is null then
    raise exception 'Akun tidak ditemukan';
  end if;
  if public.org_role(v_org) not in ('owner','admin','member') then
    raise exception 'Tidak diizinkan melakukan rekonsiliasi';
  end if;

  select ab.current_balance into v_recorded
  from public.account_balances ab where ab.id = p_account;

  v_diff := coalesce(p_actual, 0) - coalesce(v_recorded, 0);

  if v_diff = 0 then
    return query select coalesce(v_recorded, 0), coalesce(p_actual, 0), 0::numeric, null::uuid;
    return;
  end if;

  if v_diff > 0 then
    v_type := 'income'::public.sys_tx_type;
    v_cat_type := 'income'::public.sys_category_type;
  else
    v_type := 'expense'::public.sys_tx_type;
    v_cat_type := 'expense'::public.sys_category_type;
  end if;

  select c.id into v_cat
  from public.categories c
  where c.organization_id = v_org
    and lower(c.name) = 'penyesuaian saldo'
    and c.type = v_cat_type
  limit 1;

  if v_cat is null then
    insert into public.categories (organization_id, name, type, is_system)
    values (v_org, 'Penyesuaian saldo', v_cat_type, true)
    returning id into v_cat;
  end if;

  insert into public.transactions
    (organization_id, account_id, type, amount, category_id, description, transaction_date, created_by, source)
  values
    (v_org, p_account, v_type, abs(v_diff), v_cat, 'Rekonsiliasi saldo', current_date, auth.uid(), 'manual'::public.sys_tx_source)
  returning id into v_id;

  return query select coalesce(v_recorded, 0), coalesce(p_actual, 0), v_diff, v_id;
end; $$;
grant execute on function public.reconcile_account(uuid, numeric) to authenticated;


-- ========== 0006_bill_end_date.sql ==========

-- =========================================================================
-- 0006_bill_end_date.sql — recurring bills until an end date (month)
-- =========================================================================

alter table public.bills add column if not exists end_date date;
comment on column public.bills.end_date is
  'Tanggal akhir berulang (inklusif). Jika diisi, tagihan berhenti berulang setelah next_due_date melewatinya.';

-- create_bill now accepts an end date. Signature changed -> drop + create.
drop function if exists public.create_bill(text, numeric, uuid, uuid, public.sys_frequency, date, boolean);

create or replace function public.create_bill(
  p_name text, p_amount numeric, p_account_id uuid default null,
  p_category_id uuid default null, p_frequency public.sys_frequency default 'monthly',
  p_start_date date default null, p_end_date date default null, p_auto_pay boolean default false
) returns public.bills language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_row public.bills;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus > 0'; end if;
  if p_account_id is null then raise exception 'Pilih akun pembayaran'; end if;
  select organization_id into v_org from public.accounts where id = p_account_id and deleted_at is null;
  if v_org is null then raise exception 'Akun tidak ditemukan'; end if;
  if public.org_role(v_org) not in ('owner','admin') then raise exception 'Hanya owner/admin'; end if;

  insert into public.bills
    (organization_id, name, amount, account_id, category_id, frequency, start_date, next_due_date, end_date, auto_pay)
  values
    (v_org, p_name, p_amount, p_account_id, p_category_id, p_frequency,
     coalesce(p_start_date, current_date), coalesce(p_start_date, current_date), p_end_date, p_auto_pay)
  returning * into v_row;
  return v_row;
end; $$;
grant execute on function public.create_bill(text, numeric, uuid, uuid, public.sys_frequency, date, date, boolean) to authenticated;

-- pay_bill: stop recurring once the next due date passes end_date.
create or replace function public.pay_bill(p_bill uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; v_org uuid; v_new date;
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
    v_new := case b.frequency
      when 'weekly'  then (b.next_due_date + interval '7 days')::date
      when 'monthly' then (b.next_due_date + interval '1 month')::date
      when 'yearly'  then (b.next_due_date + interval '1 year')::date
      else b.next_due_date
    end;
    if b.end_date is not null and v_new > b.end_date then
      -- reached the configured end -> mark completed
      update public.bills set is_paid = true, last_paid_at = now(), next_due_date = v_new where id = p_bill;
    else
      update public.bills set is_paid = false, last_paid_at = now(), next_due_date = v_new where id = p_bill;
    end if;
  end if;
end; $$;
grant execute on function public.pay_bill(uuid) to authenticated;


-- ========== 0007_superadmin_credits.sql ==========

-- =========================================================================
-- 0007_superadmin_credits.sql — super admin, platform AI config, credit usage
-- =========================================================================

-- super admin flag (platform-level, above org roles)
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- platform AI config (singleton, managed by super admin; used by WA + chat)
create table if not exists public.platform_ai_config (
  id int primary key default 1 check (id = 1),
  provider public.sys_ai_provider not null default 'anthropic',
  api_key_encrypted bytea,
  model text,
  temperature numeric(3,2) not null default 0.3,
  max_tokens int not null default 2048,
  system_prompt_extra text,
  updated_at timestamptz not null default now()
);
insert into public.platform_ai_config (id) values (1) on conflict (id) do nothing;

-- curated models (super admin); surfaced in chat/model config
create table if not exists public.platform_models (
  id uuid primary key default gen_random_uuid(),
  provider public.sys_ai_provider not null,
  model_id text not null,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, model_id)
);

-- AI usage ledger (tokens + credits per call — foundation for subscription)
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete cascade,
  provider public.sys_ai_provider,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  credits numeric(12,3) not null default 0,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_user on public.ai_usage(user_id, created_at desc);
create index if not exists idx_ai_usage_org on public.ai_usage(organization_id, created_at desc);

-- =========================================================================
-- RPCs
-- =========================================================================
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.set_platform_ai_config(
  p_provider public.sys_ai_provider, p_api_key text, p_model text default null,
  p_temperature numeric default 0.3, p_max_tokens int default 2048, p_system_prompt_extra text default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_pass text;
begin
  if not public.is_super_admin() then raise exception 'Hanya super admin yang dapat mengonfigurasi AI'; end if;
  v_pass := public.ai_encryption_passphrase();
  if v_pass is null then
    raise exception 'Vault belum dikonfigurasi. Jalankan: select vault.create_secret(''<passphrase>'', ''sefine_ai_key'');';
  end if;
  update public.platform_ai_config set
    provider = p_provider,
    api_key_encrypted = pgp_sym_encrypt(p_api_key, v_pass),
    model = p_model,
    temperature = p_temperature,
    max_tokens = p_max_tokens,
    system_prompt_extra = p_system_prompt_extra,
    updated_at = now()
  where id = 1;
end; $$;
grant execute on function public.set_platform_ai_config(public.sys_ai_provider, text, text, numeric, int, text) to authenticated;

-- safe read (no key) — all authenticated (chat needs model/provider)
-- (drop first so re-runs don't fail when a later migration changes the return type)
drop function if exists public.get_platform_ai_config_safe();
create or replace function public.get_platform_ai_config_safe()
returns table (
  provider public.sys_ai_provider, model text, temperature numeric,
  max_tokens int, system_prompt_extra text, has_key boolean
) language sql stable security definer set search_path = public as $$
  select provider, model, temperature, max_tokens, system_prompt_extra, api_key_encrypted is not null
  from public.platform_ai_config where id = 1;
$$;
grant execute on function public.get_platform_ai_config_safe() to authenticated;

-- decrypt (service role only — Edge Functions)
create or replace function public.decrypt_platform_ai_key()
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare v text;
begin
  select pgp_sym_decrypt(api_key_encrypted, public.ai_encryption_passphrase()) into v
  from public.platform_ai_config where id = 1;
  return v;
end; $$;
grant execute on function public.decrypt_platform_ai_key() to service_role;

-- record usage (service role). credits = (in+out)/1000 (placeholder; tune later)
create or replace function public.record_ai_usage(
  p_user uuid, p_org uuid, p_provider public.sys_ai_provider, p_model text,
  p_input int, p_output int, p_source text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_usage (user_id, organization_id, provider, model, input_tokens, output_tokens, credits, source)
  values (p_user, p_org, p_provider, p_model, coalesce(p_input,0), coalesce(p_output,0),
          (coalesce(p_input,0) + coalesce(p_output,0)) / 1000.0, p_source);
end; $$;
grant execute on function public.record_ai_usage(uuid, uuid, public.sys_ai_provider, text, int, int, text) to service_role;

-- usage summary (super admin only)
create or replace function public.ai_usage_summary()
returns table (
  user_id uuid, email text, total_credits numeric, total_input int, total_output int, calls bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Hanya super admin'; end if;
  return query
    select u.user_id, p.email, coalesce(sum(u.credits),0), coalesce(sum(u.input_tokens),0),
           coalesce(sum(u.output_tokens),0), count(*)
    from public.ai_usage u left join public.profiles p on p.id = u.user_id
    group by u.user_id, p.email
    order by sum(u.credits) desc;
end; $$;
grant execute on function public.ai_usage_summary() to authenticated;

-- platform models CRUD (super admin)
create or replace function public.upsert_platform_model(
  p_provider public.sys_ai_provider, p_model_id text, p_label text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Hanya super admin'; end if;
  insert into public.platform_models (provider, model_id, label) values (p_provider, p_model_id, p_label)
  on conflict (provider, model_id) do update set label = excluded.label, is_active = true;
end; $$;
grant execute on function public.upsert_platform_model(public.sys_ai_provider, text, text) to authenticated;

create or replace function public.delete_platform_model(p_model uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Hanya super admin'; end if;
  delete from public.platform_models where id = p_model;
end; $$;
grant execute on function public.delete_platform_model(uuid) to authenticated;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.platform_ai_config enable row level security;
alter table public.platform_models enable row level security;
alter table public.ai_usage enable row level security;

-- platform_ai_config: never expose the key directly; reads via the safe RPC.
drop policy if exists "pac no read" on public.platform_ai_config;
create policy "pac no read" on public.platform_ai_config for select using (false);
drop policy if exists "pac no write" on public.platform_ai_config;
create policy "pac no write" on public.platform_ai_config for insert with check (false);

-- platform_models: all read; super admin writes via RPC
drop policy if exists "pm read" on public.platform_models;
create policy "pm read" on public.platform_models for select using (true);

-- ai_usage: service role writes; super admin reads via summary RPC
drop policy if exists "au no read" on public.ai_usage;
create policy "au no read" on public.ai_usage for select using (false);

-- designate the first super admin (run once, replace email):
-- update public.profiles set is_super_admin = true where email = 'you@email.com';


-- ========== 0008_provider_baseurl.sql ==========

-- =========================================================================
-- 0008_provider_baseurl.sql — custom base URL (OpenAI-compatible: 9router, dll.)
-- =========================================================================

alter table public.platform_ai_config
  add column if not exists base_url text;

-- set_platform_ai_config now accepts a base URL (signature changed -> drop + create)
drop function if exists public.set_platform_ai_config(public.sys_ai_provider, text, text, numeric, int, text);

create or replace function public.set_platform_ai_config(
  p_provider public.sys_ai_provider, p_api_key text, p_model text default null,
  p_temperature numeric default 0.3, p_max_tokens int default 2048,
  p_system_prompt_extra text default null, p_base_url text default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_pass text; v_existing bytea;
begin
  if not public.is_super_admin() then raise exception 'Hanya super admin yang dapat mengonfigurasi AI'; end if;
  v_pass := public.ai_encryption_passphrase();
  if v_pass is null then
    raise exception 'Vault belum dikonfigurasi. Jalankan: select vault.create_secret(''<passphrase>'', ''sefine_ai_key'');';
  end if;
  -- keep the existing key when the field is left blank (editing other fields)
  select api_key_encrypted into v_existing from public.platform_ai_config where id = 1;
  if coalesce(p_api_key, '') = '' and v_existing is null then
    raise exception 'API key wajib diisi saat pengaturan pertama';
  end if;
  update public.platform_ai_config set
    provider = p_provider,
    api_key_encrypted = case when coalesce(p_api_key, '') = '' then api_key_encrypted else pgp_sym_encrypt(p_api_key, v_pass) end,
    model = p_model,
    temperature = p_temperature,
    max_tokens = p_max_tokens,
    system_prompt_extra = p_system_prompt_extra,
    base_url = nullif(p_base_url, ''),
    updated_at = now()
  where id = 1;
end; $$;
grant execute on function public.set_platform_ai_config(public.sys_ai_provider, text, text, numeric, int, text, text) to authenticated;

-- safe read now includes base_url (return type changed -> drop + create)
drop function if exists public.get_platform_ai_config_safe();

create or replace function public.get_platform_ai_config_safe()
returns table (
  provider public.sys_ai_provider, model text, temperature numeric,
  max_tokens int, system_prompt_extra text, has_key boolean, base_url text
) language sql stable security definer set search_path = public as $$
  select provider, model, temperature, max_tokens, system_prompt_extra,
         api_key_encrypted is not null, base_url
  from public.platform_ai_config where id = 1;
$$;
grant execute on function public.get_platform_ai_config_safe() to authenticated;


-- ========== 0009_ai_conversations.sql ==========

-- =========================================================================
-- 0009_ai_conversations.sql — chat sessions (web): continue / new / history
-- =========================================================================

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel public.sys_ai_channel not null default 'web',
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conv_user on public.ai_conversations(user_id, organization_id, updated_at desc);

alter table public.ai_conversations enable row level security;
drop policy if exists "conv self" on public.ai_conversations;
create policy "conv self" on public.ai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- link messages to a conversation
alter table public.ai_messages add column if not exists conversation_id uuid
  references public.ai_conversations(id) on delete cascade;
create index if not exists idx_ai_messages_conv on public.ai_messages(conversation_id, created_at);


-- ========== 0010_recurring_income.sql ==========

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

-- =========================================================================
-- 0011: delete an organization (owner only, requires another org to land on)
-- =========================================================================
create or replace function public.delete_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.sys_org_role;
  v_other uuid;
begin
  v_role := public.org_role(p_org);
  if v_role is null then
    raise exception 'Bukan anggota organisasi ini';
  end if;
  if v_role <> 'owner' then
    raise exception 'Hanya owner yang dapat menghapus organisasi. Gunakan Keluar untuk meninggalkannya.';
  end if;

  select om.organization_id into v_other
    from public.organization_members om
    where om.user_id = auth.uid() and om.organization_id <> p_org
    order by om.joined_at
    limit 1;
  if v_other is null then
    raise exception 'Tidak dapat menghapus organisasi satu-satunya Anda.';
  end if;

  update public.profiles
    set active_organization_id = v_other
    where id = auth.uid()
      and (active_organization_id is null or active_organization_id = p_org);

  delete from public.organizations where id = p_org;
end;
$$;

grant execute on function public.delete_organization(uuid) to authenticated;

