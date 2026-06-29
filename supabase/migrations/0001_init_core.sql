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
