/**
 * RBAC — client/UX layer. The hard boundary is Postgres RLS + the org RPCs
 * (security definer). This mirrors the default permission matrix so the UI
 * can hide/disable actions and server actions can short-circuit with a
 * friendly 403-equivalent before hitting the DB.
 */

export type Role = "owner" | "admin" | "member" | "viewer";

export type Action =
  | "transaction.create"
  | "transaction.update.own"
  | "transaction.update.others"
  | "transaction.delete"
  | "account.manage"
  | "category.manage"
  | "budget.manage"
  | "bill.pay"
  | "loan.manage"
  | "member.invite"
  | "member.manage"
  | "role.manage"
  | "integration.manage"
  | "settings.manage";

export const ALL_ACTIONS: Action[] = [
  "transaction.create",
  "transaction.update.own",
  "transaction.update.others",
  "transaction.delete",
  "account.manage",
  "category.manage",
  "budget.manage",
  "bill.pay",
  "loan.manage",
  "member.invite",
  "member.manage",
  "role.manage",
  "integration.manage",
  "settings.manage",
];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Anggota",
  viewer: "Pengamat",
};

const adminActions: Action[] = ALL_ACTIONS.filter(
  (a) => a !== "role.manage" && a !== "settings.manage",
);

export const PERMISSIONS: Record<Role, Set<Action>> = {
  owner: new Set(ALL_ACTIONS),
  admin: new Set(adminActions),
  member: new Set<Action>([
    "transaction.create",
    "transaction.update.own",
    "budget.manage",
    "bill.pay",
  ]),
  viewer: new Set<Action>(),
};

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.has(action) ?? false;
}

export class PermissionError extends Error {}

export function assertCan(role: Role | null | undefined, action: Action): void {
  if (!can(role, action)) {
    throw new PermissionError(`Peran "${role ?? "-"}" tidak diizinkan: ${action}`);
  }
}
