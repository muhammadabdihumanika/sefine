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
