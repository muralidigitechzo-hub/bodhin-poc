/** Tutor portal › Certificate approvals for courses made in this workspace. */
import React from 'react';
import { CertApprovals } from '@/ui/CertApprovals';

export default function EduCertificates() {
  return <CertApprovals scope="educator" fallback="/educator/more" />;
}
