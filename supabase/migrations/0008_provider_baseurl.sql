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
