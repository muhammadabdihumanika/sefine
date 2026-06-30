-- 0012: payment-account consistency.
--
-- Every payment/receipt MUST debit/credit a real account so balances stay
-- correct and the source is always known. Two fixes:
--
--   1. pay_installment previously did `if account_id is not null then insert
--      expense` — so an installment with no account was marked paid with NO
--      transaction and NO balance deduction (money from "unknown account").
--      Now it requires an account and always records the expense.
--
--   2. pay_bill could create a dangling expense (account_id null) if the bill's
--      account had been hard-deleted (FK on delete set null). Now it refuses
--      with a clear message instead.

create or replace function public.pay_installment(p_installment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i record;
  v_org uuid;
begin
  select * into i from public.installments where id = p_installment;
  if not found then
    raise exception 'Cicilan tidak ditemukan';
  end if;
  v_org := i.organization_id;
  if public.org_role(v_org) not in ('owner','admin','member') then
    raise exception 'Tidak diizinkan';
  end if;
  if i.account_id is null then
    raise exception 'Cicilan belum punya akun pembayaran. Edit cicilan tersebut dan pilih akun.';
  end if;

  insert into public.transactions
    (organization_id, account_id, type, amount, description, transaction_date, created_by, source, source_ref)
  values
    (v_org, i.account_id, 'expense'::public.sys_tx_type, i.installment_amount,
     'Cicilan: ' || i.name, current_date, auth.uid(),
     'recurring'::public.sys_tx_source, 'installment:' || i.id);

  update public.installments set
    total_paid = total_paid + installment_amount,
    paid_count = paid_count + 1,
    next_due_date = (next_due_date + interval '1 month')::date,
    status = case when paid_count + 1 >= term_months then 'paid'::public.sys_loan_status else status end
  where id = p_installment;
end;
$$;

grant execute on function public.pay_installment(uuid) to authenticated;


create or replace function public.pay_bill(p_bill uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_org uuid;
  v_new date;
begin
  select * into b from public.bills where id = p_bill;
  if not found then
    raise exception 'Tagihan tidak ditemukan';
  end if;
  v_org := b.organization_id;
  if public.org_role(v_org) not in ('owner','admin','member') then
    raise exception 'Tidak diizinkan';
  end if;
  if b.account_id is null then
    raise exception 'Tagihan belum punya akun pembayaran. Edit tagihan tersebut dan pilih akun.';
  end if;

  insert into public.transactions
    (organization_id, account_id, type, amount, category_id, description, transaction_date, created_by, source, source_ref)
  values
    (v_org, b.account_id, 'expense'::public.sys_tx_type, b.amount, b.category_id,
     'Tagihan: ' || b.name, current_date, auth.uid(),
     'recurring'::public.sys_tx_source, 'bill:' || b.id);

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
      update public.bills set is_paid = true, last_paid_at = now(), next_due_date = v_new where id = p_bill;
    else
      update public.bills set is_paid = false, last_paid_at = now(), next_due_date = v_new where id = p_bill;
    end if;
  end if;
end;
$$;

grant execute on function public.pay_bill(uuid) to authenticated;
