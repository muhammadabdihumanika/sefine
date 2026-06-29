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
