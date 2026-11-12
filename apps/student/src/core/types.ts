/** Shared domain types — the data contract between app, web and the future backend. */
import type { PlanId } from './plans';
import type { TenantSubscription } from './business';

export type Role = 'student' | 'tutor' | 'owner' | 'super_admin' | 'finance' | 'moderator' | 'support';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string; // E.164, e.g. +919876543210
  phoneVerified: boolean;
  avatarUrl?: string;
  createdAt: string;
}

/** A user's role inside one workspace (a user can belong to several tenants). */
export interface Membership {
  userId: string;
  tenantId: string;
  role: Role;
}

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'changes_requested';

export interface EducatorApplication {
  id: string;
  userId: string;
  status: ApplicationStatus;
  submittedAt?: string;
  // details the Super Admin reviews (SA2)
  workspaceName?: string;
  subjects?: string[];
  experienceYears?: number;
  city?: string;
  plannedStudents?: number;
  sampleUrl?: string;
  idVerified?: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
  note?: string; // reason for rejection / changes requested
}

export interface TenantBranding {
  displayName: string;
  tagline?: string;
  primary: string; // main brand colour (buttons, active states)
  primaryDeep: string; // darker shade for gradients / hero cards
  accent: string; // highlight colour (headline accents, badges)
  logoUrl?: string; // null → Bodhin logo
  hidePoweredBy?: boolean; // white-label (Institute+)
}

export interface Tenant {
  id: string;
  slug: string; // → slug.thebodhin.com
  customDomain?: string; // verified custom domain, plan-dependent
  status: 'active' | 'suspended';
  plan: PlanId;
  branding: TenantBranding;
  subscription?: TenantSubscription;
  /** Tutor's own gateway for direct sales + bank account for Bodhin marketplace payouts. */
  payments?: { directGateway: 'razorpay' | 'cashfree' | null; directGatewayStatus: 'not_connected' | 'pending' | 'active'; payoutAccount: { bank: string; last4: string; verified: boolean } | null; gstin?: string };
  ownerUserId?: string;
  createdAt?: string;
  domain?: { host: string; status: 'pending_dns' | 'verifying' | 'active'; addedAt: string } | null;
}

export interface Coupon {
  id: string;
  tenantId: string;
  code: string;
  type: 'pct' | 'flat';
  value: number;
  courseIds: string[]; // empty = all workspace courses
  maxUses: number | null;
  used: number;
  startsAt: string;
  endsAt: string; // every offer is dated (no fake "ends tonight")
  paused: boolean;
  createdAt: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  no: string;
  at: string;
  description: string;
  amountInr: number; // incl. GST
  status: 'paid' | 'due' | 'failed';
}

export interface TeamInvite {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  courseIds: string[];
  sentAt: string;
}

export interface Session {
  user: User;
  memberships: Membership[];
  token: string;
}
