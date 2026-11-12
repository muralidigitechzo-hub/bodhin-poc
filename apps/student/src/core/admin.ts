/**
 * Super Admin roles & permissions. Pure TypeScript (no React).
 * One permission list per role; screens and the backend both check `can(role, perm)`.
 */
import type { Role } from './types';

export type AdminRole = Extract<Role, 'super_admin' | 'finance' | 'moderator' | 'support'>;
export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'finance', 'moderator', 'support'];
export const isAdminRole = (r: Role): r is AdminRole => (ADMIN_ROLES as Role[]).includes(r);

export type AdminPerm =
  | 'overview'
  | 'approvals.educators'
  | 'approvals.courses'
  | 'approvals.reports'
  | 'tenants.view'
  | 'tenants.manage' // plan change, overrides, suspend
  | 'plans.edit'
  | 'config.edit' // commission %, fees, payout rules
  | 'money.view'
  | 'payouts.run'
  | 'refunds'
  | 'content.bodhin' // Bodhin's own courses, marketplace curation
  | 'users.view'
  | 'users.manage'
  | 'support.tickets'
  | 'broadcast'
  | 'admins.manage'
  | 'audit.view';

const ALL: AdminPerm[] = ['overview', 'approvals.educators', 'approvals.courses', 'approvals.reports', 'tenants.view', 'tenants.manage', 'plans.edit', 'config.edit', 'money.view', 'payouts.run', 'refunds', 'content.bodhin', 'users.view', 'users.manage', 'support.tickets', 'broadcast', 'admins.manage', 'audit.view'];

export const ROLE_PERMS: Record<AdminRole, AdminPerm[]> = {
  super_admin: ALL,
  finance: ['overview', 'tenants.view', 'money.view', 'payouts.run', 'refunds', 'audit.view'],
  moderator: ['overview', 'approvals.educators', 'approvals.courses', 'approvals.reports', 'tenants.view', 'content.bodhin'],
  support: ['overview', 'tenants.view', 'users.view', 'users.manage', 'support.tickets'],
};

export const ROLE_LABEL: Record<AdminRole, string> = { super_admin: 'Super Admin', finance: 'Finance', moderator: 'Moderator', support: 'Support' };

export const can = (role: AdminRole | null | undefined, perm: AdminPerm) => !!role && ROLE_PERMS[role].includes(perm);

/** Every admin action is written to the audit log (who, what, on which record, before → after). */
export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string; // e.g. 'application.approve', 'config.update'
  target: { kind: 'tenant' | 'user' | 'course' | 'application' | 'config' | 'plan' | 'payout' | 'order' | 'admin' | 'report'; id: string; label: string };
  summary: string;
  before?: unknown;
  after?: unknown;
}
