/** Admin portal › Certificate approvals for Bodhin's own courses. */
import React from 'react';
import { CertApprovals } from '@/ui/CertApprovals';

export default function AdminCertificates() {
  return <CertApprovals scope="admin" fallback="/admin" />;
}
