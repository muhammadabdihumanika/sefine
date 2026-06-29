-- 0011: delete an organization.
--
-- Owner-only, and only allowed when the caller belongs to at least one OTHER
-- organization (so they always have somewhere to land). Repoints the caller's
-- active org if it was the one being deleted, then removes the org.
--
-- Cascades to every org-scoped table (organization_members, accounts,
-- categories, transactions, bills, loans, installments, budgets,
-- savings_goals, recurring_incomes, ...) — all FKs are ON DELETE CASCADE.
-- profiles.active_organization_id is ON DELETE SET NULL, but we repoint it
-- first so the user is never left with a dangling/null active org here.
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

  -- Need at least one other org to fall back to.
  select om.organization_id into v_other
    from public.organization_members om
    where om.user_id = auth.uid() and om.organization_id <> p_org
    order by om.joined_at
    limit 1;
  if v_other is null then
    raise exception 'Tidak dapat menghapus organisasi satu-satunya Anda.';
  end if;

  -- Repoint the active org if we are about to remove it.
  update public.profiles
    set active_organization_id = v_other
    where id = auth.uid()
      and (active_organization_id is null or active_organization_id = p_org);

  -- Cascade removes members, accounts, transactions, bills, loans, etc.
  delete from public.organizations where id = p_org;
end;
$$;

grant execute on function public.delete_organization(uuid) to authenticated;
