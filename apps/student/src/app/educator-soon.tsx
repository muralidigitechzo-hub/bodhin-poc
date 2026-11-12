import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Soon } from '@/ui/Soon';

export default function EducatorSoon() {
  const { f = 'This screen', step = 'a later step' } = useLocalSearchParams<{ f?: string; step?: string }>();
  return <Soon title={f} step={step} back />;
}
