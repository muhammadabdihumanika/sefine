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
