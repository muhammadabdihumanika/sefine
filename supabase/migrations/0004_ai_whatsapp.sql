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
