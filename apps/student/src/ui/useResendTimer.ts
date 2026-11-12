import { useCallback, useEffect, useState } from 'react';

/** Countdown for "Resend code in 0:30". */
export function useResendTimer(seconds = 30) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const restart = useCallback(() => setLeft(seconds), [seconds]);
  return { left, canResend: left <= 0, restart, label: `0:${String(Math.max(left, 0)).padStart(2, '0')}` };
}

export const maskTarget = (t: string) => (t.includes('@') ? t.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : t.replace(/^(\+\d{2})(\d{2})\d+(\d{2})$/, '$1 $2••••••$3'));
