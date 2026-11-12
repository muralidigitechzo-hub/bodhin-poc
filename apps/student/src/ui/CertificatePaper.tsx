/** Reusable certificate preview & viewer card, reflecting uploaded template image, custom text, and colors. */
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveCertTemplate, type CertTemplate } from '@/core/certification';
import { Txt } from './Txt';

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function CertificatePaper({
  template,
  recipientName,
  courseTitle,
  program = 'Course Completion',
  tutorName,
  issuedAt,
  certId = 'BODHIN-CERT-PREVIEW',
  compact = false,
}: {
  template?: Partial<CertTemplate> | null;
  recipientName: string;
  courseTitle: string;
  program?: string;
  tutorName: string;
  issuedAt: string;
  certId?: string;
  compact?: boolean;
}) {
  const t = resolveCertTemplate(template);
  return (
    <View style={[styles.paper, { borderColor: t.primaryColor, backgroundColor: t.bgColor, padding: compact ? 4 : 6 }]} accessibilityLabel={`Certificate of completion for ${recipientName}: ${courseTitle}`}>
      {!!t.backgroundImage && <Image source={{ uri: t.backgroundImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={[styles.inset, { borderColor: t.accentColor, padding: compact ? 10 : 14, backgroundColor: t.backgroundImage ? 'rgba(255,255,255,0.84)' : 'transparent' }]}>
        <Txt variant="caption" color={t.textColor} center style={{ letterSpacing: 2, fontWeight: '700', opacity: 0.75 }}>{t.orgName}</Txt>
        <Txt variant="title" color={t.textColor} center style={{ letterSpacing: 2, fontSize: compact ? 16 : 20, marginTop: compact ? 4 : 8 }}>{t.heading}</Txt>
        <Txt variant="caption" color={t.textColor} center style={{ letterSpacing: 3, opacity: 0.75 }}>{t.subheading}</Txt>
        <Txt variant="caption" color={t.textColor} center style={{ marginTop: compact ? 6 : 10, opacity: 0.7 }}>{t.introText}</Txt>
        <Txt variant="title" color={t.primaryColor} center style={{ fontStyle: 'italic', fontSize: compact ? 19 : 24 }}>{recipientName}</Txt>
        <View style={{ height: 1, backgroundColor: t.accentColor, opacity: 0.35, alignSelf: 'stretch', marginVertical: 4 }} />
        <Txt variant="caption" color={t.textColor} center style={{ opacity: 0.7 }}>{t.completionText}</Txt>
        <Txt variant="bodyStrong" color={t.textColor} center numberOfLines={2}>{courseTitle}</Txt>
        <Txt variant="caption" color={t.textColor} center style={{ opacity: 0.75 }}>{program}</Txt>
        <View style={[styles.sigs, compact && { marginTop: 8, marginBottom: 4 }]}>
          <View style={{ alignItems: 'center' }}>
            <Txt variant="label" color={t.textColor} style={{ fontStyle: 'italic' }}>{tutorName}</Txt>
            <Txt variant="caption" color={t.textColor} style={{ fontSize: 10, opacity: 0.65 }}>{t.instructorLabel}</Txt>
          </View>
          <Ionicons name="ribbon" size={compact ? 26 : 34} color={t.accentColor} />
          <View style={{ alignItems: 'center' }}>
            <Txt variant="label" color={t.textColor}>{fmtDay(issuedAt)}</Txt>
            <Txt variant="caption" color={t.textColor} style={{ fontSize: 10, opacity: 0.65 }}>Date of issue</Txt>
          </View>
        </View>
        <Txt variant="caption" color={t.textColor} center style={{ fontSize: 10, opacity: 0.65 }}>Verify at thebodhin.com/verify · {certId}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { borderWidth: 6, borderRadius: 8, overflow: 'hidden' },
  inset: { borderWidth: 1.5, borderRadius: 4, alignItems: 'center', gap: 2 },
  sigs: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', marginTop: 12, marginBottom: 6 },
});
